import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type AgentPayload } from "../api";
import { ROLE_LABELS, SHIFT_LABELS } from "../labels";
import type { AgentRole, Shift } from "../types";
import { SectionHeader } from "../components/SectionHeader";
import { IdCard, Building2, MapPin, MousePointerClick } from "lucide-react";
import { CityMap } from "../components/CityMap";

const empty: AgentPayload = {
  name: "",
  registration: "",
  role: "AGENTE_TRANSITO",
  rank: null,
  phone: null,
  email: null,
  shift: null,
  baseName: "",
  district: "",
  city: "",
  state: "",
  latitude: null,
  longitude: null,
  active: true,
};

export function AgentForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<AgentPayload>(empty);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) api.agent(id).then(setForm);
  }, [id]);

  const set = <K extends keyof AgentPayload>(key: K, value: AgentPayload[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await (id ? api.updateAgent(id, form) : api.createAgent(form));
      navigate("/agentes");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const text = (key: "name" | "registration" | "rank" | "phone" | "email" | "baseName" | "district" | "city", label: string, required = false) => (
    <label className="field">
      <span>
        {label}
        {required && " *"}
      </span>
      <input required={required} value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} />
    </label>
  );

  return (
    <form onSubmit={submit}>
      <header className="page-header">
        <div>
          <div className="eyebrow">Agentes</div>
          <h1>{id ? "Editar agente" : "Novo agente"}</h1>
        </div>
      </header>
      {error && <p className="error">{error}</p>}

      <section className="card">
        <SectionHeader step={1} icon={IdCard} title="Identificação" />
        <div className="grid-3">
          {text("name", "Nome", true)}
          {text("registration", "Matrícula", true)}
          <label className="field">
            <span>Função *</span>
            <select value={form.role} onChange={(e) => set("role", e.target.value as AgentRole)}>
              {(Object.keys(ROLE_LABELS) as AgentRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          {text("rank", "Posto / graduação")}
          {text("phone", "Telefone")}
          {text("email", "E-mail")}
        </div>
      </section>

      <section className="card">
        <SectionHeader step={2} icon={Building2} title="Lotação" />
        <div className="grid-3">
          {text("baseName", "Base", true)}
          {text("district", "Bairro", true)}
          {text("city", "Cidade", true)}
          <label className="field">
            <span>UF *</span>
            <input required maxLength={2} value={form.state} onChange={(e) => set("state", e.target.value.toUpperCase())} />
          </label>
          <label className="field">
            <span>Turno</span>
            <select value={form.shift ?? ""} onChange={(e) => set("shift", (e.target.value || null) as Shift | null)}>
              <option value="">Não definido</option>
              {(Object.keys(SHIFT_LABELS) as Shift[]).map((s) => (
                <option key={s} value={s}>
                  {SHIFT_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
            Ativo
          </label>
        </div>
      </section>

      <section className="card">
        <SectionHeader step={3} icon={MapPin} title="Posição no mapa operacional" />
        <p className="hint">
          <MousePointerClick size={14} /> Clique no mapa para marcar a base ou a área de atuação do agente.
        </p>
        <CityMap
          height={300}
          markers={
            form.latitude !== null && form.longitude !== null
              ? [
                  {
                    id: "agente",
                    kind: "agent",
                    latitude: form.latitude,
                    longitude: form.longitude,
                    icon: form.role,
                    color: "#ff6a2b",
                    title: form.name || "Agente",
                  },
                ]
              : []
          }
          onMapClick={(lat, lng) => setForm((f) => ({ ...f, latitude: lat, longitude: lng }))}
        />
      </section>

      <div className="actions">
        <button type="button" className="button" onClick={() => navigate(-1)}>
          Cancelar
        </button>
        <button type="submit" className="button primary">
          Salvar
        </button>
      </div>
    </form>
  );
}
