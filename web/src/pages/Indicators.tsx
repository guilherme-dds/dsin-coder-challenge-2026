import { useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Map as MapIcon } from "lucide-react";
import { api } from "../api";
import { useAsync, useNow } from "../hooks";
import {
  CONNECTIVITY,
  FIELD_STATUS,
  HEALTH,
  SEVERITY,
  STATUS_COLORS,
  STATUS_LABELS,
  URGENCY,
  availabilityColor,
  maintenanceDue,
  timeAgo,
} from "../labels";
import { HealthBadge, Shape, UrgencyBadge } from "../components/Badges";
import { TypeIcon } from "../components/TypeIcon";
import { AvailabilityChart } from "../components/AvailabilityChart";
import { SummaryStrip } from "../components/SummaryStrip";
import type {
  AgentFieldStatus,
  AlertSeverity,
  Connectivity,
  Dashboard,
  EquipmentStatus,
  HealthLevel,
  RegionOverview,
  UrgencyLevel,
} from "../types";

const REFRESH_MS = 30_000;
/** A fila mostra só os primeiros; o resto fica em "Ver todos". */
const QUEUE_LIMIT = 6;
const HEALTH_LEVELS = Object.keys(HEALTH) as HealthLevel[];
const SEVERITIES = Object.keys(SEVERITY) as AlertSeverity[];

type CompositionTab = "status" | "connectivity" | "type" | "field";

const TABS: { key: CompositionTab; label: string }[] = [
  { key: "status", label: "Situação" },
  { key: "connectivity", label: "Comunicação" },
  { key: "type", label: "Tipo" },
  { key: "field", label: "Equipes" },
];

