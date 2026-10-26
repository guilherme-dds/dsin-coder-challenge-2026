import { prisma } from "../../lib/prisma.js";
import { cityHour } from "../../domain/time.js";
import { loadRegionIndex } from "../regions/service.js";
import { forecastRisk, type HourForecast } from "./risk.js";

/** Turnos das equipes e as horas (locais) que cada um cobre. */
export const SHIFT_HOURS: Record<string, [number, number]> = {
  MADRUGADA: [0, 6],
  MANHA: [6, 12],
  TARDE: [12, 18],
  NOITE: [18, 24],
};

const SHIFT_LABELS: Record<string, string> = { MADRUGADA: "Madrugada", MANHA: "Manhã", TARDE: "Tarde", NOITE: "Noite" };

const shiftOf = (hour: number) => Object.entries(SHIFT_HOURS).find(([, [from, to]]) => hour >= from && hour < to)![0];

/** Chance aceitável de, no pico, todas as equipes estarem ocupadas quando surge uma nova ocorrência. */
export const SATURATION_TARGET = 0.2;

/**
 * Agentes necessários na hora: o menor efetivo N com o qual a chance de haver N ou mais agentes
 * ocupados ao mesmo tempo (distribuição de Poisson com média = agentes ocupados esperados) fica
 * abaixo de SATURATION_TARGET. Abaixo de 0,05 agente ocupado, a hora é tratada como sem demanda.
 */
export function agentsNeeded(busyAgents: number) {
  if (busyAgents < 0.05) return 0;
  let n = 0;
  let below = 0; // P(X < n)
  let term = Math.exp(-busyAgents); // P(X = n)
  while (1 - below > SATURATION_TARGET) {
    below += term;
    n++;
    term *= busyAgents / n;
  }
  return n;
}

export type StaffingStatus = "REFORCAR" | "ADEQUADO" | "FOLGA";

export interface StaffingRegion {
  region: { id: string; code: string; name: string };
  expectedOccurrences: number;
  peakHour: number;
  needed: number;
  available: number;
  status: StaffingStatus;
  /** Agentes que faltam (positivo) ou sobram (negativo). */
  gap: number;
  suggestion: string;
}

export interface StaffingWindow {
  shift: string;
  label: string;
  start: string;
  end: string;
  /** Agentes a mais necessários no turno, somando as regiões com déficit. */
  reinforcement: number;
  regions: StaffingRegion[];
}

/**
 * Recomendação de efetivo para os próximos turnos: compara a demanda prevista em cada região
 * com os agentes escalados para aquele turno com base na região, e sugere de onde remanejar.
 */
export async function recommendStaffing(hours = 24, now = new Date()) {
  const [{ regions: forecasts }, agents, index] = await Promise.all([
    forecastRisk(hours, now),
    prisma.agent.findMany({ where: { active: true }, select: { shift: true, district: true } }),
    loadRegionIndex(),
  ]);

  // Agrupa as horas previstas em janelas de turno contíguas (ex.: o resto da tarde de hoje, a noite, a madrugada...)
  const windows: { shift: string; hours: number[] }[] = [];
  forecasts[0]?.hours.forEach((h, i) => {
    const shift = shiftOf(h.hour);
    const last = windows.at(-1);
    if (last && last.shift === shift) last.hours.push(i);
    else windows.push({ shift, hours: [i] });
  });

  const result: StaffingWindow[] = windows.map(({ shift, hours: offsets }) => {
    const regions = forecasts.map((f): StaffingRegion => {
      const slice: HourForecast[] = offsets.map((i) => f.hours[i]);
      const peak = slice.reduce((best, h) => (h.expectedBusyAgents > best.expectedBusyAgents ? h : best), slice[0]);
      const needed = agentsNeeded(peak.expectedBusyAgents);
      // Agente sem turno definido conta como disponível em qualquer turno
      const available = agents.filter(
        (a) => (a.shift === shift || a.shift === null) && index.regionOf(a.district)?.id === f.region.id,
      ).length;
      const gap = needed - available;
      return {
        region: f.region,
        expectedOccurrences: Math.round(slice.reduce((sum, h) => sum + h.expectedOccurrences, 0) * 10) / 10,
        peakHour: peak.hour,
        needed,
        available,
        status: gap > 0 ? "REFORCAR" : gap <= -2 ? "FOLGA" : "ADEQUADO",
        gap,
        suggestion: "",
      };
    });

    // Sugestões: quem tem folga no mesmo turno pode cobrir quem precisa de reforço
    const surplus = regions.filter((r) => r.gap < 0).map((r) => ({ name: r.region.name, spare: -r.gap }));
    for (const r of regions.filter((x) => x.status === "REFORCAR").sort((a, b) => b.gap - a.gap)) {
      const donor = surplus.find((s) => s.spare > 0);
      if (donor) {
        const moved = Math.min(donor.spare, r.gap);
        donor.spare -= moved;
        r.suggestion = `Remanejar ${moved} agente(s) da ${donor.name} e escalar mais ${r.gap - moved} para o pico das ${r.peakHour}h.`;
        if (moved === r.gap) r.suggestion = `Remanejar ${moved} agente(s) da ${donor.name} para o pico das ${r.peakHour}h.`;
      } else {
        r.suggestion = `Escalar ${r.gap} agente(s) a mais para o pico das ${r.peakHour}h (sem folga em outras regiões neste turno).`;
      }
    }
    for (const r of regions.filter((x) => x.status === "ADEQUADO")) r.suggestion = "Efetivo escalado cobre a demanda prevista.";
    for (const r of regions.filter((x) => x.status === "FOLGA")) {
      r.suggestion = `${-r.gap} agente(s) acima da demanda prevista: podem apoiar outras regiões.`;
    }

    const start = new Date(forecasts[0].hours[offsets[0]].at);
    const end = new Date(new Date(forecasts[0].hours[offsets.at(-1)!].at).getTime() + 60 * 60 * 1000);
    return {
      shift,
      label: SHIFT_LABELS[shift],
      start: start.toISOString(),
      end: end.toISOString(),
      reinforcement: regions.reduce((sum, r) => sum + Math.max(0, r.gap), 0),
      regions: regions.sort((a, b) => b.gap - a.gap),
    };
  });

  return { windows: result, currentShift: shiftOf(cityHour(now)) };
}
