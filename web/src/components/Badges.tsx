import type { CSSProperties } from "react";
import { STATUS_LABELS, URGENCY } from "../labels";
import type { EquipmentStatus, UrgencyLevel } from "../types";

export function UrgencyBadge({ level }: { level: UrgencyLevel }) {
  const info = URGENCY[level];
  return (
    <span className="urgency-badge" style={{ "--badge-color": info.color } as CSSProperties} title={info.description}>
      <span className="dot" /> {info.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: EquipmentStatus }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{STATUS_LABELS[status]}</span>;
}
