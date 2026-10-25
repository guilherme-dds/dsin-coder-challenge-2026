import { prisma } from "../../lib/prisma.js";
import { buildOverview } from "./service.js";

const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;

/** Registra a disponibilidade atual da cidade (regionId nulo) e de cada região, para o gráfico histórico. */
export async function takeSnapshot(now = new Date()) {
  const { city, regions } = await buildOverview();
  const scopes = [{ id: null, ...city }, ...regions.filter((r) => r.id !== null)];
  await prisma.availabilitySnapshot.createMany({
    data: scopes.map((s) => ({
      takenAt: now,
      regionId: s.id,
      total: s.total,
      installed: s.installed,
      operational: s.operational,
      unavailable: s.unavailable,
      activeAgents: s.activeAgents,
      openAlerts: Object.values(s.openAlerts).reduce((sum, n) => sum + n, 0),
    })),
  });
}

/** Fotografa a cada 15 min; na partida, só se a última fotografia já estiver vencida. */
export async function startSnapshotJob() {
  const run = () => takeSnapshot().catch((err) => console.error("Falha ao registrar disponibilidade:", err));
  const last = await prisma.availabilitySnapshot.findFirst({ where: { regionId: null }, orderBy: { takenAt: "desc" } });
  if (!last || Date.now() - last.takenAt.getTime() >= SNAPSHOT_INTERVAL_MS) run();
  return setInterval(run, SNAPSHOT_INTERVAL_MS);
}
