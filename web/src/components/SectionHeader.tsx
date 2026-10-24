import type { LucideIcon } from "lucide-react";

export function SectionHeader({ step, icon: Icon, title }: { step: number; icon: LucideIcon; title: string }) {
  return (
    <div className="card-header">
      <div className="card-title">
        <Icon size={19} />
        <h2>{title}</h2>
      </div>
      <span className="step">{String(step).padStart(2, "0")}</span>
    </div>
  );
}
