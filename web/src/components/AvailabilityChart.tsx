import { useEffect, useRef, useState } from "react";
import type { AvailabilityPoint } from "../types";

interface Props {
  points: AvailabilityPoint[];
  height?: number;
}

const PAD = { top: 16, right: 16, bottom: 28, left: 40 };
const GRID = [0, 20, 40, 60, 80, 100];
/** Mesmos limites da saúde das regiões: abaixo de 80% pede atenção, abaixo de 60% é crítico. */
const THRESHOLDS = [
  { value: 80, label: "atenção" },
  { value: 60, label: "crítico" },
];

/** Intervalos maiores que isso entre dois registros são buraco (API fora do ar): a linha é interrompida. */
const GAP_MS = 60 * 60 * 1000;

const hourLabel = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * Disponibilidade ao longo do tempo: uma série, uma linha, eixo fixo de 0 a 100% para que
 * a queda não pareça maior (ou menor) do que é. Passar o mouse mostra o valor de cada registro.
 */
export function AvailabilityChart({ points, height = 220 }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);

  if (points.length < 2) {
    return <p className="muted">Ainda não há registros suficientes para o gráfico.</p>;
  }

  const plotW = Math.max(width - PAD.left - PAD.right, 10);
  const plotH = height - PAD.top - PAD.bottom;
  const t0 = new Date(points[0].takenAt).getTime();
  const t1 = new Date(points[points.length - 1].takenAt).getTime();
  const x = (iso: string) => PAD.left + ((new Date(iso).getTime() - t0) / Math.max(t1 - t0, 1)) * plotW;
  const y = (value: number) => PAD.top + (1 - value / 100) * plotH;

  // Trechos contínuos: sem registro por mais de GAP_MS, a linha não inventa o que aconteceu no meio.
  const segments: AvailabilityPoint[][] = [];
  points.forEach((p, i) => {
    const gap = i > 0 && new Date(p.takenAt).getTime() - new Date(points[i - 1].takenAt).getTime() > GAP_MS;
    if (i === 0 || gap) segments.push([]);
    segments[segments.length - 1].push(p);
  });
  const linePath = (segment: AvailabilityPoint[]) =>
    segment.map((p, i) => `${i ? "L" : "M"}${x(p.takenAt).toFixed(1)},${y(p.availability).toFixed(1)}`).join("");
  const areaPath = (segment: AvailabilityPoint[]) =>
    `${linePath(segment)}L${x(segment[segment.length - 1].takenAt).toFixed(1)},${y(0)}L${x(segment[0].takenAt).toFixed(1)},${y(0)}Z`;

  // Rótulos de horário espaçados pelo tempo (cerca de um a cada 110 px), não pela quantidade de registros.
  const tickCount = Math.max(2, Math.floor(plotW / 110));
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => new Date(t0 + ((t1 - t0) * i) / tickCount).toISOString());

  const onMove = (clientX: number) => {
    const left = frame.current!.getBoundingClientRect().left;
    const mouse = clientX - left;
    let nearest = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.takenAt) - mouse) < Math.abs(x(points[nearest].takenAt) - mouse)) nearest = i;
    });
    setHover(nearest);
  };

  const active = hover !== null ? points[hover] : null;
  const activeX = active ? x(active.takenAt) : 0;

  return (
    <div className="chart-frame" ref={frame} style={{ height }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Disponibilidade de ${points[0].availability}% a ${points[points.length - 1].availability}% no período`}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="availability-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--ember)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--ember)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {GRID.map((g) => (
          <g key={g}>
            <line className="chart-grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(g)} y2={y(g)} />
            <text className="chart-axis" x={PAD.left - 8} y={y(g)} textAnchor="end" dominantBaseline="middle">
              {g}%
            </text>
          </g>
        ))}
        {THRESHOLDS.map((t) => (
          <g key={t.value}>
            <line className="chart-threshold" x1={PAD.left} x2={PAD.left + plotW} y1={y(t.value)} y2={y(t.value)} />
            <text className="chart-axis" x={PAD.left + plotW} y={y(t.value) - 5} textAnchor="end">
              {t.label}
            </text>
          </g>
        ))}
        {ticks.map((iso, i) => (
          <text
            key={iso}
            className="chart-axis"
            x={x(iso)}
            y={height - 8}
            textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}
          >
            {hourLabel(iso)}
          </text>
        ))}

        {segments.map((segment) =>
          segment.length > 1 ? (
            <g key={segment[0].takenAt}>
              <path d={areaPath(segment)} fill="url(#availability-fill)" />
              <path d={linePath(segment)} className="chart-line" />
            </g>
          ) : (
            // Registro isolado entre dois buracos: um ponto, para não sumir.
            <circle key={segment[0].takenAt} className="chart-dot" cx={x(segment[0].takenAt)} cy={y(segment[0].availability)} r={3} />
          ),
        )}

        {active && (
          <g>
            <line className="chart-crosshair" x1={activeX} x2={activeX} y1={PAD.top} y2={PAD.top + plotH} />
            <circle className="chart-dot" cx={activeX} cy={y(active.availability)} r={5} />
          </g>
        )}
      </svg>

      {active && (
        <div
          className={`chart-tooltip ${y(active.availability) < 80 ? "below" : ""}`}
          // Perto do topo, a dica desce para baixo do ponto em vez de sair do gráfico.
          style={{
            left: Math.min(Math.max(activeX, 90), width - 90),
            top: y(active.availability) < 80 ? y(active.availability) + 12 : y(active.availability) - 12,
          }}
        >
          <span className="muted">{new Date(active.takenAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
          <strong>{active.availability}% disponível</strong>
          <span>
            {active.operational} de {active.installed} operando · {active.openAlerts} alertas
          </span>
        </div>
      )}
    </div>
  );
}
