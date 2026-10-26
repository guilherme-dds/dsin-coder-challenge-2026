import type { AlertKind, AlertSeverity } from "../../domain/alerts.js";
import { forecastRisk } from "./risk.js";
import { recommendStaffing } from "./staffing.js";
import { predictFailures } from "./failures.js";
import { detectAnomalies } from "./anomalies.js";
import { analyzeTrends } from "./trends.js";

/** Alerta preventivo no mesmo formato dos candidatos do motor de alertas. */
export interface PreventiveCandidate {
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  message: string;
  recommendation: string;
  equipmentId?: string;
  regionId?: string;
}

/** Quantas horas à frente o risco previsto vira alerta: tempo suficiente para mobilizar equipes. */
const RISK_LOOKAHEAD_HOURS = 3;
const RISK_ALERT_INDEX = 90;
const FAILURE_ALERT_PROBABILITY = 0.25;
const FAILURE_HIGH_PROBABILITY = 0.5;
const OCCURRENCE_TREND_ALERT_PCT = 5;

const percent = (value: number) => `${Math.round(value * 100)}%`;

async function riskCandidates(now: Date): Promise<PreventiveCandidate[]> {
  const [{ regions }, { windows }] = await Promise.all([
    forecastRisk(RISK_LOOKAHEAD_HOURS, now),
    recommendStaffing(RISK_LOOKAHEAD_HOURS, now),
  ]);
  return regions.flatMap((forecast) => {
    const peak = forecast.peak;
    if (peak.riskIndex < RISK_ALERT_INDEX) return [];
    const window = windows.find((w) => new Date(w.start) <= new Date(peak.at) && new Date(peak.at) < new Date(w.end));
    const staffing = window?.regions.find((r) => r.region.id === forecast.region.id);
    const deficit = Math.max(0, staffing?.gap ?? 0);
    const busierThanUsual = forecast.factors.some((f) => f.label === "Momento acima do normal");
    // Risco alto com efetivo suficiente e sem nada fora do normal é o dia a dia: não vira alerta
    if (deficit === 0 && !busierThanUsual) return [];

    const kinds = peak.topKinds.map((k) => k.label.toLowerCase()).join(", ");
    return [
      {
        kind: "RISCO_PREVISTO",
        severity: deficit >= 2 && peak.riskIndex >= 95 ? "ALTA" : deficit > 0 ? "MEDIA" : "BAIXA",
        title: `Risco alto previsto: ${forecast.region.name} às ${peak.hour}h`,
        message:
          `Índice ${peak.riskIndex}: ${peak.expectedOccurrences.toLocaleString("pt-BR")} ocorrência(s) esperada(s) (${kinds}). ` +
          forecast.factors
            .slice(1, 3)
            .map((f) => f.detail)
            .join(" "),
        recommendation:
          deficit > 0 && staffing
            ? staffing.suggestion
            : "Intensificar o patrulhamento preventivo na região antes do horário de pico.",
        regionId: forecast.region.id,
      },
    ];
  });
}

async function failureCandidates(now: Date) {
  const { predictions, days } = await predictFailures(7, now);
  // Desgaste que cruza (ou já cruzou) o limite é sinal concreto: vira alerta mesmo com probabilidade moderada
  const wearing = (p: (typeof predictions)[number]) => p.factors.some((f) => f.label.startsWith("Desgaste"));
  return predictions
    .filter((p) => p.probability >= FAILURE_ALERT_PROBABILITY || wearing(p))
    .map(
      (p): PreventiveCandidate => ({
        kind: "FALHA_PROVAVEL",
        severity: p.probability >= FAILURE_HIGH_PROBABILITY ? "ALTA" : "MEDIA",
        title: `Falha provável: ${p.equipment.type.name} #${p.equipment.serialNumber} (${percent(p.probability)} em ${days} dias)`,
        message: p.factors
          .slice(0, 2)
          .map((f) => f.detail)
          .join(" "),
        recommendation: p.recommendation,
        equipmentId: p.equipment.id,
      }),
    );
}

async function anomalyCandidates(now: Date, alreadyFlagged: Set<string>) {
  const anomalies = await detectAnomalies(now);
  return anomalies
    .filter((a) => !alreadyFlagged.has(a.equipment.id))
    .map(
      (a): PreventiveCandidate => ({
        kind: "COMPORTAMENTO_ANOMALO",
        severity: Math.abs(a.changePct) >= 50 ? "MEDIA" : "BAIXA",
        title: `${a.metricLabel.charAt(0).toUpperCase() + a.metricLabel.slice(1)} fora do padrão: ${a.equipment.type.name} #${a.equipment.serialNumber}`,
        message: `${a.changePct > 0 ? "+" : ""}${a.changePct}% em relação ao normal do equipamento (${a.recent} contra ${a.baseline}) há ${a.anomalousDays} dia(s).`,
        recommendation: a.interpretation,
        equipmentId: a.equipment.id,
      }),
    );
}

async function trendCandidates(now: Date): Promise<PreventiveCandidate[]> {
  const { availability, occurrences } = await analyzeTrends(now);
  const falling = availability
    .filter((t) => t.scope.id !== null && t.significant && t.slopePerDay < 0)
    .filter((t) => t.current < 80 || (t.daysToDegraded !== null && t.daysToDegraded <= 7))
    .map(
      (t): PreventiveCandidate => ({
        kind: "TENDENCIA_DISPONIBILIDADE",
        severity: t.current < 60 || (t.daysToCritical !== null && t.daysToCritical <= 7) ? "ALTA" : "MEDIA",
        title: `Disponibilidade em queda: ${t.scope.name}`,
        message: t.summary,
        recommendation: "Levantar as falhas recorrentes da região e priorizar os reparos antes que cruze o próximo limite.",
        regionId: t.scope.id!,
      }),
    );
  const rising = occurrences
    .filter((t) => t.significant && t.changePerWeekPct >= OCCURRENCE_TREND_ALERT_PCT)
    .map(
      (t): PreventiveCandidate => ({
        kind: "TENDENCIA_OCORRENCIAS",
        severity: "BAIXA",
        title: `Ocorrências em alta: ${t.region.name}`,
        message: t.summary,
        recommendation: "Revisar a escala e as rondas da região: a demanda cresce semana a semana.",
        regionId: t.region.id,
      }),
    );
  return [...falling, ...rising];
}

/**
 * Converte as previsões em alertas preventivos. As previsões mudam devagar e custam mais que as
 * regras do motor (que roda a cada 30 s), então o resultado é reaproveitado por 5 minutos.
 */
const CACHE_MS = 5 * 60 * 1000;
let cache: { at: number; candidates: PreventiveCandidate[] } | null = null;

export async function preventiveCandidates(now = new Date()): Promise<PreventiveCandidate[]> {
  if (cache && now.getTime() - cache.at < CACHE_MS) return cache.candidates;
  try {
    const [risk, failures, trends] = await Promise.all([riskCandidates(now), failureCandidates(now), trendCandidates(now)]);
    // Anomalia já explicada numa falha provável não precisa de um segundo alerta
    const anomalies = await anomalyCandidates(now, new Set(failures.map((f) => f.equipmentId!)));
    cache = { at: now.getTime(), candidates: [...risk, ...failures, ...anomalies, ...trends] };
  } catch (err) {
    console.error("Falha ao calcular alertas preventivos:", err);
    // Mantém os últimos alertas preventivos em vez de resolvê-los por um erro passageiro
    if (!cache) return [];
  }
  return cache!.candidates;
}