export function Indicators() {
  const now = useNow(5000);
  const { data, error, loading, updatedAt } = useAsync(api.dashboard, [], { refreshMs: REFRESH_MS });
  const regions = useAsync(api.regions, [], { refreshMs: REFRESH_MS });
  const [historyRegion, setHistoryRegion] = useState("");
  const history = useAsync(() => api.availabilityHistory(historyRegion || undefined), [historyRegion], {
    refreshMs: 60_000,
  });
  const navigate = useNavigate();

  if (loading && !data) return <div className="loading">Consolidando indicadores…</div>;
  if (error || !data) return <p className="error">{error}</p>;

  const { totals } = data;
  const openAlerts = SEVERITIES.reduce((sum, s) => sum + data.openAlerts[s], 0);
  const measurable = (regions.data ?? []).filter((r) => r.id !== null);
  const queue = data.critical.slice(0, QUEUE_LIMIT);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Indicadores</h1>
          <p>Como a cidade está operando agora · atualizado {timeAgo(updatedAt?.toISOString() ?? null, now)}</p>
        </div>
        <Link to="/" className="button">
          <MapIcon size={15} /> Abrir mapa
        </Link>
      </header>

      <div className="dash-grid">
        <section className="card overview area-overview">
          <div className="overview-main">
            <div className="card-title">
              <h2>Disponibilidade da rede</h2>
              <HealthBadge level={data.health} />
            </div>
            <span className="big">{totals.availability}%</span>
            <span className="muted">
              {totals.operational} de {totals.installed} equipamentos instalados operando
            </span>
            <AvailabilityBar value={totals.availability} />
          </div>
          <div className="vitals-stats">
            <div className="vital">
              <small>{totals.unavailable > 0 && <Shape color="var(--critical)" shape="diamond" />} Indisponíveis</small>
              <strong>{totals.unavailable}</strong>
              <span className="vital-sub">fora de operação ou sem comunicação</span>
            </div>
            <div className="vital">
              <small>{data.openAlerts.CRITICA > 0 && <Shape color="var(--critical)" shape="diamond" />} Alertas abertos</small>
              <strong>{openAlerts}</strong>
              <span className="vital-sub">
                {data.openAlerts.CRITICA} crítico{data.openAlerts.CRITICA === 1 ? "" : "s"} · {data.openAlerts.ALTA} alto
                {data.openAlerts.ALTA === 1 ? "" : "s"}
              </span>
            </div>
            <div className="vital">
              <small>Agentes em atividade</small>
              <strong>{totals.activeAgents}</strong>
              <span className="vital-sub">de {totals.agentsOnDuty} em serviço</span>
            </div>
          </div>
        </section>

        <div className="area-urgency">
          <SummaryStrip
            label="Equipamentos por urgência"
            onSelect={(level) => level && navigate(`/equipamentos?urgency=${level}`)}
            items={(Object.keys(URGENCY) as UrgencyLevel[]).map((level) => ({
              key: level,
              label: URGENCY[level].label,
              count: data.byUrgency[level],
              color: URGENCY[level].color,
              shape: URGENCY[level].shape,
            }))}
          />
        </div>

        <section className="card area-regions">
          <div className="card-header">
            <h2>Regiões</h2>
            <div className="row">
              {HEALTH_LEVELS.map((level) => (
                <HealthBadge key={level} level={level} count={data.regionsByHealth[level]} />
              ))}
            </div>
          </div>
          {regions.error && <p className="error">{regions.error}</p>}
          <div className="region-grid">
            {regions.data?.map((region) => (
              <RegionCard key={region.code} region={region} onOpen={() => navigate(`/?regiao=${region.code}`)} />
            ))}
          </div>
        </section>

        <section className="card area-history">
          <div className="card-header">
            <h2>Últimas 24 h</h2>
            <select
              className="compact-select"
              value={historyRegion}
              onChange={(e) => setHistoryRegion(e.target.value)}
              aria-label="Região do gráfico"
            >
              <option value="">Cidade inteira</option>
              {measurable.map((r) => (
                <option key={r.code} value={r.id!}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          {history.data && <AvailabilityChart points={history.data} />}
        </section>

        <section className="card area-queue">
          <div className="card-header">
            <h2>Fila de atendimento</h2>
            <Link to="/equipamentos?urgency=CRITICO">Ver todos</Link>
          </div>

          {queue.length === 0 ? (
            <div className="empty-state">Nenhum equipamento crítico. Rede operando normalmente.</div>
          ) : (
            <div className="queue">
              {queue.map((e) => (
                <div key={e.id} className="queue-item" onClick={() => navigate(`/equipamentos/${e.id}`)}>
                  <span className="icon-tile">
                    <TypeIcon code={e.type.code} size={16} />
                  </span>
                  <div>
                    <div className="queue-title">{e.type.name}</div>
                    <div className="queue-meta">
                      {e.district} · {queueReason(e, now)}
                    </div>
                  </div>
                  <UrgencyBadge level={e.urgency} />
                </div>
              ))}
            </div>
          )}
        </section>

        <Composition data={data} />
      </div>
    </>
  );
}

/** Por que o equipamento está na fila: falha, silêncio ou manutenção. */
function queueReason(
  e: { maintenanceType: string; connectivity: Connectivity; lastSeenAt: string | null; nextMaintenanceAt: string | null },
  now: number,
) {
  if (e.maintenanceType === "IMEDIATA") return "manutenção imediata";
  if (e.connectivity === "OFFLINE") return `sem comunicação ${timeAgo(e.lastSeenAt, now)}`;
  return `manutenção ${maintenanceDue(e.nextMaintenanceAt)}`;
}

/** Barra de disponibilidade com as marcas dos limites de atenção (80%) e crítico (60%). */
function AvailabilityBar({ value }: { value: number }) {
  return (
    <>
      <div className="availability-bar" style={{ "--bar-color": availabilityColor(value) } as CSSProperties}>
        <span style={{ width: `${value}%` }} />
        <i style={{ left: "60%" }} title="Limite crítico: 60%" />
        <i style={{ left: "80%" }} title="Limite de atenção: 80%" />
      </div>
      <div className="availability-scale">
        <span style={{ left: "60%" }}>60</span>
        <span style={{ left: "80%" }}>80</span>
      </div>
    </>
  );
}

/** Cartão de região: saúde, disponibilidade e, numa linha só, o que está puxando para baixo. */
function RegionCard({ region, onOpen }: { region: RegionOverview; onOpen: () => void }) {
  const issues = [
    ...SEVERITIES.filter((s) => (s === "CRITICA" || s === "ALTA") && region.openAlerts[s] > 0).map(
      (s) => `${region.openAlerts[s]} ${SEVERITY[s].label.toLowerCase()}`,
    ),
    region.offline > 0 ? `${region.offline} sem comunicação` : null,
  ].filter(Boolean);

  return (
    <button
      className="region-card"
      style={{ "--health-color": HEALTH[region.health].color, "--tile-color": availabilityColor(region.availability) } as CSSProperties}
      onClick={onOpen}
      title="Ver a região no mapa"
    >
      <span className="region-top">
        <strong>{region.name}</strong>
        <HealthBadge level={region.health} />
      </span>
      <span className="region-availability">
        <b>{region.availability}%</b>
        <span className="muted">
          {region.operational}/{region.installed}
        </span>
      </span>
      <span className="meter">
        <span style={{ width: `${region.availability}%` }} />
      </span>
      <span className="region-issues">{issues.length ? issues.join(" · ") : "Sem pendências graves"}</span>
    </button>
  );
}

/** Composição da rede em abas: uma distribuição por vez, em vez de quatro blocos empilhados. */
function Composition({ data }: { data: Dashboard }) {
  const [tab, setTab] = useState<CompositionTab>("status");

  const items =
    tab === "status"
      ? (Object.entries(data.byStatus) as [EquipmentStatus, number][]).map(([s, n]) => ({
          key: s,
          label: STATUS_LABELS[s],
          color: STATUS_COLORS[s],
          count: n,
        }))
      : tab === "connectivity"
        ? (Object.entries(data.connectivity) as [Connectivity, number][])
            .filter(([, n]) => n > 0)
            .map(([c, n]) => ({ key: c, label: CONNECTIVITY[c].label, color: CONNECTIVITY[c].color, count: n }))
        : tab === "field"
          ? (Object.entries(data.agentsByFieldStatus) as [AgentFieldStatus, number][]).map(([f, n]) => ({
              key: f,
              label: FIELD_STATUS[f].label,
              color: FIELD_STATUS[f].color,
              count: n,
            }))
          : null;

  const maxTypeCount = Math.max(...data.byType.map((t) => t.count), 1);

  return (
    <section className="card area-composition">
      <div className="card-header">
        <h2>Composição</h2>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? "on" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {items ? (
        <>
          <div className="stacked">
            {items.map((item) => (
              <span key={item.key} title={`${item.label}: ${item.count}`} style={{ flex: item.count, background: item.color }} />
            ))}
          </div>
          <ul className="plain legend-list single">
            {items.map((item) => (
              <li key={item.key}>
                <span className="swatch" style={{ background: item.color }} />
                {item.label}
                <b>{item.count}</b>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="bars">
          {data.byType.map((t) => (
            <div key={t.code} className="bar-row">
              <TypeIcon code={t.code} size={15} />
              <div>
                {t.name}
                <div className="meter">
                  <span style={{ width: `${(t.count / maxTypeCount) * 100}%` }} />
                </div>
              </div>
              <span className="count">{t.count}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
