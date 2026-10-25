import type { CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { api } from "../api";
import { useAsync } from "../hooks";
import { ROLE_LABELS, SHIFT_LABELS, initials, timeAgo } from "../labels";
import { FieldStatusBadge } from "../components/Badges";
import type { AgentRole } from "../types";

const ROLE_GRADIENTS: Record<AgentRole, string> = {
  AGENTE_TRANSITO: "linear-gradient(135deg, #ff9f1c, #ff6a2b)",
  GUARDA_MUNICIPAL: "linear-gradient(135deg, #4d9fff, #2e5bff)",
  POLICIAL_MILITAR: "linear-gradient(135deg, #8b93a7, #3f4452)",
};

export function AgentList() {
  const { data, error } = useAsync(() => api.agents(), [], { refreshMs: 15_000 });
  const navigate = useNavigate();

  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">Efetivo · {data?.filter((a) => a.active).length ?? "…"} ativos</div>
          <h1>Agentes</h1>
          <p className="muted">Agentes de trânsito, guardas municipais e policiais integrados ao F.O.G.O.</p>
        </div>
        <Link to="/agentes/novo" className="button primary">
          <Plus size={18} /> Novo agente
        </Link>
      </header>
      {error && <p className="error">{error}</p>}
      <section className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Agente</th>
              <th>Função</th>
              <th>Turno</th>
              <th>Base</th>
              <th>Recursos</th>
              <th>Situação em campo</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((a) => (
              <tr key={a.id} className="clickable" onClick={() => navigate(`/agentes/${a.id}/editar`)}>
                <td>
                  <div className="cell-main">
                    <span className="avatar" style={{ "--avatar-bg": ROLE_GRADIENTS[a.role] } as CSSProperties}>
                      {initials(a.name)}
                    </span>
                    <div>
                      <strong>{a.name}</strong>
                      <span className="mono">
                        {a.registration}
                        {a.rank && ` · ${a.rank}`}
                      </span>
                    </div>
                  </div>
                </td>
                <td>{ROLE_LABELS[a.role]}</td>
                <td>{a.shift ? <span className="chip">{SHIFT_LABELS[a.shift]}</span> : "—"}</td>
                <td>
                  {a.baseName}
                  <div className="muted">{a.district}</div>
                </td>
                <td className="mono">{a._count?.responsibleFor ?? 0}</td>
                <td>
                  {a.active ? (
                    <div className="cell-badges">
                      <FieldStatusBadge status={a.fieldStatus} />
                      <span className="muted">posição {timeAgo(a.lastPositionAt)}</span>
                    </div>
                  ) : (
                    <span className="row">
                      <span className="pulse-dot" style={{ "--dot-color": "var(--state-gray)" } as CSSProperties} />
                      Inativo
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
