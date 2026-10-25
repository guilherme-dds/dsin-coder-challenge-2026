import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError, type EquipmentPayload } from "../api";
import { useAsync } from "../hooks";
import { AGENCY_LABELS, MAINTENANCE_LABELS, STATUS_LABELS, URGENCY } from "../labels";
import { DynamicFields } from "../components/DynamicFields";
import { CityMap, DEFAULT_CENTER } from "../components/CityMap";
import { SectionHeader } from "../components/SectionHeader";
import { CalendarClock, FileBadge, LocateFixed, MapPin, MousePointerClick, Search, SlidersHorizontal } from "lucide-react";
import type { Agency, EquipmentStatus, MaintenanceType } from "../types";

const empty: EquipmentPayload = {
  typeId: "",
  serialNumber: "",
  brand: "",
  model: "",
  status: "NAO_INSTALADO",
  agency: "TRANSITO",
  zipCode: "",
  street: "",
  reference: "",
  district: "",
  city: "",
  state: "",
  latitude: DEFAULT_CENTER[0],
  longitude: DEFAULT_CENTER[1],
  maintenanceType: "NENHUMA",
  nextMaintenanceAt: null,
  maintenanceIntervalDays: null,
  responsibleAgentId: null,
  attributes: {},
};

export function EquipmentForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [searchParams] = useSearchParams();

  const types = useAsync(api.equipmentTypes);
  const agents = useAsync(() => api.agents({ active: "true" }));
  // Vindo do "Cadastrar no mapa", a posição clicada já chega preenchida.
  const [form, setForm] = useState<EquipmentPayload>(() => {
    const lat = Number(searchParams.get("lat"));
    const lng = Number(searchParams.get("lng"));
    return lat && lng ? { ...empty, latitude: lat, longitude: lng } : empty;
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.equipment(id).then(({ type: _t, urgency: _u, connectivity: _c, lastSeenAt: _l, events: _e, allowedTransitions: _a, responsibleAgent: _r, ...rest }) =>
      setForm({ ...rest, nextMaintenanceAt: rest.nextMaintenanceAt?.slice(0, 10) ?? null }),
    );
  }, [id]);

  const selectedType = types.data?.find((t) => t.id === form.typeId);
  const focus = useMemo<[number, number]>(() => [form.latitude, form.longitude], [form.latitude, form.longitude]);
  const set = <K extends keyof EquipmentPayload>(key: K, value: EquipmentPayload[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Checkbox desmarcado significa "não", então booleanos já começam como false.
  const selectType = (typeId: string) => {
    const fields = types.data?.find((t) => t.id === typeId)?.attributesSchema ?? [];
    const attributes = Object.fromEntries(fields.filter((f) => f.type === "boolean").map((f) => [f.key, false]));
    setForm((f) => ({ ...f, typeId, attributes }));
  };

  const lookupCep = async () => {
    try {
      const address = await api.cep(form.zipCode);
      setForm((f) => ({ ...f, ...address }));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const useMyLocation = () =>
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm((f) => ({ ...f, latitude: pos.coords.latitude, longitude: pos.coords.longitude })),
      () => setError("Não foi possível obter a localização do dispositivo"),
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = isEdit ? await api.updateEquipment(id!, form) : await api.createEquipment(form);
      navigate(`/equipamentos/${saved.id}`);
    } catch (err) {
      const details = err instanceof ApiError && err.details ? ` — ${JSON.stringify(err.details)}` : "";
      setError((err as Error).message + details);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <header className="page-header">
        <div>
          <div className="eyebrow">{isEdit ? "Edição" : "Novo cadastro"}</div>
          <h1>{isEdit ? "Editar equipamento" : "Cadastrar equipamento"}</h1>
          <p className="muted">Cadastro no inventário inteligente da cidade.</p>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="card">
        <SectionHeader step={1} icon={FileBadge} title="Identificação" />
        <div className="grid-3">
          <label className="field">
            <span>Tipo de equipamento *</span>
            <select required value={form.typeId} onChange={(e) => selectType(e.target.value)}>
              <option value="">Selecione…</option>
              {types.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Número de série *</span>
            <input required value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} />
          </label>
          {!isEdit && (
            <label className="field">
              <span>Situação inicial</span>
              <select value={form.status} onChange={(e) => set("status", e.target.value as EquipmentStatus)}>
                {(["NAO_INSTALADO", "OPERACIONAL"] as const).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>Marca *</span>
            <input required value={form.brand} onChange={(e) => set("brand", e.target.value)} />
          </label>
          <label className="field">
            <span>Modelo *</span>
            <input required value={form.model} onChange={(e) => set("model", e.target.value)} />
          </label>
          <label className="field">
            <span>Órgão responsável *</span>
            <select required value={form.agency} onChange={(e) => set("agency", e.target.value as Agency)}>
              {(Object.keys(AGENCY_LABELS) as Agency[]).map((a) => (
                <option key={a} value={a}>
                  {AGENCY_LABELS[a]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {selectedType && (
        <section className="card">
          <SectionHeader step={2} icon={SlidersHorizontal} title={`Características · ${selectedType.name}`} />
          <DynamicFields fields={selectedType.attributesSchema} values={form.attributes} onChange={(v) => set("attributes", v)} />
        </section>
      )}

      <section className="card">
        <SectionHeader step={3} icon={MapPin} title={selectedType?.mobile ? "Localização da base" : "Local de instalação"} />
        <div className="grid-3">
          <label className="field">
            <span>CEP *</span>
            <div className="input-with-button">
              <input required value={form.zipCode} placeholder="00000-000" onChange={(e) => set("zipCode", e.target.value)} />
              <button type="button" className="button" onClick={lookupCep} title="Buscar endereço pelo CEP">
                <Search size={16} />
              </button>
            </div>
          </label>
          <label className="field">
            <span>Rua *</span>
            <input required value={form.street} onChange={(e) => set("street", e.target.value)} />
          </label>
          <label className="field">
            <span>Referência *</span>
            <input
              required
              value={form.reference}
              placeholder='"número 181", "KM 203", "em frente ao Mercado do Tio"'
              onChange={(e) => set("reference", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Bairro *</span>
            <input required value={form.district} onChange={(e) => set("district", e.target.value)} />
          </label>
          <label className="field">
            <span>Cidade *</span>
            <input required value={form.city} onChange={(e) => set("city", e.target.value)} />
          </label>
          <label className="field">
            <span>UF *</span>
            <input required maxLength={2} value={form.state} onChange={(e) => set("state", e.target.value.toUpperCase())} />
          </label>
          <label className="field">
            <span>Latitude *</span>
            <input required type="number" step="any" value={form.latitude} onChange={(e) => set("latitude", Number(e.target.value))} />
          </label>
          <label className="field">
            <span>Longitude *</span>
            <input required type="number" step="any" value={form.longitude} onChange={(e) => set("longitude", Number(e.target.value))} />
          </label>
          <div className="field">
            <span>&nbsp;</span>
            <button type="button" className="button" onClick={useMyLocation}>
              <LocateFixed size={16} /> Usar minha localização
            </button>
          </div>
        </div>
        <p className="hint">
          <MousePointerClick size={14} /> Clique no mapa para ajustar as coordenadas.
        </p>
        <CityMap
          height={300}
          focus={focus}
          markers={[
            {
              id: "novo",
              kind: "equipment",
              latitude: form.latitude,
              longitude: form.longitude,
              icon: selectedType?.code ?? "",
              color: URGENCY.PENDENTE.hex,
              title: "Posição do equipamento",
            },
          ]}
          onMapClick={(lat, lng) => setForm((f) => ({ ...f, latitude: lat, longitude: lng }))}
        />
      </section>

      <section className="card">
        <SectionHeader step={4} icon={CalendarClock} title="Plano de manutenção" />
        <div className="grid-3">
          <label className="field">
            <span>Necessidade de manutenção</span>
            <select value={form.maintenanceType} onChange={(e) => set("maintenanceType", e.target.value as MaintenanceType)}>
              {(Object.keys(MAINTENANCE_LABELS) as MaintenanceType[]).map((m) => (
                <option key={m} value={m}>
                  {MAINTENANCE_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Próxima manutenção</span>
            <input type="date" value={form.nextMaintenanceAt ?? ""} onChange={(e) => set("nextMaintenanceAt", e.target.value || null)} />
          </label>
          <label className="field">
            <span>Periodicidade (dias)</span>
            <input
              type="number"
              min={1}
              value={form.maintenanceIntervalDays ?? ""}
              onChange={(e) => set("maintenanceIntervalDays", e.target.value ? Number(e.target.value) : null)}
            />
          </label>
          {selectedType?.mobile && (
            <label className="field">
              <span>Agente responsável</span>
              <select value={form.responsibleAgentId ?? ""} onChange={(e) => set("responsibleAgentId", e.target.value || null)}>
                <option value="">Nenhum</option>
                {agents.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.registration})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      <div className="actions">
        <button type="button" className="button" onClick={() => navigate(-1)}>
          Cancelar
        </button>
        <button type="submit" className="button primary" disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}
