import { prisma } from "../../lib/prisma.js";
import { OCCURRENCE_KINDS, OCCURRENCE_LABELS, type OccurrenceKind } from "../../domain/occurrences.js";
import { WEEKDAY_LABELS, cityHour, cityWeekday } from "../../domain/time.js";
import { connectivity } from "../../domain/connectivity.js";
import type { EquipmentStatus } from "../../domain/status.js";
import { loadRegionIndex } from "../regions/service.js";
import { HISTORY_WEEKS, getRiskModel, type RiskModel, type SlotExpectation } from "./risk-model.js";

const HOUR_MS = 60 * 60 * 1000;

/** Quanto do momento atual (mais ou menos ocorrências que o esperado) se projeta nas próximas horas. */
const NOWCAST_WINDOW_HOURS = 3;
const NOWCAST_DECAY_HOURS = 3;
const NOWCAST_LIMITS: [number, number] = [0.7, 1.6];
/** Cada câmera fora do ar aumenta a expectativa de vandalismo e furto na região (até o teto). */
const CAMERA_DOWN_EFFECT = 0.12;
const CAMERA_DOWN_CAP = 1.4;
const CAMERA_SENSITIVE: OccurrenceKind[] = ["VANDALISMO", "FURTO"];

export const RISK_LEVELS = ["ALTO", "MODERADO", "BAIXO"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const riskLevel = (index: number): RiskLevel => (index >= 85 ? "ALTO" : index >= 60 ? "MODERADO" : "BAIXO");

export interface RiskFactor {
  label: string;
  detail: string;
}

export interface HourForecast {
  at: string;
  hour: number;
  weekday: number;
  riskIndex: number;
  level: RiskLevel;
  expectedOccurrences: number;
  /** Chance de ao menos uma ocorrência na hora. */
  probability: number;
  /** Agentes ocupados, em média, atendendo ocorrências nesta hora. */
  expectedBusyAgents: number;
  topKinds: { kind: OccurrenceKind; label: string; expected: number }[];
}

export interface RegionForecast {
  region: { id: string; code: string; name: string };
  now: HourForecast;
  peak: HourForecast;
  hours: HourForecast[];
  factors: RiskFactor[];
}

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const percent = (ratio: number) => `${ratio >= 1 ? "+" : ""}${Math.round((ratio - 1) * 100)}%`;

function adjust(e: SlotExpectation, factor: number, kindFactor: Partial<Record<OccurrenceKind, number>>): SlotExpectation {
  // Fator por tipo (câmeras fora do ar): soma as ocorrências extras daqueles tipos e escala o total na mesma proporção
  const extra = OCCURRENCE_KINDS.reduce((sum, k) => sum + e.byKind[k] * ((kindFactor[k] ?? 1) - 1), 0);
  const total = factor * (e.occurrences > 0 ? (e.occurrences + extra) / e.occurrences : 1);
  return {
    occurrences: e.occurrences * total,
    load: e.load * total,
    agentHours: e.agentHours * total,
    byKind: Object.fromEntries(
      OCCURRENCE_KINDS.map((k) => [k, e.byKind[k] * factor * (kindFactor[k] ?? 1)]),
    ) as Record<OccurrenceKind, number>,
  };
}

function toHourForecast(at: Date, e: SlotExpectation, model: RiskModel): HourForecast {
  const riskIndex = model.riskIndex(e.load);
  return {
    at: at.toISOString(),
    hour: cityHour(at),
    weekday: cityWeekday(at),
    riskIndex,
    level: riskLevel(riskIndex),
    expectedOccurrences: round(e.occurrences),
    probability: round(1 - Math.exp(-e.occurrences)),
    expectedBusyAgents: round(e.agentHours),
    topKinds: OCCURRENCE_KINDS.map((kind) => ({ kind, label: OCCURRENCE_LABELS[kind], expected: round(e.byKind[kind]) }))
      .filter((k) => k.expected >= 0.01)
      .sort((a, b) => b.expected - a.expected)
      .slice(0, 3),
  };
}

/** Início da hora cheia atual. */
const hourStart = (date: Date) => new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);

/**
 * Previsão de risco por região, hora a hora, para as próximas `hours` horas. Combina o padrão
 * histórico do horário com o que está acontecendo agora e com o estado das câmeras da região.
 */
