import { prisma } from "../../lib/prisma.js";
import { rollupTelemetry } from "./rollup.js";

const HOUR_MS = 60 * 60 * 1000;
/** Leituras e trilhas brutas ficam 24 h no banco; o histórico longo fica nos resumos diários. */
const RETENTION_MS = 24 * HOUR_MS;
/** O histórico de disponibilidade alimenta gráficos e tendências de até 30 dias. */
const SNAPSHOT_RETENTION_MS = 30 * 24 * HOUR_MS;

export async function pruneTelemetry(now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  await prisma.$transaction([
    prisma.telemetryReading.deleteMany({ where: { receivedAt: { lt: cutoff } } }),
    prisma.agentPosition.deleteMany({ where: { recordedAt: { lt: cutoff } } }),
    prisma.availabilitySnapshot.deleteMany({
      where: { takenAt: { lt: new Date(now.getTime() - SNAPSHOT_RETENTION_MS) } },
    }),
  ]);
}

/** De hora em hora: primeiro consolida a telemetria do dia, depois apaga o que passou da retenção. */
export function startRetentionJob() {
  const run = () =>
    rollupTelemetry()
      .then(() => pruneTelemetry())
      .catch((err) => console.error("Falha ao consolidar ou limpar a telemetria:", err));
  run();
  return setInterval(run, HOUR_MS);
}
