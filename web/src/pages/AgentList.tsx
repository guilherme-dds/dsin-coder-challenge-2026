import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { api } from "../api";
import { useAsync, useNow } from "../hooks";
import { FIELD_STATUS, ROLE_LABELS, SHIFT_LABELS, initials, timeAgo } from "../labels";
import { FieldStatusBadge } from "../components/Badges";
import { SummaryStrip } from "../components/SummaryStrip";
import { CityMap, type MapMarker } from "../components/CityMap";
import type { Agent, AgentFieldStatus, AgentRole } from "../types";

/** Agentes inativos ficam fora da contagem por situação, mas aparecem na lista. */
const INACTIVE = "INATIVO";

export function AgentList() {
  const now = useNow(5000);
  const { data, error } = useAsync(() => api.agents(), [], { refreshMs: 15_000 });
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<AgentRole | "">("");
  const [situation, setSituation] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);

  const agents = data ?? [];
  const situationOf = (a: Agent) => (a.active ? a.fieldStatus : INACTIVE);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return agents.filter(
      (a) =>
        (!role || a.role === role) &&
        (!situation || situationOf(a) === situation) &&
        (!term || [a.name, a.registration, a.baseName, a.district].some((v) => v.toLowerCase().includes(term))),
    );
  }, [agents, q, role, situation]);

  const markers: MapMarker[] = filtered
    .filter((a) => a.latitude !== null && a.longitude !== null)
    .map((a) => ({
      id: a.id,
      kind: "agent",
      latitude: a.latitude!,
      longitude: a.longitude!,
      icon: a.role,
      color: "#e4e6ea",
      silent: a.active && a.fieldStatus === "SEM_SINAL",
      dimmed: !a.active || a.fieldStatus === "EM_PAUSA",
      title: a.name,
      subtitle: `${ROLE_LABELS[a.role]} · ${a.baseName}`,
      caption: a.active ? FIELD_STATUS[a.fieldStatus].label : "Inativo",
    }));

  const statuses = Object.keys(FIELD_STATUS) as AgentFieldStatus[];

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Agentes</h1>
          <p>Agentes de trânsito, guardas municipais e policiais em serviço na cidade.</p>
        </div>
        <Link to="/agentes/novo" className="button primary">
          <Plus size={15} /> Novo agente
        </Link>
      </header>

      <SummaryStrip
        label="Agentes por situação em campo"
        active={situation}
        onSelect={setSituation}
        items={[
          ...statuses.map((s) => ({
            key: s,
            label: FIELD_STATUS[s].label,
            count: agents.filter((a) => situationOf(a) === s).length,
            color: FIELD_STATUS[s].color,
            shape: s === "SEM_SINAL" ? ("diamond" as const) : ("circle" as const),
          })),
          { key: INACTIVE, label: "Inativos", count: agents.filter((a) => !a.active).length },
        ]}
      />

      <div className="filters inline">
        <div className="search">
          <Search size={15} />
          <input placeholder="Buscar por nome, matrícula, base, bairro…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select value={role} onChange={(e) => setRole(e.target.value as AgentRole | "")} aria-label="Função">
          <option value="">Todas as funções</option>
          {(Object.keys(ROLE_LABELS) as AgentRole[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      <div className="list-meta">
        <span>
          {filtered.length} de {agents.length} agentes
        </span>
      </div>

      {/* Em telas largas, o mapa das equipes fica ao lado da lista */}
      <div className="split">
        <section className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Agente</th>
                <th>Função</th>
                <th>Base</th>
                <th>Situação em campo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  className="clickable"
                  onClick={() => navigate(`/agentes/${a.id}/editar`)}
                  onMouseEnter={() => setHovered(a.id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <td>
                    <div className="cell-main">
                      <span className="avatar">{initials(a.name)}</span>
                      <div>
                        <strong>{a.name}</strong>
                        <span className="mono">
                          {a.registration}
                          {a.rank && ` · ${a.rank}`}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="cell-place">
                    <span>{ROLE_LABELS[a.role]}</span>
                    <span className="muted">{a.shift ? `Turno ${SHIFT_LABELS[a.shift].toLowerCase()}` : "Sem turno"}</span>
                  </td>
                  <td className="cell-place">
                    <span>{a.baseName}</span>
                    <span className="muted">{a.district}</span>
                  </td>
                  <td>
                    {a.active ? (
                      <div className="cell-badges">
                        <FieldStatusBadge status={a.fieldStatus} />
                        <span className="muted">posição {timeAgo(a.lastPositionAt, now)}</span>
                      </div>
                    ) : (
                      <span className="muted">Inativo</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">Nenhum agente encontrado com esses filtros.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="card split-aside">
          <div className="card-header">
            <h2>Posição das equipes</h2>
            <span className="muted">{markers.length} no mapa</span>
          </div>
          <CityMap
            height="100%"
            markers={markers}
            selectedId={hovered}
            onMarkerClick={(m) => navigate(`/agentes/${m.id}/editar`)}
          />
        </section>
      </div>
    </>
  );
}
