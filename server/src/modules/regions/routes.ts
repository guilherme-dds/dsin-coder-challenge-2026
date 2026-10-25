import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HEALTH_LEVELS } from "../../domain/availability.js";
import { buildOverview } from "./service.js";

const historyFilters = z.object({
  /** Sem região: histórico da cidade inteira. */
  regionId: z.string().optional(),
  hours: z.coerce.number().int().positive().max(24 * 7).default(24),
});

export const regionsRouter = Router();

/** Visão consolidada: como cada região está operando agora, das que exigem atenção para as normais. */
regionsRouter.get("/", async (_req, res) => {
  const { regions } = await buildOverview();
  regions.sort(
    (a, b) => HEALTH_LEVELS.indexOf(a.health) - HEALTH_LEVELS.indexOf(b.health) || a.availability - b.availability,
  );
  res.json(regions);
});

regionsRouter.get("/history", async (req, res) => {
  const { regionId, hours } = historyFilters.parse(req.query);
  const snapshots = await prisma.availabilitySnapshot.findMany({
    where: { regionId: regionId ?? null, takenAt: { gte: new Date(Date.now() - hours * 60 * 60 * 1000) } },
    orderBy: { takenAt: "asc" },
    select: {
      takenAt: true,
      total: true,
      installed: true,
      operational: true,
      unavailable: true,
      activeAgents: true,
      openAlerts: true,
    },
  });
  res.json(
    snapshots.map((s) => ({
      ...s,
      availability: s.installed ? Math.round((s.operational / s.installed) * 1000) / 10 : 100,
    })),
  );
});
