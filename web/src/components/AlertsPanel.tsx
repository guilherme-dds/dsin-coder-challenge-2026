import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BellRing, Check, MapPin, ShieldCheck, X } from "lucide-react";
import { ALERT_KIND_LABELS, SEVERITY, timeAgo } from "../labels";
import { useNow } from "../hooks";
import type { Alert, AlertSeverity } from "../types";

interface Props {
  alerts: Alert[];
  onSelect: (alert: Alert) => void;
  onAcknowledge: (alert: Alert) => Promise<void>;
  onClose: () => void;
}

const SEVERITIES = Object.keys(SEVERITY) as AlertSeverity[];

/**
 * Fila de alertas da Central, dos mais graves para os mais leves. Alertas que surgem enquanto
 * o operador olha o mapa ganham destaque por alguns segundos.
 */
export function AlertsPanel({ alerts, onSelect, onAcknowledge, onClose }: Props) {
  const now = useNow(5000);
  const [severity, setSeverity] = useState<AlertSeverity | null>(null);
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
        setTimeout(() => setFresh((current) => new Set([...current].filter((id) => !arrived.includes(id)))), 8000);
      }
    }
    seen.current = ids;
  }, [alerts]);

  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, alerts.filter((a) => a.severity === s).length]));
  const visible = severity ? alerts.filter((a) => a.severity === severity) : alerts;

  const acknowledge = async (alert: Alert) => {
    setPending(alert.id);
    try {
      await onAcknowledge(alert);
    } finally {
      setPending(null);
    }
  };

  return (
    <aside className="ops-panel ops-alerts">
      <div className="panel-title">
        <BellRing size={16} /> Alertas
        <span className="chip">{alerts.length}</span>
        <button className="close-inline" onClick={onClose} aria-label="Fechar alertas">
          <X size={16} />
        </button>
      </div>

      <div className="chips">
        {SEVERITIES.map((s) => (
          <button
            key={s}
            className={`chip-toggle ${severity === s ? "on" : ""}`}
            style={{ "--chip-color": SEVERITY[s].color } as CSSProperties}
            onClick={() => setSeverity(severity === s ? null : s)}
          >
            <span className="dot" /> {SEVERITY[s].label} <b>{counts[s]}</b>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="empty-state compact">
          <ShieldCheck size={30} />
          Nenhum alerta {severity ? `de gravidade ${SEVERITY[severity].label.toLowerCase()}` : "aberto"}.
        </div>
      ) : (
        <ul className="alert-list">
          {visible.map((alert) => (
            <li
              key={alert.id}
              className={`alert-item ${fresh.has(alert.id) ? "fresh" : ""} ${alert.status === "RECONHECIDO" ? "acknowledged" : ""}`}
              style={{ "--alert-color": SEVERITY[alert.severity].color } as CSSProperties}
            >
              <button className="alert-body" onClick={() => onSelect(alert)} title="Ver no mapa">
                <span className="alert-kind">
                  {ALERT_KIND_LABELS[alert.kind]} · {timeAgo(alert.openedAt, now)}
                </span>
                <strong>{alert.title}</strong>
                {alert.message && <span className="muted">{alert.message}</span>}
                {alert.region && (
                  <span className="alert-region">
                    <MapPin size={11} /> {alert.region.name}
                  </span>
                )}
              </button>
              {alert.status === "ABERTO" ? (
                <button
                  className="button small"
                  disabled={pending === alert.id}
                  onClick={() => acknowledge(alert)}
                  title="Assumir o alerta: ele sai da fila de não reconhecidos e se resolve sozinho quando a condição deixar de existir"
                >
                  <Check size={14} /> Reconhecer
                </button>
              ) : (
                <span className="muted ack-note" title={`Por ${alert.acknowledgedBy}`}>
                  <Check size={12} /> reconhecido
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
