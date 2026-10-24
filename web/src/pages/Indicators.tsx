import type { CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, BarChart3, ChevronRight, Gauge as GaugeIcon, Map as MapIcon, MapPin, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { useAsync } from "../hooks";
import { STATUS_COLORS, STATUS_LABELS, URGENCY, maintenanceDue } from "../labels";
import { UrgencyBadge } from "../components/Badges";
import { TypeIcon } from "../components/TypeIcon";
import { Gauge, availabilityColor } from "../components/Gauge";
import type { EquipmentStatus, UrgencyLevel } from "../types";

export function Indicators() {
  const { data, error, loading } = useAsync(api.dashboard);
  const map = useAsync(api.operationsMap);
  const navigate = useNavigate();

  if (loading && !data) {
    return (
      <div className="loading">
        <span className="pulse-dot" /> Consolidando indicadores…
      </div>
    );
  }
  if (error || !data) return <p className="error">{error}</p>;

  const total = data.totals.equipments;
  const inService = total - data.byUrgency.PENDENTE - data.byUrgency.INATIVO;
  const availability = inService ? Math.round((data.byUrgency.NORMAL / inService) * 100) : 100;
  const critical = data.byUrgency.CRITICO + data.byUrgency.ALERTA;
  const color = availabilityColor(availability);
  const maxTypeCount = Math.max(...data.byType.map((t) => t.count), 1);
  const statuses = Object.entries(data.byStatus) as [EquipmentStatus, number][];

  // Bairros com mais equipamentos críticos ou em alerta
  const hotDistricts = Object.entries(
    (map.data?.equipments ?? [])
      .filter((e) => e.urgency === "CRITICO" || e.urgency === "ALERTA")
      .reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.district]: (acc[e.district] ?? 0) + 1 }), {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxHot = Math.max(...hotDistricts.map(([, n]) => n), 1);

  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">Visão consolidada</div>
          <h1>Indicadores da rede</h1>
          <p className="muted">Disponibilidade e pendências dos equipamentos de segurança e trânsito.</p>
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
          </div>
          <p className="muted">Equipamentos instalados operando sem pendências de manutenção.</p>
          <div className="vitals-stats">
            <div className="vital">
              <small>Equipamentos</small>
              <strong>{total}</strong>
            </div>
            <div className="vital">
              <small>Instalados</small>
              <strong>{inService}</strong>
            </div>
            <div className="vital">
              <small>Críticos + alertas</small>
              <strong style={{ color: critical ? "var(--state-red)" : undefined }}>{critical}</strong>
            </div>
            <div className="vital">
              <small>Agentes ativos</small>
              <strong>{data.totals.activeAgents}</strong>
            </div>
          </div>
        </div>
        <Gauge value={availability} color={color} label="de disponibilidade operacional" />
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
              <span style={{ width: `${total ? (data.byUrgency[level] / total) * 100 : 0}%` }} />
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
                    <span className="muted mono">
                      {e.maintenanceType === "IMEDIATA" ? "manutenção imediata" : maintenanceDue(e.nextMaintenanceAt)}
                    </span>
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
                <MapPin size={19} />
                <h2>Bairros com mais pendências</h2>
              </div>
            </div>
            <div className="bars">
              {hotDistricts.map(([name, count]) => (
                <div key={name} className="bar-row">
                  <MapPin size={16} />
                  <div>
                    {name}
                    <div className="meter" style={{ "--tile-color": "var(--state-red)" } as CSSProperties}>
                      <span style={{ width: `${(count / maxHot) * 100}%` }} />
                    </div>
                  </div>
                  <span className="count">{count}</span>
                </div>
              ))}
              {hotDistricts.length === 0 && <p className="muted">Sem pendências por bairro.</p>}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div className="card-title">
                <BarChart3 size={19} />
                <h2>Composição da rede</h2>
              </div>
            </div>

            <p className="section-label">Situação</p>
            <div className="stacked">
              {statuses.map(([status, count]) => (
                <span key={status} title={`${STATUS_LABELS[status]}: ${count}`} style={{ flex: count, background: STATUS_COLORS[status] }} />
              ))}
            </div>
            <ul className="plain legend-list">
              {statuses.map(([status, count]) => (
                <li key={status}>
                  <span className="swatch" style={{ background: STATUS_COLORS[status] }} />
                  {STATUS_LABELS[status]}
                  <b>{count}</b>
                </li>
              ))}
            </ul>

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
