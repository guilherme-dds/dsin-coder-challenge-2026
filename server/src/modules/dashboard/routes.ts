import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { URGENCY_LEVELS, urgencyPriority, type UrgencyLevel } from "../../domain/urgency.js";
import { toEquipmentDto } from "../equipments/service.js";

export const dashboardRouter = Router();

/** Indicadores consolidados da rede de equipamentos. */
dashboardRouter.get("/", async (_req, res) => {
  const [equipments, activeAgents] = await Promise.all([
    prisma.equipment.findMany({ include: { type: true } }),
    prisma.agent.count({ where: { active: true } }),
  ]);
  const dtos = equipments.map(toEquipmentDto);

  const byUrgency = Object.fromEntries(URGENCY_LEVELS.map((l) => [l, 0])) as Record<UrgencyLevel, number>;
  const byStatus: Record<string, number> = {};
  const byType: Record<string, { name: string; code: string; count: number }> = {};

  for (const e of dtos) {
    byUrgency[e.urgency]++;
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
    byType[e.typeId] ??= { name: e.type.name, code: e.type.code, count: 0 };
    byType[e.typeId].count++;
  }

  const critical = dtos
    .filter((e) => e.urgency === "CRITICO" || e.urgency === "ALERTA")
    .sort((a, b) => urgencyPriority(a.urgency) - urgencyPriority(b.urgency))
    .slice(0, 10);

  res.json({
    totals: { equipments: dtos.length, activeAgents },
    byUrgency,
    byStatus,
    byType: Object.values(byType).sort((a, b) => b.count - a.count),
    critical,
  });
});
