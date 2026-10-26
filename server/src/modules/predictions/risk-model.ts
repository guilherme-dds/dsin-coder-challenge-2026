import { prisma } from "../../lib/prisma.js";
import type { AlertSeverity } from "../../domain/alerts.js";
import { HANDLING_MINUTES, OCCURRENCE_KINDS, type OccurrenceKind } from "../../domain/occurrences.js";
import { cityHour, cityWeekday } from "../../domain/time.js";

const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * HOUR_MS;

/** Janela de histórico usada pelo modelo. */
export const HISTORY_WEEKS = 12;
/** Uma ocorrência de 3 semanas atrás vale metade de uma desta semana: o modelo acompanha mudanças. */
const HALF_LIFE_WEEKS = 3;
/**
 * Suavização: um horário específico (ex.: terça às 3 h) tem poucos casos. O valor dele é puxado
 * na direção do padrão geral da região para aquela hora, como se houvesse SHRINK_WEEKS semanas
 * "emprestadas" desse padrão. Evita que uma única ocorrência rara vire um pico de risco.
 */
const SHRINK_WEEKS = 3;

/** Peso de cada gravidade na carga de risco: um acidente grave pesa mais que um congestionamento leve. */
export const SEVERITY_WEIGHT: Record<AlertSeverity, number> = { CRITICA: 4, ALTA: 2, MEDIA: 1, BAIXA: 0.5 };

/** O que o modelo espera para uma região num dia da semana e hora. */
export interface SlotExpectation {
  /** Ocorrências esperadas na hora. */
  occurrences: number;
  /** Carga ponderada pela gravidade (base do índice de risco). */
  load: number;
  /** Agentes ocupados, em média, durante a hora (ocorrências × agentes × duração). */
  agentHours: number;
  byKind: Record<OccurrenceKind, number>;
}

interface Accumulator {
  occurrences: number;
  load: number;
  agentHours: number;
  byKind: Record<OccurrenceKind, number>;
}

const emptyKinds = () => Object.fromEntries(OCCURRENCE_KINDS.map((k) => [k, 0])) as Record<OccurrenceKind, number>;
const emptyAccumulator = (): Accumulator => ({ occurrences: 0, load: 0, agentHours: 0, byKind: emptyKinds() });

function add(target: Accumulator, source: Accumulator, factor = 1) {
  target.occurrences += source.occurrences * factor;
  target.load += source.load * factor;
  target.agentHours += source.agentHours * factor;
  for (const k of OCCURRENCE_KINDS) target.byKind[k] += source.byKind[k] * factor;
}

function scale(source: Accumulator, factor: number): Accumulator {
  const result = emptyAccumulator();
  add(result, source, factor);
  return result;
}

/** Soma dos pesos de uma semana ao longo da janela: quantas "semanas efetivas" o histórico representa. */
const EFFECTIVE_WEEKS = Array.from({ length: HISTORY_WEEKS }, (_, k) => 0.5 ** (k / HALF_LIFE_WEEKS)).reduce((a, b) => a + b, 0);

export interface RiskModel {
  builtAt: Date;
  occurrencesUsed: number;
  /** Expectativa por região → dia da semana (0–6) → hora (0–23). */
  expect: (regionId: string, weekday: number, hour: number) => SlotExpectation;
  /** Índice 0–100: em quantos % dos horários da cidade a carga esperada é menor ou igual a esta. */
  riskIndex: (load: number) => number;
  /** Ocorrências por semana nas últimas 4 semanas e nas 8 anteriores, por região (para explicar tendências). */
  weeklyRate: Map<string, { recent: number; previous: number }>;
}

/**
 * Aprende o padrão de ocorrências de cada região por dia da semana e hora, a partir do histórico
 * gravado no banco (nunca do perfil usado para gerar os dados de exemplo).
 */
