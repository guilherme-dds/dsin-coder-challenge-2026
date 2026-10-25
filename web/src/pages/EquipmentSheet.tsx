import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarClock, ClipboardPen, History, MapPin, Pencil, Stethoscope, UserRound, Wrench } from "lucide-react";
import { api } from "../api";
import { useAsync } from "../hooks";
import {
  AGENCY_LABELS,
  EVENT_LABELS,
  MAINTENANCE_LABELS,
  STATUS_LABELS,
  URGENCY,
  formatDate,
  formatDateTime,
  maintenanceDue,
  timeAgo,
} from "../labels";
import { ConnectivityBadge, StatusBadge, UrgencyBadge } from "../components/Badges";
import { formatAttribute } from "../components/DynamicFields";
import { CityMap } from "../components/CityMap";
import { TypeIcon } from "../components/TypeIcon";
import type { EquipmentStatus } from "../types";

export function EquipmentSheet() {
  const { id } = useParams();
  const { data: eq, error, reload } = useAsync(() => api.equipment(id!), [id]);
  const agents = useAsync(() => api.agents({ active: "true" }));

  const [nextStatus, setNextStatus] = useState<EquipmentStatus | "">("");
  const [note, setNote] = useState("");
  const [agentId, setAgentId] = useState("");
  const [maintenanceDate, setMaintenanceDate] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <p className="error">{error}</p>;
  if (!eq) {
    return (
      <div className="loading">
        <span className="pulse-dot" /> Carregando ficha…
      </div>
    );
  }

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setNote("");
      setNextStatus("");
      setMaintenanceDate("");
      setActionError(null);
      reload();
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  return (
    <>
      <header className="page-header">
        <div className="patient">
          <span className="icon-tile lg">
            <TypeIcon code={eq.type.code} size={30} />
          </span>
          <div>
            <div className="eyebrow">Ficha do equipamento · {eq.type.name}</div>
            <h1>
              {eq.brand} {eq.model}
            </h1>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="chip">#{eq.serialNumber}</span>
              <UrgencyBadge level={eq.urgency} />
              <StatusBadge status={eq.status} />
              <ConnectivityBadge connectivity={eq.connectivity} />
              <span className="chip">{AGENCY_LABELS[eq.agency]}</span>
            </div>
            {eq.lastSeenAt && <p className="muted">Último contato do dispositivo: {timeAgo(eq.lastSeenAt)}</p>}
          </div>
        </div>
        <Link to={`/equipamentos/${eq.id}/editar`} className="button">
          <Pencil size={16} /> Editar
        </Link>
      </header>

      <section className="vitals-row">
        <div className="vital-box" style={{ borderColor: URGENCY[eq.urgency].color }}>
          <small>Urgência</small>
          <strong style={{ color: URGENCY[eq.urgency].color }}>{URGENCY[eq.urgency].label}</strong>
        </div>
        <div className="vital-box">
          <small>
            <Wrench size={12} /> Manutenção
          </small>
          <strong>{MAINTENANCE_LABELS[eq.maintenanceType]}</strong>
        </div>
        <div className="vital-box">
          <small>
            <CalendarClock size={12} /> Próxima manutenção
          </small>
          <strong>{formatDate(eq.nextMaintenanceAt)}</strong>
          <span className="muted">{maintenanceDue(eq.nextMaintenanceAt)}</span>
        </div>
        <div className="vital-box">
          <small>Periodicidade</small>
          <strong>{eq.maintenanceIntervalDays ? `${eq.maintenanceIntervalDays} dias` : "—"}</strong>
        </div>
      </section>

      <div className="two-columns">
        <div>
          <section className="card">
            <div className="card-header">
              <div className="card-title">
                <Stethoscope size={19} />
                <h2>Características</h2>
              </div>
            </div>
            <dl className="details">
              {eq.type.attributesSchema.map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>{formatAttribute(field, eq.attributes[field.key])}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card">
            <div className="card-header">
              <div className="card-title">
                <MapPin size={19} />
                <h2>{eq.type.mobile ? "Base" : "Instalação"}</h2>
              </div>
              <span className="chip">
                {eq.latitude.toFixed(5)}, {eq.longitude.toFixed(5)}
              </span>
            </div>
            <div className="address">
              <MapPin size={16} />
              <div>
                <strong>
                  {eq.street}, {eq.reference}
                </strong>
                <div className="muted">
                  {eq.district} · {eq.city}/{eq.state} · CEP {eq.zipCode}
                </div>
              </div>
            </div>
            <CityMap
              height={260}
              center={[eq.latitude, eq.longitude]}
              zoom={16}
              markers={[
                {
                  id: eq.id,
                  kind: "equipment",
                  latitude: eq.latitude,
                  longitude: eq.longitude,
                  icon: eq.type.code,
                  color: URGENCY[eq.urgency].hex,
                  pulse: eq.urgency === "CRITICO",
                  title: eq.serialNumber,
                },
              ]}
            />
            {eq.responsibleAgent && (
              <div className="address" style={{ marginTop: 16, marginBottom: 0 }}>
                <UserRound size={16} />
                <div>
                  Responsável: <strong>{eq.responsibleAgent.name}</strong>{" "}
                  <span className="mono muted">{eq.responsibleAgent.registration}</span>
                </div>
              </div>
            )}
          </section>
        </div>

        <div>
          <section className="card">
            <div className="card-header">
              <div className="card-title">
                <ClipboardPen size={19} />
                <h2>Ações operacionais</h2>
              </div>
            </div>
            {actionError && <p className="error">{actionError}</p>}

            {eq.allowedTransitions.length > 0 ? (
              <div className="stack" style={{ borderTop: "none", marginTop: 0, paddingTop: 0 }}>
                <label className="field">
                  <span>Alterar situação para</span>
                  <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value as EquipmentStatus)}>
                    <option value="">Selecione…</option>
                    {eq.allowedTransitions.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Agente</span>
                  <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                    <option value="">Não informado</option>
                    {agents.data?.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Observação</span>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: lente quebrada após temporal" />
                </label>
                <button
                  className="button primary"
                  disabled={!nextStatus}
                  onClick={() =>
                    run(() => api.changeStatus(eq.id, { status: nextStatus as EquipmentStatus, note, agentId: agentId || null }))
                  }
                >
                  Registrar
                </button>
              </div>
            ) : (
              <p className="muted">Equipamento baixado: nenhuma ação disponível.</p>
            )}

            <div className="stack">
              <label className="field">
                <span>Agendar manutenção</span>
                <input type="date" value={maintenanceDate} onChange={(e) => setMaintenanceDate(e.target.value)} />
              </label>
              <button
                className="button"
                disabled={!maintenanceDate}
                onClick={() => run(() => api.scheduleMaintenance(eq.id, { date: maintenanceDate, note }))}
              >
                <CalendarClock size={16} /> Agendar
              </button>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div className="card-title">
                <History size={19} />
                <h2>Histórico</h2>
              </div>
              <span className="chip">{eq.events.length} registros</span>
            </div>
            <ol className="timeline">
              {eq.events.map((ev) => (
                <li key={ev.id}>
                  <time>{formatDateTime(ev.createdAt)}</time>
                  <strong>{EVENT_LABELS[ev.kind]}</strong>
                  {ev.fromStatus && ev.toStatus && (
                    <span>
                      {STATUS_LABELS[ev.fromStatus]} → {STATUS_LABELS[ev.toStatus]}
                    </span>
                  )}
                  {ev.note && <em>“{ev.note}”</em>}
                  {ev.agent && <small className="muted">por {ev.agent.name}</small>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
