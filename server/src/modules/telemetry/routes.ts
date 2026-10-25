import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { scheduleAlertEvaluation } from "../alerts/engine.js";

const CLOCK_SKEW_MS = 60 * 1000;

const readingInput = z.object({
  /** Os dispositivos se identificam pelo número de série gravado no equipamento. */
  serialNumber: z.string().trim().min(1),
  metrics: z.record(z.number()),
  receivedAt: z.coerce
    .date()
    .refine((d) => d.getTime() <= Date.now() + CLOCK_SKEW_MS, "data no futuro")
    .optional(),
});

/** Aceita uma leitura ou um lote, para que um concentrador envie vários dispositivos de uma vez. */
const telemetryInput = z.preprocess((body) => (Array.isArray(body) ? body : [body]), z.array(readingInput).min(1).max(500));

export const telemetryRouter = Router();

/** Ingestão de telemetria: registra as leituras e o último contato de cada dispositivo. */
telemetryRouter.post("/", async (req, res) => {
  const readings = telemetryInput.parse(req.body);
  const now = new Date();

  const serials = [...new Set(readings.map((r) => r.serialNumber))];
  const equipments = await prisma.equipment.findMany({
    where: { serialNumber: { in: serials } },
    select: { id: true, serialNumber: true },
  });
  const idBySerial = new Map(equipments.map((e) => [e.serialNumber, e.id]));

  const accepted = readings
    .filter((r) => idBySerial.has(r.serialNumber))
    .map((r) => ({
      equipmentId: idBySerial.get(r.serialNumber)!,
      metrics: JSON.stringify(r.metrics),
      receivedAt: r.receivedAt ?? now,
    }));

  // Último contato = leitura mais recente do lote; leituras atrasadas não fazem o relógio voltar.
  const lastSeen = new Map<string, Date>();
  for (const r of accepted) {
    const current = lastSeen.get(r.equipmentId);
    if (!current || r.receivedAt > current) lastSeen.set(r.equipmentId, r.receivedAt);
  }

  await prisma.$transaction([
    prisma.telemetryReading.createMany({ data: accepted }),
    ...[...lastSeen].map(([id, seenAt]) =>
      prisma.equipment.updateMany({
        where: { id, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: seenAt } }] },
        data: { lastSeenAt: seenAt },
      }),
    ),
  ]);
  if (accepted.length) scheduleAlertEvaluation();

  res.status(202).json({
    accepted: accepted.length,
    unknown: serials.filter((s) => !idBySerial.has(s)),
  });
});
