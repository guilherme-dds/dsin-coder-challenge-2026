import { prisma } from "../../lib/prisma.js";
import { cityDayStart } from "../../domain/time.js";
import type { TelemetryMetrics } from "../../domain/telemetry.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface Accumulator {
  sum: number;
  min: number;
  max: number;
  samples: number;
}

/** Recalcula o resumo de um dia (horário da cidade) a partir das leituras brutas ainda no banco. */
async function rollupDay(dayStart: Date, now: Date) {
  const dayEnd = new Date(Math.min(dayStart.getTime() + DAY_MS, now.getTime()));
  const readings = await prisma.telemetryReading.findMany({
    where: { receivedAt: { gte: dayStart, lt: dayEnd } },
    select: { equipmentId: true, metrics: true },
  });

  const totals = new Map<string, Accumulator>();
  for (const r of readings) {
    for (const [metric, value] of Object.entries(JSON.parse(r.metrics) as TelemetryMetrics)) {
      const key = `${r.equipmentId}|${metric}`;
      const acc = totals.get(key);
      if (!acc) totals.set(key, { sum: value, min: value, max: value, samples: 1 });
      else {
        acc.sum += value;
        acc.min = Math.min(acc.min, value);
        acc.max = Math.max(acc.max, value);
        acc.samples++;
      }
    }
  }

  await prisma.$transaction(
    [...totals].map(([key, acc]) => {
      const [equipmentId, metric] = key.split("|");
      const values = { avg: acc.sum / acc.samples, min: acc.min, max: acc.max, samples: acc.samples };
      return prisma.telemetryDaily.upsert({
        where: { equipmentId_date_metric: { equipmentId, date: dayStart, metric } },
        create: { equipmentId, date: dayStart, metric, ...values },
        update: values,
      });
    }),
  );
  return totals.size;
}

/**
 * Consolida a telemetria bruta em resumos diários antes que a retenção de 24 h a apague.
 * Roda de hora em hora: logo depois da meia-noite, fecha também o dia anterior.
 */
export async function rollupTelemetry(now = new Date()) {
  const days = new Set([cityDayStart(new Date(now.getTime() - HOUR_MS)).getTime(), cityDayStart(now).getTime()]);
  for (const day of days) await rollupDay(new Date(day), now);
}
