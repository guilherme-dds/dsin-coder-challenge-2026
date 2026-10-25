import { prisma } from "../../lib/prisma.js";

const HOUR_MS = 60 * 60 * 1000;
/** Leituras e trilhas brutas ficam 24 h no banco; o histórico de longo prazo é papel do PROMETHEUS. */
const RETENTION_MS = 24 * HOUR_MS;

export async function pruneTelemetry(now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  await prisma.$transaction([
    prisma.telemetryReading.deleteMany({ where: { receivedAt: { lt: cutoff } } }),
    prisma.agentPosition.deleteMany({ where: { recordedAt: { lt: cutoff } } }),
  ]);
}

export function startRetentionJob() {
  const run = () => pruneTelemetry().catch((err) => console.error("Falha ao limpar telemetria antiga:", err));
  run();
  return setInterval(run, HOUR_MS);
}
