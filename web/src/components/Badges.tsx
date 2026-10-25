import type { CSSProperties } from "react";
import { CONNECTIVITY, FIELD_STATUS, SEVERITY, STATUS_LABELS, URGENCY } from "../labels";
import type { AgentFieldStatus, AlertSeverity, Connectivity, EquipmentStatus, UrgencyLevel } from "../types";

/** Selo com ponto colorido; base dos selos de urgência, conectividade, situação em campo e gravidade. */
function DotBadge({ label, color, title }: { label: string; color: string; title?: string }) {
  return (
    <span className="urgency-badge" style={{ "--badge-color": color } as CSSProperties} title={title}>
      <span className="dot" /> {label}
    </span>
  );
}

export function UrgencyBadge({ level }: { level: UrgencyLevel }) {
  const info = URGENCY[level];
  return <DotBadge label={info.label} color={info.color} title={info.description} />;
}

export function StatusBadge({ status }: { status: EquipmentStatus }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{STATUS_LABELS[status]}</span>;
}

export function ConnectivityBadge({ connectivity }: { connectivity: Connectivity }) {
  const info = CONNECTIVITY[connectivity];
  return <DotBadge label={info.label} color={info.color} title={info.description} />;
}

export function FieldStatusBadge({ status }: { status: AgentFieldStatus }) {
  const info = FIELD_STATUS[status];
  return <DotBadge label={info.label} color={info.color} />;
}

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const info = SEVERITY[severity];
  return <DotBadge label={info.label} color={info.color} />;
}
