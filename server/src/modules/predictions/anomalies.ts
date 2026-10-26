import { prisma } from "../../lib/prisma.js";
import { METRIC_LABELS } from "../../domain/telemetry.js";
import { cityDayStart, cityWeekday } from "../../domain/time.js";
import { median, robustSpread } from "../../domain/stats.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Dias recentes avaliados e quantos deles precisam fugir do padrão para virar anomalia. */
export const RECENT_DAYS = 3;
const MIN_ANOMALOUS_DAYS = 2;
/** Linha de base: o comportamento de 7 a 35 dias atrás. */
export const BASELINE_FROM_DAYS = 7;
export const BASELINE_TO_DAYS = 35;
/** A partir de quantos desvios robustos um dia é considerado fora do padrão. */
export const Z_THRESHOLD = 3;
/** Além de improvável, o desvio precisa ser grande o bastante para importar na operação. */
export const MIN_CHANGE = 0.3;

/** O que costuma significar um desvio em cada medição. */
const INTERPRETATIONS: Record<string, { down?: string; up?: string }> = {
  veiculosHora: {
    down: "Contagem muito abaixo do normal: sensor com defeito ou tráfego desviado (obra, interdição).",
    up: "Fluxo muito acima do normal: possível desvio de tráfego de outra via.",
  },
  fps: { down: "Queda na qualidade do vídeo: lente, foco, codificação ou rede da câmera." },
  bitrateKbps: { down: "Transmissão de vídeo degradada: rede ou codificação da câmera." },
  transacoesHora: {
    up: "Uso muito acima do normal: conferir papel e capacidade do totem.",
    down: "Uso muito abaixo do normal: o totem pode estar com defeito no pagamento.",
  },
  aberturasHora: { down: "Cancela abrindo bem menos que o normal: possível travamento." },
  pesagensHora: { down: "Pesagens muito abaixo do normal: sensor da balança ou desvio de caminhões." },
  bateriaPct: { down: "Bateria descarregando mais que o normal." },
};

/**
 * Peso de cada dia da semana no próprio equipamento (ex.: domingo = 0,45 do normal num radar),
 * aprendido na linha de base. Dividir pelo peso "tira o dia da semana" do valor (ajuste sazonal),
 * para que um domingo tranquilo não pareça queda e uma sexta movimentada não pareça pico.
 */
function weekdayIndex(points: { date: Date; avg: number }[]) {
  const overall = median(points.map((p) => p.avg));
  return Array.from({ length: 7 }, (_, weekday) => {
    const values = points.filter((p) => cityWeekday(p.date) === weekday).map((p) => p.avg);
    const index = values.length >= 2 && overall > 0 ? median(values) / overall : 1;
    return index > 0 ? index : 1;
  });
}

export interface Anomaly {
  equipment: { id: string; serialNumber: string; type: { code: string; name: string }; district: string };
  metric: string;
  metricLabel: string;
  direction: "ALTA" | "QUEDA";
  /** Média dos dias fora do padrão. */
  recent: number;
  /** Valor normal esperado para aqueles dias da semana. */
  baseline: number;
  changePct: number;
  /** Desvio do dia mais atípico, em desvios robustos. */
  score: number;
  anomalousDays: number;
  since: string;
  interpretation: string;
}

/**
 * Detecta medições que fugiram do padrão do próprio equipamento nos últimos dias completos,
 * comparando cada dia (ajustado pelo dia da semana) com a mediana e o desvio robusto da linha de base.
 */
export async function detectAnomalies(now = new Date()) {
  const today = cityDayStart(now);
  const rows = await prisma.telemetryDaily.findMany({
    where: { date: { gte: new Date(today.getTime() - BASELINE_TO_DAYS * DAY_MS), lt: today } },
    include: { equipment: { include: { type: true } } },
    orderBy: { date: "asc" },
  });

  const series = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.equipmentId}|${r.metric}`;
    series.set(key, [...(series.get(key) ?? []), r]);
  }

  const anomalies: Anomaly[] = [];
  for (const [, points] of series) {
    const age = (date: Date) => Math.round((today.getTime() - date.getTime()) / DAY_MS);
    const recent = points.filter((p) => age(p.date) <= RECENT_DAYS);
    const base = points.filter((p) => age(p.date) >= BASELINE_FROM_DAYS && age(p.date) <= BASELINE_TO_DAYS);
    if (recent.length < MIN_ANOMALOUS_DAYS || base.length < 8) continue;

    const index = weekdayIndex(base);
    const adjusted = (p: { date: Date; avg: number }) => p.avg / index[cityWeekday(p.date)];
    const reference = base.map(adjusted);
    const m = median(reference);
    // Piso no desvio: medições muito estáveis não disparam alarme por variações minúsculas
    const spread = Math.max(robustSpread(reference), Math.abs(m) * 0.05, 0.5);
    const flagged = recent
      .map((p) => ({
        point: p,
        // Linha de base expressa no dia da semana do ponto, para a comparação fazer sentido ao gestor
        baseline: m * index[cityWeekday(p.date)],
        z: (adjusted(p) - m) / spread,
      }))
      .filter((d) => Math.abs(d.z) >= Z_THRESHOLD && Math.abs(d.point.avg - d.baseline) >= MIN_CHANGE * Math.abs(d.baseline));

    const down = flagged.filter((d) => d.z < 0);
    const up = flagged.filter((d) => d.z > 0);
    const dominant = down.length >= up.length ? down : up;
    if (dominant.length < MIN_ANOMALOUS_DAYS) continue;

    const { equipment, metric } = points[0];
    const direction = dominant[0].z < 0 ? "QUEDA" : "ALTA";
    const recentAvg = dominant.reduce((sum, d) => sum + d.point.avg, 0) / dominant.length;
    const baseline = dominant.reduce((sum, d) => sum + d.baseline, 0) / dominant.length;
    const hint = INTERPRETATIONS[metric]?.[direction === "QUEDA" ? "down" : "up"];
    anomalies.push({
      equipment: {
        id: equipment.id,
        serialNumber: equipment.serialNumber,
        type: { code: equipment.type.code, name: equipment.type.name },
        district: equipment.district,
      },
      metric,
      metricLabel: METRIC_LABELS[metric] ?? metric,
      direction,
      recent: Math.round(recentAvg * 10) / 10,
      baseline: Math.round(baseline * 10) / 10,
      changePct: baseline ? Math.round(((recentAvg - baseline) / Math.abs(baseline)) * 100) : 0,
      score: Math.round(Math.max(...dominant.map((d) => Math.abs(d.z))) * 10) / 10,
      anomalousDays: dominant.length,
      since: dominant.map((d) => d.point.date).sort((a, b) => a.getTime() - b.getTime())[0].toISOString(),
      interpretation:
        hint ??
        `${METRIC_LABELS[metric] ?? metric} ${direction === "QUEDA" ? "bem abaixo" : "bem acima"} do padrão do equipamento: verificar o dispositivo.`,
    });
  }

  return anomalies.sort((a, b) => b.score - a.score);
}
