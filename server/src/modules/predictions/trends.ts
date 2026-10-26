import { prisma } from "../../lib/prisma.js";
import { REGION_CRITICAL_PCT, REGION_DEGRADED_PCT } from "../../domain/availability.js";
import { FLOW_METRICS, METRIC_LABELS } from "../../domain/telemetry.js";
import { linearRegression } from "../../domain/stats.js";
import { loadRegionIndex } from "../regions/service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export const AVAILABILITY_WINDOW_DAYS = 7;
export const OCCURRENCE_WINDOW_WEEKS = 12;
export const UTILIZATION_WINDOW_WEEKS = 8;
/** Projeção da disponibilidade para daqui a quantos dias. */
const PROJECTION_DAYS = 7;
/** |t| acima disso: a inclinação dificilmente é acaso. */
const SIGNIFICANT_T = 2;

const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

export interface AvailabilityTrend {
  scope: { id: string | null; code: string; name: string };
  current: number;
  /** Pontos percentuais por dia. */
  slopePerDay: number;
  projected: number;
  significant: boolean;
  /** Em quantos dias cruza o limite de atenção (80%) ou crítico (60%), se estiver caindo. */
  daysToDegraded: number | null;
  daysToCritical: number | null;
  summary: string;
}

export interface OccurrenceTrend {
  region: { id: string; code: string; name: string };
  weekly: number[];
  /** Variação por semana em relação à média do período (%). */
  changePerWeekPct: number;
  nextWeek: number;
  significant: boolean;
  summary: string;
}

export interface UtilizationTrend {
  equipment: { id: string; serialNumber: string; type: { code: string; name: string }; district: string };
  metric: string;
  metricLabel: string;
  /** Variação total no período (%). */
  changePct: number;
  weeks: number;
  summary: string;
}

/** Dias até a reta cruzar `limit`, se estiver descendo e ainda acima dele. */
function daysUntil(current: number, slope: number, limit: number) {
  if (slope >= 0 || current <= limit) return null;
  return Math.ceil((limit - current) / slope);
}

/** Tendência de disponibilidade da cidade e de cada região na última semana, projetada 7 dias à frente. */
async function availabilityTrends(now: Date): Promise<AvailabilityTrend[]> {
  const [snapshots, index] = await Promise.all([
    prisma.availabilitySnapshot.findMany({
      where: { takenAt: { gte: new Date(now.getTime() - AVAILABILITY_WINDOW_DAYS * DAY_MS) } },
      orderBy: { takenAt: "asc" },
    }),
    loadRegionIndex(),
  ]);
  const scopes = [{ id: null, code: "CIDADE", name: "Cidade inteira" }, ...index.regions];

  return scopes
    .map((scope): AvailabilityTrend | null => {
      const points = snapshots.filter((s) => s.regionId === scope.id && s.installed > 0);
      const reg = linearRegression(
        points.map((p) => (p.takenAt.getTime() - now.getTime()) / DAY_MS),
        points.map((p) => (p.operational / p.installed) * 100),
      );
      if (!reg) return null;
      const current = Math.min(100, Math.max(0, reg.last));
      const projected = Math.min(100, Math.max(0, current + reg.slope * PROJECTION_DAYS));
      const significant = Math.abs(reg.tStat) >= SIGNIFICANT_T && Math.abs(reg.slope) >= 0.5;
      const daysToDegraded = significant ? daysUntil(current, reg.slope, REGION_DEGRADED_PCT) : null;
      const daysToCritical = significant ? daysUntil(current, reg.slope, REGION_CRITICAL_PCT) : null;
      const direction = reg.slope < 0 ? "caindo" : "subindo";
      let summary = significant
        ? `Disponibilidade ${direction} ${round(Math.abs(reg.slope))} ponto(s) por dia: de ${round(current)}% hoje para ~${round(projected)}% em ${PROJECTION_DAYS} dias.`
        : `Disponibilidade estável na última semana (${round(current)}%).`;
      if (significant && reg.slope < 0 && current < REGION_CRITICAL_PCT) summary += " Já está abaixo do limite crítico (60%).";
      else if (daysToCritical !== null && daysToCritical <= PROJECTION_DAYS) summary += ` Fica crítica (abaixo de 60%) em ~${daysToCritical} dia(s).`;
      else if (daysToDegraded !== null && daysToDegraded <= PROJECTION_DAYS) summary += ` Entra em atenção (abaixo de 80%) em ~${daysToDegraded} dia(s).`;
      return {
        scope,
        current: round(current),
        slopePerDay: round(reg.slope, 2),
        projected: round(projected),
        significant,
        daysToDegraded,
        daysToCritical,
        summary,
      };
    })
    .filter((t): t is AvailabilityTrend => t !== null)
    .sort((a, b) => a.slopePerDay - b.slopePerDay);
}

