import { useEffect, useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { ALERT_KIND_LABELS, SEVERITY, timeAgo } from "../labels";
import { useNow } from "../hooks";
import { Shape } from "./Badges";
import type { Alert, AlertSeverity } from "../types";

interface Props {
  alerts: Alert[];
  onSelect: (alert: Alert) => void;
  onAcknowledge: (alert: Alert) => Promise<void>;
  onClose: () => void;
}

const SEVERITIES = Object.keys(SEVERITY) as AlertSeverity[];

/**
 * Fila de alertas da Central. Fica à vista só o que ainda pede ação (não reconhecido);
 * os já assumidos por alguém ficam num grupo recolhido no fim.
 */
export function AlertsPanel({ alerts, onSelect, onAcknowledge, onClose }: Props) {
  const now = useNow(5000);
  const [severity, setSeverity] = useState<AlertSeverity | null>(null);
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const ids = new Set(alerts.map((a) => a.id));
    // Na primeira carga nada é "novo": só o que aparecer depois disso.
    if (seen.current) {
      const arrived = alerts.filter((a) => !seen.current!.has(a.id)).map((a) => a.id);
      if (arrived.length) {
        setFresh((current) => new Set([...current, ...arrived]));
        setTimeout(() => setFresh((current) => new Set([...current].filter((id) => !arrived.includes(id)))), 4000);
      }
    }
    seen.current = ids;
  }, [alerts]);

  const bySeverity = severity ? alerts.filter((a) => a.severity === severity) : alerts;
  const open = bySeverity.filter((a) => a.status === "ABERTO");
  const acknowledged = bySeverity.filter((a) => a.status !== "ABERTO");
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, alerts.filter((a) => a.severity === s && a.status === "ABERTO").length]));

  const acknowledge = async (alert: Alert) => {
    setPending(alert.id);
    try {
      await onAcknowledge(alert);
    } finally {
      setPending(null);
    }
  };

  const item = (alert: Alert) => (
    <li
      key={alert.id}
      className={`alert-item ${fresh.has(alert.id) ? "fresh" : ""} ${alert.status !== "ABERTO" ? "acknowledged" : ""}`}
    >
      <Shape color={SEVERITY[alert.severity].color} shape={SEVERITY[alert.severity].shape} />
      <button className="alert-body" onClick={() => onSelect(alert)} title={alert.message ?? "Ver no mapa"}>
        <strong>{alert.title}</strong>
        <span className="alert-kind">
          {ALERT_KIND_LABELS[alert.kind]}
          {alert.region && ` · ${alert.region.name}`} · {timeAgo(alert.openedAt, now)}
        </span>
      </button>
      {alert.status === "ABERTO" && (
        <button
          className="button small ghost"
          disabled={pending === alert.id}
          onClick={() => acknowledge(alert)}
          title="Assumir o alerta: ele sai da fila e se resolve sozinho quando a condição deixar de existir"
        >
          Reconhecer
        </button>
      )}
    </li>
  );

  return (
    <section className="ops-alerts" aria-label="Alertas">
      <div className="side-head">
        <h2>Alertas</h2>
        <span className="muted">{open.length} pedem ação</span>
        <button className="close-inline" onClick={onClose} aria-label="Fechar alertas" title="Fechar alertas">
          <X size={16} />
        </button>
      </div>

      <div className="chips">
        {SEVERITIES.map((s) => (
          <button
            key={s}
            className={`chip-toggle ${severity === s ? "on" : ""}`}
            onClick={() => setSeverity(severity === s ? null : s)}
            aria-pressed={severity === s}
          >
            <Shape color={SEVERITY[s].color} shape={SEVERITY[s].shape} /> {SEVERITY[s].label} <b>{counts[s]}</b>
          </button>
        ))}
      </div>

      <div className="alert-scroll">
        {open.length === 0 ? (
          <div className="empty-state compact">
            Nenhum alerta {severity ? `de gravidade ${SEVERITY[severity].label.toLowerCase()} ` : ""}pedindo ação.
          </div>
        ) : (
          <ul className="alert-list">{open.map(item)}</ul>
        )}

        {acknowledged.length > 0 && (
          <>
            <button className="group-toggle" onClick={() => setShowAcknowledged((v) => !v)} aria-expanded={showAcknowledged}>
              <ChevronRight size={14} className={showAcknowledged ? "rotated" : ""} /> Reconhecidos
              <span className="muted">{acknowledged.length}</span>
            </button>
            {showAcknowledged && <ul className="alert-list">{acknowledged.map(item)}</ul>}
          </>
        )}
      </div>
    </section>
  );
}
