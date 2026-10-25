import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { api } from "../api";
import { useAsync } from "../hooks";
import { AGENCY_LABELS, CONNECTIVITY, STATUS_LABELS, URGENCY, formatDate, maintenanceDue } from "../labels";
import { ConnectivityBadge, StatusBadge, UrgencyBadge } from "../components/Badges";
import { TypeIcon } from "../components/TypeIcon";
import type { Agency, Connectivity, EquipmentStatus, UrgencyLevel } from "../types";

export function EquipmentList() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const filters = Object.fromEntries(params);

  const types = useAsync(api.equipmentTypes);
  const regions = useAsync(api.regions);
  const { data, error, loading } = useAsync(() => api.equipments(filters), [params.toString()]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">Inventário · {data?.length ?? "…"} registros</div>
          <h1>Equipamentos</h1>
          <p className="muted">Inventário completo da rede, ordenado por urgência.</p>
        </div>
        <Link to="/equipamentos/novo" className="button primary">
          <Plus size={18} /> Cadastrar equipamento
        </Link>
      </header>

      <div className="filters">
        <div className="search">
          <Search size={17} />
          <input placeholder="Buscar por série, marca, rua, referência…" value={filters.q ?? ""} onChange={(e) => setFilter("q", e.target.value)} />
        </div>
        <select value={filters.typeId ?? ""} onChange={(e) => setFilter("typeId", e.target.value)}>
          <option value="">Todos os tipos</option>
          {types.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={filters.status ?? ""} onChange={(e) => setFilter("status", e.target.value)}>
          <option value="">Todas as situações</option>
          {(Object.keys(STATUS_LABELS) as EquipmentStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select value={filters.urgency ?? ""} onChange={(e) => setFilter("urgency", e.target.value)}>
          <option value="">Toda urgência</option>
          {(Object.keys(URGENCY) as UrgencyLevel[]).map((t) => (
            <option key={t} value={t}>
              {URGENCY[t].label}
            </option>
          ))}
        </select>
        <select value={filters.region ?? ""} onChange={(e) => setFilter("region", e.target.value)}>
          <option value="">Todas as regiões</option>
          {regions.data?.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
        <select value={filters.agency ?? ""} onChange={(e) => setFilter("agency", e.target.value)}>
          <option value="">Todos os órgãos</option>
          {(Object.keys(AGENCY_LABELS) as Agency[]).map((a) => (
            <option key={a} value={a}>
              {AGENCY_LABELS[a]}
            </option>
          ))}
        </select>
        <select value={filters.connectivity ?? ""} onChange={(e) => setFilter("connectivity", e.target.value)}>
          <option value="">Toda comunicação</option>
          {(Object.keys(CONNECTIVITY) as Connectivity[]).map((c) => (
            <option key={c} value={c}>
              {CONNECTIVITY[c].label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      <section className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Equipamento</th>
              <th>Urgência</th>
              <th>Marca / modelo</th>
              <th>Localização</th>
              <th>Situação</th>
              <th>Próx. manutenção</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((e) => (
              <tr key={e.id} className="clickable" onClick={() => navigate(`/equipamentos/${e.id}`)}>
                <td>
                  <div className="cell-main">
                    <span className="icon-tile">
                      <TypeIcon code={e.type.code} />
                    </span>
                    <div>
                      <strong>{e.type.name}</strong>
                      <span className="mono">{e.serialNumber}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <UrgencyBadge level={e.urgency} />
                </td>
                <td>
                  {e.brand}
                  <div className="muted">{e.model}</div>
                </td>
                <td>
                  {e.street}, {e.reference}
                  <div className="muted">
                    {e.district} · {e.city}/{e.state}
                  </div>
                </td>
                <td>
                  <div className="cell-badges">
                    <StatusBadge status={e.status} />
                    {e.connectivity !== "SEM_TELEMETRIA" && <ConnectivityBadge connectivity={e.connectivity} />}
                  </div>
                </td>
                <td>
                  <span className="mono">{formatDate(e.nextMaintenanceAt)}</span>
                  <div className="muted">{maintenanceDue(e.nextMaintenanceAt)}</div>
                </td>
              </tr>
            ))}
            {!loading && data?.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">Nenhum equipamento encontrado com esses filtros.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