export async function buildRiskModel(now = new Date()): Promise<RiskModel> {
  const since = new Date(now.getTime() - HISTORY_WEEKS * WEEK_MS);
  const [occurrences, regions] = await Promise.all([
    prisma.occurrence.findMany({
      where: { occurredAt: { gte: since }, regionId: { not: null } },
      select: { regionId: true, kind: true, severity: true, occurredAt: true, agentsDispatched: true },
    }),
    prisma.region.findMany({ select: { id: true } }),
  ]);

  // Acumula cada ocorrência no seu horário, com o peso da idade
  const slots = new Map<string, Accumulator>();
  const weeklyRate = new Map(regions.map((r) => [r.id, { recent: 0, previous: 0 }]));
  for (const o of occurrences) {
    const ageWeeks = Math.floor((now.getTime() - o.occurredAt.getTime()) / WEEK_MS);
    const weight = 0.5 ** (ageWeeks / HALF_LIFE_WEEKS);
    const kind = o.kind as OccurrenceKind;
    const key = `${o.regionId}|${cityWeekday(o.occurredAt)}|${cityHour(o.occurredAt)}`;
    const slot = slots.get(key) ?? emptyAccumulator();
    slot.occurrences += weight;
    slot.load += weight * SEVERITY_WEIGHT[o.severity as AlertSeverity];
    slot.agentHours += weight * o.agentsDispatched * ((HANDLING_MINUTES[kind] ?? 60) / 60);
    slot.byKind[kind] += weight;
    slots.set(key, slot);

    const rate = weeklyRate.get(o.regionId!);
    if (rate && ageWeeks < 4) rate.recent += 1 / 4;
    else if (rate && ageWeeks < 12) rate.previous += 1 / 8;
  }

  // Padrão geral da região por hora (todos os dias) e peso relativo de cada dia da semana
  const hourly = new Map<string, Accumulator>();
  const weekdayTotals = new Map<string, number[]>();
  for (const [key, slot] of slots) {
    const [regionId, weekday, hour] = key.split("|");
    const h = `${regionId}|${hour}`;
    const acc = hourly.get(h) ?? emptyAccumulator();
    add(acc, slot);
    hourly.set(h, acc);
    const totals = weekdayTotals.get(regionId) ?? Array(7).fill(0);
    totals[Number(weekday)] += slot.occurrences;
    weekdayTotals.set(regionId, totals);
  }
  const weekdayFactor = (regionId: string, weekday: number) => {
    const totals = weekdayTotals.get(regionId);
    if (!totals) return 1;
    const mean = totals.reduce((a, b) => a + b, 0) / 7;
    return mean > 0 ? totals[weekday] / mean : 1;
  };

  const expect = (regionId: string, weekday: number, hour: number): SlotExpectation => {
    const slot = slots.get(`${regionId}|${weekday}|${hour}`) ?? emptyAccumulator();
    // Taxa "emprestada" do padrão da região: média da hora em todos os dias, ajustada pelo dia da semana
    const prior = scale(hourly.get(`${regionId}|${hour}`) ?? emptyAccumulator(), weekdayFactor(regionId, weekday) / (7 * EFFECTIVE_WEEKS));
    const blended = emptyAccumulator();
    add(blended, slot);
    add(blended, prior, SHRINK_WEEKS);
    return scale(blended, 1 / (EFFECTIVE_WEEKS + SHRINK_WEEKS));
  };

  // Distribuição da carga esperada em todos os horários de todas as regiões, para o índice 0–100
  const loads = regions
    .flatMap((r) => Array.from({ length: 7 * 24 }, (_, i) => expect(r.id, Math.floor(i / 24), i % 24).load))
    .sort((a, b) => a - b);
  const riskIndex = (load: number) => {
    if (!loads.length || load <= 0) return 0;
    let below = 0;
    while (below < loads.length && loads[below] <= load) below++;
    return Math.round((below / loads.length) * 100);
  };

  return { builtAt: now, occurrencesUsed: occurrences.length, expect, riskIndex, weeklyRate };
}

// O histórico muda devagar: o modelo é reconstruído no máximo a cada 5 minutos.
const CACHE_MS = 5 * 60 * 1000;
let cached: RiskModel | null = null;

export async function getRiskModel(now = new Date()) {
  if (!cached || now.getTime() - cached.builtAt.getTime() > CACHE_MS) cached = await buildRiskModel(now);
  return cached;
}