export async function forecastRisk(hours = 24, now = new Date()): Promise<{ model: RiskModel; regions: RegionForecast[] }> {
  const model = await getRiskModel(now);
  const start = hourStart(now);
  const [index, recent, cameras] = await Promise.all([
    loadRegionIndex(),
    prisma.occurrence.groupBy({
      by: ["regionId"],
      where: { occurredAt: { gte: new Date(now.getTime() - NOWCAST_WINDOW_HOURS * HOUR_MS) }, regionId: { not: null } },
      _count: { _all: true },
    }),
    prisma.equipment.findMany({
      where: { type: { code: "CAMERA" } },
      select: { district: true, status: true, lastSeenAt: true },
    }),
  ]);
  const recentByRegion = new Map(recent.map((r) => [r.regionId, r._count._all]));

  const regions = index.regions.map((region): RegionForecast => {
    // Momento atual: ocorrências das últimas horas comparadas ao que o histórico previa para elas
    const expectedRecent = Array.from({ length: NOWCAST_WINDOW_HOURS }, (_, i) => {
      const at = new Date(start.getTime() - i * HOUR_MS);
      return model.expect(region.id, cityWeekday(at), cityHour(at)).occurrences;
    }).reduce((a, b) => a + b, 0);
    const actualRecent = recentByRegion.get(region.id) ?? 0;
    // +1 dos dois lados: com números pequenos, uma ocorrência isolada não dispara o ajuste
    const nowRatio = Math.min(NOWCAST_LIMITS[1], Math.max(NOWCAST_LIMITS[0], (actualRecent + 1) / (expectedRecent + 1)));

    const regionCameras = cameras.filter((c) => index.regionOf(c.district)?.id === region.id);
    const camerasDown = regionCameras.filter(
      (c) => c.status !== "OPERACIONAL" || connectivity(c.status as EquipmentStatus, c.lastSeenAt, now) === "OFFLINE",
    ).length;
    const cameraFactor = Math.min(CAMERA_DOWN_CAP, 1 + CAMERA_DOWN_EFFECT * camerasDown);
    const kindFactor = Object.fromEntries(CAMERA_SENSITIVE.map((k) => [k, cameraFactor]));

    const forecast = Array.from({ length: hours }, (_, i) => {
      const at = new Date(start.getTime() + i * HOUR_MS);
      const nowcast = 1 + (nowRatio - 1) * Math.exp(-i / NOWCAST_DECAY_HOURS);
      return toHourForecast(at, adjust(model.expect(region.id, cityWeekday(at), cityHour(at)), nowcast, kindFactor), model);
    });
    const peak = forecast.reduce((best, h) => (h.riskIndex > best.riskIndex ? h : best), forecast[0]);

    // Fatores: o que pesou na previsão, em linguagem de operação
    const factors: RiskFactor[] = [
      {
        label: "Padrão histórico",
        detail:
          `${WEEKDAY_LABELS[peak.weekday]} às ${peak.hour}h é o horário mais carregado das próximas ${hours} h: ` +
          `${peak.expectedOccurrences.toLocaleString("pt-BR")} ocorrência(s) esperada(s), com base nas últimas ${HISTORY_WEEKS} semanas.`,
      },
    ];
    const rate = model.weeklyRate.get(region.id);
    if (rate && rate.previous > 0) {
      const ratio = rate.recent / rate.previous;
      if (Math.abs(ratio - 1) >= 0.15) {
        factors.push({
          label: ratio > 1 ? "Tendência de alta" : "Tendência de queda",
          detail: `${percent(ratio)} de ocorrências por semana nas últimas 4 semanas em relação às 8 anteriores (${round(rate.recent, 1)} contra ${round(rate.previous, 1)} por semana).`,
        });
      }
    }
    if (nowRatio >= 1.2 || nowRatio <= 0.8) {
      factors.push({
        label: nowRatio > 1 ? "Momento acima do normal" : "Momento abaixo do normal",
        detail: `${actualRecent} ocorrência(s) nas últimas ${NOWCAST_WINDOW_HOURS} h, para ${round(expectedRecent, 1)} esperada(s): ajuste de ${percent(nowRatio)} nas próximas horas.`,
      });
    }
    if (camerasDown > 0) {
      factors.push({
        label: "Câmeras fora de operação",
        detail: `${camerasDown} câmera(s) sem operar ou sem comunicação na região: expectativa de vandalismo e furto ${percent(cameraFactor)}.`,
      });
    }

    return { region, now: forecast[0], peak, hours: forecast, factors };
  });

  regions.sort((a, b) => b.peak.riskIndex - a.peak.riskIndex || b.now.riskIndex - a.now.riskIndex);
  return { model, regions };
}

/** Mapa de calor semanal: risco esperado em cada dia da semana e hora (cidade ou uma região). */
export async function riskHeatmap(regionId?: string, now = new Date()) {
  const model = await getRiskModel(now);
  const { regions } = await loadRegionIndex();
  const scope = regionId ? regions.filter((r) => r.id === regionId) : regions;
  const cells = Array.from({ length: 7 }, (_, weekday) =>
    Array.from({ length: 24 }, (_, hour) => {
      const total = scope
        .map((r) => model.expect(r.id, weekday, hour))
        .reduce((acc, e) => ({ occurrences: acc.occurrences + e.occurrences, load: acc.load + e.load }), { occurrences: 0, load: 0 });
      // Para a cidade inteira o índice compara a soma das regiões com o horário médio de uma região
      const riskIndex = model.riskIndex(total.load / scope.length);
      return { weekday, hour, expectedOccurrences: round(total.occurrences), riskIndex, level: riskLevel(riskIndex) };
    }),
  );
  return { model, cells };
}
