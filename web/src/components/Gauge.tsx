import type { CSSProperties } from "react";

export function Gauge({ value, color, label }: { value: number; color: string; label: string }) {
  const radius = 92;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="gauge" style={{ "--gauge-color": color } as CSSProperties}>
      <svg width="220" height="220" viewBox="0 0 220 220">
        <circle className="gauge-track" cx="110" cy="110" r={radius} fill="none" strokeWidth="14" />
        <circle
          className="gauge-value"
          cx="110"
          cy="110"
          r={radius}
          fill="none"
          strokeWidth="14"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
        />
      </svg>
      <div className="gauge-label">
        <strong style={{ color }}>{value}%</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

/** Cor do indicador de disponibilidade, com os mesmos limites da saúde das regiões (80% e 60%). */
export function availabilityColor(percent: number) {
  if (percent >= 80) return "var(--state-green)";
  if (percent >= 60) return "var(--state-yellow)";
  return "var(--state-red)";
}
