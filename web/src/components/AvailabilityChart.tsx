import { useCallback, useRef, useState } from "react";
import type { AvailabilityPoint } from "../types";

interface Props {
  points: AvailabilityPoint[];
  /** Altura mínima; o gráfico cresce para preencher o bloco quando ele é mais alto. */
  minHeight?: number;
}

const PAD = { top: 16, right: 16, bottom: 28, left: 40 };
const GRID = [0, 20, 40, 60, 80, 100];
/** Mesmos limites da saúde das regiões: abaixo de 80% pede atenção, abaixo de 60% é crítico. */
const THRESHOLDS = [
  { value: 80, label: "atenção 80%", tone: "medium" },
  { value: 60, label: "crítico 60%", tone: "critical" },
];

/**
 * Intervalos maiores que isso entre dois registros são buraco (API fora do ar): a linha é interrompida.
 * Folga sobre a cadência mais espaçada (o histórico da seed é de hora em hora) para atrasos pequenos não cortarem a linha.
 */
const GAP_MS = 90 * 60 * 1000;
/** Larguras mínimas (px) para o rótulo do vão caber inteiro ou abreviado. */
const GAP_LABEL_FULL = 190;
const GAP_LABEL_SHORT = 70;

const hourLabel = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dateTimeLabel = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function durationLabel(fromIso: string, toIso: string) {
  const minutes = Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ""}` : `${minutes} min`;
}

type Hover = { kind: "point"; index: number } | { kind: "gap"; index: number } | null;

/**
 * Disponibilidade ao longo do tempo: uma série, uma linha, eixo fixo de 0 a 100% para que
 * a queda não pareça maior (ou menor) do que é. Passar o mouse mostra o valor de cada registro.
 * Períodos sem registro aparecem marcados como "sem dados": o sistema estava fora do ar e nada foi medido.
 */
export function AvailabilityChart({ points, minHeight = 220 }: Props) {
  const frame = useRef<HTMLDivElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const [size, setSize] = useState({ width: 640, height: minHeight });
  const [hover, setHover] = useState<Hover>(null);

  // Ref de callback: o quadro só existe quando há registros, e pode surgir depois da primeira carga.
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      observer.current?.disconnect();
      frame.current = node;
      if (!node) return;
      observer.current = new ResizeObserver(([entry]) =>
        setSize({ width: entry.contentRect.width, height: Math.max(entry.contentRect.height, minHeight) }),
      );
      observer.current.observe(node);
    },
    [minHeight],
  );
  const { width, height } = size;

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
  // Vãos entre um trecho e o seguinte: do último registro antes da parada ao primeiro depois dela
  const gaps = segments.slice(1).map((segment, i) => ({
    from: segments[i][segments[i].length - 1].takenAt,
    to: segment[0].takenAt,
  }));

  const linePath = (segment: AvailabilityPoint[]) =>
    segment.map((p, i) => `${i ? "L" : "M"}${x(p.takenAt).toFixed(1)},${y(p.availability).toFixed(1)}`).join("");
  const areaPath = (segment: AvailabilityPoint[]) =>
    `${linePath(segment)}L${x(segment[segment.length - 1].takenAt).toFixed(1)},${y(0)}L${x(segment[0].takenAt).toFixed(1)},${y(0)}Z`;

  // Rótulos de horário espaçados pelo tempo (cerca de um a cada 110 px), não pela quantidade de registros.
  const tickCount = Math.max(2, Math.floor(plotW / 110));
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => new Date(t0 + ((t1 - t0) * i) / tickCount).toISOString());

  const onMove = (clientX: number) => {
    const mouse = clientX - frame.current!.getBoundingClientRect().left;
    const gapIndex = gaps.findIndex((g) => mouse > x(g.from) && mouse < x(g.to));
    if (gapIndex !== -1) {
      setHover({ kind: "gap", index: gapIndex });
      return;
    }
    let nearest = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.takenAt) - mouse) < Math.abs(x(points[nearest].takenAt) - mouse)) nearest = i;
    });
    setHover({ kind: "point", index: nearest });
  };

  const active = hover?.kind === "point" ? points[hover.index] : null;
  const activeX = active ? x(active.takenAt) : 0;
  const activeGap = hover?.kind === "gap" ? gaps[hover.index] : null;

  return (
    <div className="chart-frame" ref={attach} style={{ minHeight }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={
          `Disponibilidade de ${points[0].availability}% a ${points[points.length - 1].availability}% no período` +
          (gaps.length ? `, com ${gaps.length} período(s) sem dados (sistema fora do ar)` : "")
        }
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {/* Hachura discreta: marca "não medido" sem parecer um valor */}
          <pattern id="chart-gap-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="chart-gap-stripe" />
          </pattern>
        </defs>

        {GRID.map((g) => (
          <g key={g}>
            <line className="chart-grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(g)} y2={y(g)} />
            <text className="chart-axis" x={PAD.left - 8} y={y(g)} textAnchor="end" dominantBaseline="middle">
              {g}%
            </text>
          </g>
        ))}

        {gaps.map((g, i) => {
          const left = x(g.from);
          const gapWidth = x(g.to) - left;
          const label = gapWidth >= GAP_LABEL_FULL ? "Sem dados · sistema fora do ar" : gapWidth >= GAP_LABEL_SHORT ? "Sem dados" : null;
          return (
            <g key={g.from} className={`chart-gap ${hover?.kind === "gap" && hover.index === i ? "on" : ""}`}>
              <rect x={left} y={PAD.top} width={gapWidth} height={plotH} fill="url(#chart-gap-hatch)" />
              <rect x={left} y={PAD.top} width={gapWidth} height={plotH} className="chart-gap-area" />
              {label && (
                <text className="chart-gap-label" x={left + gapWidth / 2} y={PAD.top + plotH / 2} textAnchor="middle" dominantBaseline="middle">
                  {label}
                </text>
              )}
            </g>
          );
        })}

        {THRESHOLDS.map((t) => (
          <g key={t.value}>
            <line className={`chart-threshold ${t.tone}`} x1={PAD.left} x2={PAD.left + plotW} y1={y(t.value)} y2={y(t.value)} />
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
              <path d={areaPath(segment)} className="chart-area" />
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
          <span className="muted">{dateTimeLabel(active.takenAt)}</span>
          <strong>{active.availability}% disponível</strong>
          <span>
            {active.operational} de {active.installed} operando · {active.openAlerts} alertas
          </span>
        </div>
      )}

      {activeGap && (
        <div
          className="chart-tooltip below"
          style={{
            left: Math.min(Math.max((x(activeGap.from) + x(activeGap.to)) / 2, 120), width - 120),
            top: PAD.top + 8,
          }}
        >
          <strong>Sem dados</strong>
          <span>
            {dateTimeLabel(activeGap.from)} → {hourLabel(activeGap.to)} ({durationLabel(activeGap.from, activeGap.to)})
          </span>
          <span className="muted">Sistema fora do ar: nada foi medido neste período.</span>
        </div>
      )}
    </div>
  );
}
