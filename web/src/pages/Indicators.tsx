import { useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  ChevronRight,
  Gauge as GaugeIcon,
  LineChart,
  Map as MapIcon,
  MapPin,
  ShieldCheck,
  Users,
  WifiOff,
} from "lucide-react";
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
  maintenanceDue,
  timeAgo,
} from "../labels";
import { UrgencyBadge } from "../components/Badges";
import { TypeIcon } from "../components/TypeIcon";
import { Gauge, availabilityColor } from "../components/Gauge";
import { AvailabilityChart } from "../components/AvailabilityChart";
import type {
  AgentFieldStatus,
  AlertSeverity,
  Connectivity,
  EquipmentStatus,
  HealthLevel,
  RegionOverview,
  UrgencyLevel,
} from "../types";

const REFRESH_MS = 30_000;
const HEALTH_LEVELS = Object.keys(HEALTH) as HealthLevel[];
const SEVERITIES = Object.keys(SEVERITY) as AlertSeverity[];

export function Indicators() {
  const now = useNow(5000);
  const { data, error, loading, updatedAt } = useAsync(api.dashboard, [], { refreshMs: REFRESH_MS });
  const regions = useAsync(api.regions, [], { refreshMs: REFRESH_MS });
  const [historyRegion, setHistoryRegion] = useState("");
  const history = useAsync(() => api.availabilityHistory(historyRegion || undefined), [historyRegion], {
    refreshMs: 60_000,
  });
  const navigate = useNavigate();

  if (loading && !data) {
    return (
      <div className="loading">
        <span className="pulse-dot" /> Consolidando indicadores…
      </div>
    );
  }
  if (error || !data) return <p className="error">{error}</p>;

  const { totals } = data;
  const color = availabilityColor(totals.availability);
  const openAlerts = SEVERITIES.reduce((sum, s) => sum + data.openAlerts[s], 0);
  const maxTypeCount = Math.max(...data.byType.map((t) => t.count), 1);
  const statuses = Object.entries(data.byStatus) as [EquipmentStatus, number][];
  const connectivity = (Object.entries(data.connectivity) as [Connectivity, number][]).filter(([, n]) => n > 0);
  const fieldStatuses = Object.entries(data.agentsByFieldStatus) as [AgentFieldStatus, number][];
  const measurable = (regions.data ?? []).filter((r) => r.id !== null);

  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">
            Visão consolidada · atualizado {timeAgo(updatedAt?.toISOString() ?? null, now)}
          </div>
          <h1>Indicadores da cidade</h1>
          <p className="muted">Disponibilidade da rede, regiões que exigem atenção e equipes em campo.</p>
        </div>
        <Link to="/" className="button">
          <MapIcon size={17} /> Abrir mapa operacional
        </Link>
      </header>

      <section className="card availability-hero">
        <div>
          <div className="card-title">
            <GaugeIcon size={20} />
            <h2>Disponibilidade da rede</h2>
            <span className="health-pill" style={{ "--health-color": HEALTH[data.health].color } as CSSProperties}>
              Cidade: {HEALTH[data.health].label}
            </span>
          </div>
          <p className="muted">
            Equipamentos instalados que estão operando e comunicando. Quem parou de enviar telemetria conta como
            indisponível.
          </p>
          <div className="vitals-stats">
            <div className="vital">
              <small>Equipamentos</small>
              <strong>{totals.equipments}</strong>
            </div>
            <div className="vital">
              <small>Instalados</small>
              <strong>{totals.installed}</strong>
            </div>
            <div className="vital">
              <small>Operacionais</small>
              <strong style={{ color: "var(--state-green)" }}>{totals.operational}</strong>
            </div>
            <div className="vital">
              <small>Indisponíveis</small>
              <strong style={{ color: totals.unavailable ? "var(--state-red)" : undefined }}>{totals.unavailable}</strong>
            </div>
            <div className="vital">
              <small>Agentes em atividade</small>
              <strong>
                {totals.activeAgents}
                <span className="vital-of">/{totals.agentsOnDuty}</span>
              </strong>
            </div>
            <div className="vital">
              <small>Alertas abertos</small>
              <strong style={{ color: data.openAlerts.CRITICA ? "var(--state-red)" : undefined }}>{openAlerts}</strong>
            </div>
          </div>
        </div>
        <Gauge value={totals.availability} color={color} label="de disponibilidade operacional" />
      </section>

      <section className="card">
        <div className="card-header">
          <div className="card-title">
            <MapPin size={19} />
            <h2>Regiões da cidade</h2>
          </div>
          <div className="row">
            {HEALTH_LEVELS.map((level) => (
              <span
                key={level}
                className="health-pill"
                style={{ "--health-color": HEALTH[level].color } as CSSProperties}
                title={HEALTH[level].description}
              >
                {HEALTH[level].label} <b>{data.regionsByHealth[level]}</b>
              </span>
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

      <section className="card">
        <div className="card-header">
          <div className="card-title">
            <LineChart size={19} />
            <h2>Disponibilidade nas últimas 24 h</h2>
          </div>
          <select className="compact-select" value={historyRegion} onChange={(e) => setHistoryRegion(e.target.value)}>
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

      <section className="urgency-grid">
        {(Object.keys(URGENCY) as UrgencyLevel[]).map((level) => (
          <button
            key={level}
            className="monitor-tile"
            style={{ "--tile-color": URGENCY[level].color } as CSSProperties}
            onClick={() => navigate(`/equipamentos?urgency=${level}`)}
          >
            <span className="tile-top">
              <span className="tile-code">{URGENCY[level].label.toUpperCase()}</span>
              <ChevronRight size={14} color="var(--muted)" />
            </span>
            <strong>{data.byUrgency[level]}</strong>
            <span className="tile-desc">{URGENCY[level].description}</span>
            <span className="meter">
              <span style={{ width: `${totals.equipments ? (data.byUrgency[level] / totals.equipments) * 100 : 0}%` }} />
            </span>
          </button>
        ))}
      </section>

      <div className="two-columns">
        <section className="card">
          <div className="card-header">
            <div className="card-title">
              <AlertTriangle size={19} />
              <h2>Fila de atendimento</h2>
            </div>
            <Link to="/equipamentos?urgency=CRITICO" className="muted">
              ver todos
            </Link>
          </div>

          {data.critical.length === 0 ? (
            <div className="empty-state">
              <ShieldCheck size={36} />
              Nenhum equipamento crítico. Rede operando normalmente.
            </div>
          ) : (
            <div className="queue">
              {data.critical.map((e) => (
                <div
                  key={e.id}
                  className="queue-item"
                  style={{ "--item-color": URGENCY[e.urgency].color } as CSSProperties}
                  onClick={() => navigate(`/equipamentos/${e.id}`)}
                >
                  <span className="icon-tile">
                    <TypeIcon code={e.type.code} />
                  </span>
                  <div>
                    <div className="queue-title">
                      {e.type.name} <span className="mono muted">#{e.serialNumber}</span>
                    </div>
                    <div className="queue-meta">
                      <MapPin size={13} /> {e.street}, {e.reference} · {e.district}
                    </div>
                  </div>
                  <div className="queue-side">
                    <UrgencyBadge level={e.urgency} />
                    <span className="muted mono">{queueReason(e, now)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div>
          <section className="card">
            <div className="card-header">
              <div className="card-title">
                <Users size={19} />
                <h2>Equipes em campo</h2>
              </div>
              <span className="chip">{totals.agentsOnDuty} em serviço</span>
            </div>
            <ul className="plain legend-list">
              {fieldStatuses.map(([status, count]) => (
                <li key={status}>
                  <span className="swatch" style={{ background: FIELD_STATUS[status].color }} />
                  {FIELD_STATUS[status].label}
                  <b>{count}</b>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <div className="card-header">
              <div className="card-title">
                <BarChart3 size={19} />
                <h2>Composição da rede</h2>
              </div>
            </div>

            <p className="section-label">Situação</p>
            <StackedBar items={statuses.map(([s, n]) => ({ key: s, label: STATUS_LABELS[s], color: STATUS_COLORS[s], count: n }))} />

            <p className="section-label">
              <WifiOff size={12} /> Comunicação
            </p>
            <StackedBar
              items={connectivity.map(([c, n]) => ({ key: c, label: CONNECTIVITY[c].label, color: CONNECTIVITY[c].color, count: n }))}
            />

            <p className="section-label">Por tipo</p>
            <div className="bars">
              {data.byType.map((t) => (
                <div key={t.code} className="bar-row">
                  <TypeIcon code={t.code} />
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
          </section>
        </div>
      </div>
    </>
  );
}

/** Por que o equipamento está na fila: falha, silêncio ou manutenção. */
function queueReason(e: { maintenanceType: string; connectivity: Connectivity; lastSeenAt: string | null; nextMaintenanceAt: string | null }, now: number) {
  if (e.maintenanceType === "IMEDIATA") return "manutenção imediata";
  if (e.connectivity === "OFFLINE") return `sem comunicação ${timeAgo(e.lastSeenAt, now)}`;
  return maintenanceDue(e.nextMaintenanceAt);
}

function RegionCard({ region, onOpen }: { region: RegionOverview; onOpen: () => void }) {
  const health = HEALTH[region.health];
  return (
    <button
      className="region-card"
      style={{ "--health-color": health.color, "--tile-color": availabilityColor(region.availability) } as CSSProperties}
      onClick={onOpen}
      title="Ver a região no mapa"
    >
      <span className="region-top">
        <strong>{region.name}</strong>
        <span className="health-pill">{health.label}</span>
      </span>
      <span className="region-availability">
        <b>{region.availability}%</b>
        <span className="muted">
          {region.operational} de {region.installed} operando
        </span>
      </span>
      <span className="meter">
        <span style={{ width: `${region.availability}%` }} />
      </span>
      <span className="region-facts">
        <span>
          <WifiOff size={12} /> {region.offline} sem comunicação
        </span>
        <span>
          <Users size={12} /> {region.activeAgents} em atividade
        </span>
      </span>
      <span className="region-alerts">
        {SEVERITIES.filter((s) => region.openAlerts[s] > 0).map((s) => (
          <span key={s} className="alert-count" style={{ "--alert-color": SEVERITY[s].color } as CSSProperties}>
            <i /> {region.openAlerts[s]} {SEVERITY[s].label.toLowerCase()}
          </span>
        ))}
        {SEVERITIES.every((s) => region.openAlerts[s] === 0) && <span className="muted">Sem alertas abertos</span>}
      </span>
    </button>
  );
}

function StackedBar({ items }: { items: { key: string; label: string; color: string; count: number }[] }) {
  return (
    <>
      <div className="stacked">
        {items.map((item) => (
          <span key={item.key} title={`${item.label}: ${item.count}`} style={{ flex: item.count, background: item.color }} />
        ))}
      </div>
      <ul className="plain legend-list">
        {items.map((item) => (
          <li key={item.key}>
            <span className="swatch" style={{ background: item.color }} />
            {item.label}
            <b>{item.count}</b>
          </li>
        ))}
      </ul>
    </>
  );
}
