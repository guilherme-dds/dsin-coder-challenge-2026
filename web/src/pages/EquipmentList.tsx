import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { api } from "../api";
import { useAsync } from "../hooks";
import { AGENCY_LABELS, CONNECTIVITY, STATUS_LABELS, URGENCY, formatDate, maintenanceDue } from "../labels";
import { ConnectivityBadge, StatusBadge, UrgencyBadge } from "../components/Badges";
import { TypeIcon } from "../components/TypeIcon";
import { SummaryStrip } from "../components/SummaryStrip";
import type { Agency, Connectivity, EquipmentStatus, UrgencyLevel } from "../types";

/** Filtros menos usados ficam em "Mais filtros"; a lista abre com eles visíveis se já estiverem em uso. */
const SECONDARY_FILTERS = ["agency", "connectivity"];

export function EquipmentList() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const filters = Object.fromEntries(params);
  const [moreFilters, setMoreFilters] = useState(() => SECONDARY_FILTERS.some((key) => params.has(key)));

  const types = useAsync(api.equipmentTypes);
  const regions = useAsync(api.regions);
  // Contagem da rede inteira por urgência, para a faixa de resumo (não muda com os filtros da lista).
  const dashboard = useAsync(api.dashboard, [], { refreshMs: 30_000 });
  const { data, error, loading } = useAsync(() => api.equipments(filters), [params.toString()]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const hasFilters = params.size > 0;
  const secondaryActive = SECONDARY_FILTERS.filter((key) => params.has(key)).length;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Equipamentos</h1>
          <p>Inventário da rede, do mais urgente para o menos urgente.</p>
        </div>
        <Link to="/equipamentos/novo" className="button primary">
          <Plus size={15} /> Cadastrar equipamento
        </Link>
      </header>

      <SummaryStrip
        label="Equipamentos por urgência"
        active={filters.urgency}
        onSelect={(level) => setFilter("urgency", level)}
        items={(Object.keys(URGENCY) as UrgencyLevel[]).map((level) => ({
          key: level,
          label: URGENCY[level].label,
          count: dashboard.data?.byUrgency[level] ?? 0,
          color: URGENCY[level].color,
          shape: URGENCY[level].shape,
        }))}
      />

      <div className="filters">
        <div className="search">
          <Search size={15} />
          <input
            placeholder="Buscar por série, marca, rua, referência…"
            value={filters.q ?? ""}
            onChange={(e) => setFilter("q", e.target.value)}
          />
        </div>
        <select value={filters.typeId ?? ""} onChange={(e) => setFilter("typeId", e.target.value)} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {types.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={filters.region ?? ""} onChange={(e) => setFilter("region", e.target.value)} aria-label="Região">
          <option value="">Todas as regiões</option>
          {regions.data?.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
        <select value={filters.status ?? ""} onChange={(e) => setFilter("status", e.target.value)} aria-label="Situação">
          <option value="">Todas as situações</option>
          {(Object.keys(STATUS_LABELS) as EquipmentStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <button
          className={`button more-filters ${moreFilters ? "on" : ""}`}
          onClick={() => setMoreFilters((v) => !v)}
          aria-expanded={moreFilters}
        >
          <SlidersHorizontal size={14} /> Mais filtros
          {secondaryActive > 0 && <b className="count-badge">{secondaryActive}</b>}
        </button>
        {moreFilters && (
          <>
            <select value={filters.agency ?? ""} onChange={(e) => setFilter("agency", e.target.value)} aria-label="Órgão">
              <option value="">Todos os órgãos</option>
              {(Object.keys(AGENCY_LABELS) as Agency[]).map((a) => (
                <option key={a} value={a}>
                  {AGENCY_LABELS[a]}
                </option>
              ))}
            </select>
            <select
              value={filters.connectivity ?? ""}
              onChange={(e) => setFilter("connectivity", e.target.value)}
              aria-label="Comunicação"
            >
              <option value="">Toda comunicação</option>
              {(Object.keys(CONNECTIVITY) as Connectivity[]).map((c) => (
                <option key={c} value={c}>
                  {CONNECTIVITY[c].label}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      <div className="list-meta">
        <span>
          {loading && !data ? "Carregando…" : `${data?.length ?? 0} de ${dashboard.data?.totals.equipments ?? "…"} equipamentos`}
        </span>
        {hasFilters && (
          <button className="link-button" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            <RotateCcw size={12} /> Limpar filtros
          </button>
        )}
      </div>
      <section className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Equipamento</th>
              <th>Urgência</th>
              <th>Situação</th>
              <th>Local</th>
              <th>Manutenção</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((e) => (
              <tr key={e.id} className="clickable" onClick={() => navigate(`/equipamentos/${e.id}`)}>
                <td>
                  <div className="cell-main">
                    <span className="icon-tile">
                      <TypeIcon code={e.type.code} size={16} />
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
                  {/* Comunicação só aparece quando foge do normal */}
                  <div className="cell-badges">
                    <StatusBadge status={e.status} />
                    {(e.connectivity === "OFFLINE" || e.connectivity === "INSTAVEL") && (
                      <ConnectivityBadge connectivity={e.connectivity} />
                    )}
                  </div>
                </td>
                <td className="cell-place">
                  <span>{e.street}</span>
                  <span className="muted">{e.district}</span>
                </td>
                <td title={formatDate(e.nextMaintenanceAt)}>
                  {e.maintenanceType === "IMEDIATA" ? "Imediata" : (maintenanceDue(e.nextMaintenanceAt) ?? <span className="muted">—</span>)}
                </td>
              </tr>
            ))}
            {!loading && data?.length === 0 && (
              <tr>
                <td colSpan={5}>
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