/** Tendência semanal do volume de ocorrências por região nas últimas 12 semanas completas. */
async function occurrenceTrends(now: Date): Promise<OccurrenceTrend[]> {
  const since = new Date(now.getTime() - OCCURRENCE_WINDOW_WEEKS * WEEK_MS);
  const [occurrences, index] = await Promise.all([
    prisma.occurrence.findMany({ where: { occurredAt: { gte: since }, regionId: { not: null } }, select: { regionId: true, occurredAt: true } }),
    loadRegionIndex(),
  ]);

  return index.regions
    .map((region): OccurrenceTrend | null => {
      // Semana 0 = a mais antiga; a última termina agora
      const weekly = Array(OCCURRENCE_WINDOW_WEEKS).fill(0);
      for (const o of occurrences.filter((x) => x.regionId === region.id)) {
        const age = Math.floor((now.getTime() - o.occurredAt.getTime()) / WEEK_MS);
        if (age < OCCURRENCE_WINDOW_WEEKS) weekly[OCCURRENCE_WINDOW_WEEKS - 1 - age]++;
      }
      const reg = linearRegression(weekly.map((_, i) => i), weekly);
      const mean = weekly.reduce((a, b) => a + b, 0) / weekly.length;
      if (!reg || mean === 0) return null;
      const changePerWeekPct = (reg.slope / mean) * 100;
      const significant = Math.abs(reg.tStat) >= SIGNIFICANT_T && Math.abs(changePerWeekPct) >= 2;
      const nextWeek = Math.max(0, reg.intercept + reg.slope * OCCURRENCE_WINDOW_WEEKS);
      const summary = significant
        ? `Ocorrências ${reg.slope > 0 ? "subindo" : "caindo"} ~${round(Math.abs(changePerWeekPct))}% por semana: ` +
          `de ${round(weekly[0], 0)} na semana mais antiga para ${round(weekly.at(-1)!, 0)} na última; ~${round(nextWeek, 0)} previstas para a próxima.`
        : `Volume de ocorrências estável (~${round(mean, 0)} por semana).`;
      return { region, weekly, changePerWeekPct: round(changePerWeekPct), nextWeek: round(nextWeek), significant, summary };
    })
    .filter((t): t is OccurrenceTrend => t !== null)
    .sort((a, b) => b.changePerWeekPct - a.changePerWeekPct);
}

/**
 * Tendência de uso dos equipamentos de fluxo (radar, cancela, totem, balança) nas últimas 8 semanas.
 * Usa médias semanais para que o fim de semana não pareça queda.
 */
async function utilizationTrends(now: Date): Promise<UtilizationTrend[]> {
  const rows = await prisma.telemetryDaily.findMany({
    where: { metric: { in: FLOW_METRICS }, date: { gte: new Date(now.getTime() - UTILIZATION_WINDOW_WEEKS * WEEK_MS) } },
    include: { equipment: { include: { type: true } } },
  });
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(`${r.equipmentId}|${r.metric}`, [...(groups.get(`${r.equipmentId}|${r.metric}`) ?? []), r]);

  const trends: UtilizationTrend[] = [];
  for (const [, points] of groups) {
    const weekly: { week: number; avg: number }[] = [];
    for (let week = 0; week < UTILIZATION_WINDOW_WEEKS; week++) {
      const inWeek = points.filter((p) => Math.floor((now.getTime() - p.date.getTime()) / WEEK_MS) === UTILIZATION_WINDOW_WEEKS - 1 - week);
      // Só semanas completas: uma semana parcial mistura dias úteis e fim de semana em outra proporção
      if (inWeek.length === 7) weekly.push({ week, avg: inWeek.reduce((sum, p) => sum + p.avg, 0) / 7 });
    }
    const reg = linearRegression(weekly.map((w) => w.week), weekly.map((w) => w.avg));
    if (!reg || weekly.length < 4) continue;
    const first = reg.intercept + reg.slope * weekly[0].week;
    const span = weekly.at(-1)!.week - weekly[0].week;
    const changePct = first > 0 ? ((reg.slope * span) / first) * 100 : 0;
    if (Math.abs(reg.tStat) < SIGNIFICANT_T || Math.abs(changePct) < 20) continue;

    const { equipment, metric } = points[0];
    const label = METRIC_LABELS[metric] ?? metric;
    trends.push({
      equipment: {
        id: equipment.id,
        serialNumber: equipment.serialNumber,
        type: { code: equipment.type.code, name: equipment.type.name },
        district: equipment.district,
      },
      metric,
      metricLabel: label,
      changePct: round(changePct, 0),
      weeks: span + 1,
      summary:
        changePct > 0
          ? `Uso em alta: ${label} ${round(changePct, 0)}% acima em ${span + 1} semanas. Avaliar capacidade ou um segundo equipamento no local.`
          : `Uso em queda: ${label} ${round(-changePct, 0)}% abaixo em ${span + 1} semanas. Avaliar defeito, desvio de demanda ou realocação.`,
    });
  }
  return trends.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
}

export async function analyzeTrends(now = new Date()) {
  const [availability, occurrences, utilization] = await Promise.all([
    availabilityTrends(now),
    occurrenceTrends(now),
    utilizationTrends(now),
  ]);
  return { availability, occurrences, utilization };
}
