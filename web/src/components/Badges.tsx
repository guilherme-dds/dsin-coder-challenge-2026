import type { CSSProperties } from "react";
import { CONNECTIVITY, FIELD_STATUS, HEALTH, SEVERITY, STATUS_COLORS, STATUS_LABELS, URGENCY, type IndicatorShape } from "../labels";
import type { AgentFieldStatus, AlertSeverity, Connectivity, EquipmentStatus, HealthLevel, UrgencyLevel } from "../types";

/** Forma colorida do indicador; sozinha serve a legendas e listas onde o rótulo já está ao lado. */
export function Shape({ color, shape = "circle" }: { color: string; shape?: IndicatorShape }) {
  return <span className={`shape shape-${shape}`} style={{ "--shape-color": color } as CSSProperties} aria-hidden />;
}

/** Indicador de status: forma + cor + rótulo, para que o estado nunca dependa só da cor. */
function Indicator({ label, color, shape, title }: { label: string; color: string; shape?: IndicatorShape; title?: string }) {
  return (
    <span className="indicator" title={title}>
      <Shape color={color} shape={shape} /> {label}
    </span>
  );
}

export function UrgencyBadge({ level }: { level: UrgencyLevel }) {
  const info = URGENCY[level];
  return <Indicator label={info.label} color={info.color} shape={info.shape} title={info.description} />;
}

export function StatusBadge({ status }: { status: EquipmentStatus }) {
  return <Indicator label={STATUS_LABELS[status]} color={STATUS_COLORS[status]} />;
}

export function ConnectivityBadge({ connectivity }: { connectivity: Connectivity }) {
  const info = CONNECTIVITY[connectivity];
  return (
    <Indicator
      label={info.label}
      color={info.color}
      shape={connectivity === "OFFLINE" ? "diamond" : "circle"}
      title={info.description}
    />
  );
}

export function FieldStatusBadge({ status }: { status: AgentFieldStatus }) {
  const info = FIELD_STATUS[status];
  return <Indicator label={info.label} color={info.color} shape={status === "SEM_SINAL" ? "diamond" : "circle"} />;
}

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const info = SEVERITY[severity];
  return <Indicator label={info.label} color={info.color} shape={info.shape} />;
}

export function HealthBadge({ level, count }: { level: HealthLevel; count?: number }) {
  const info = HEALTH[level];
  return (
    <span className="health-pill" title={info.description}>
      <Shape color={info.color} shape={info.shape} /> {info.label}
      {count !== undefined && <b>{count}</b>}
    </span>
  );
}
