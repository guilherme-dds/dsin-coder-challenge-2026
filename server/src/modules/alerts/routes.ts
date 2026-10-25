import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, notFound } from "../../lib/http-error.js";
import { ALERT_SEVERITIES, ALERT_STATUSES, type AlertSeverity } from "../../domain/alerts.js";

const alertFilters = z.object({
  /** Lista separada por vírgula; por padrão, só os alertas não resolvidos. */
  status: z
    .string()
    .default("ABERTO,RECONHECIDO")
    .transform((s) => s.split(","))
    .pipe(z.array(z.enum(ALERT_STATUSES))),
  severity: z.enum(ALERT_SEVERITIES).optional(),
  regionId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).default(200),
});

const acknowledgeInput = z.object({ by: z.string().trim().min(1).optional() });

const severityRank = (severity: string) => ALERT_SEVERITIES.indexOf(severity as AlertSeverity);

export const alertsRouter = Router();

alertsRouter.get("/", async (req, res) => {
  const filters = alertFilters.parse(req.query);
  const alerts = await prisma.alert.findMany({
    where: { status: { in: filters.status }, severity: filters.severity, regionId: filters.regionId },
    include: {
      equipment: {
        select: {
          id: true,
          serialNumber: true,
          district: true,
          latitude: true,
          longitude: true,
          type: { select: { code: true, name: true } },
        },
      },
      agent: { select: { id: true, name: true, role: true, latitude: true, longitude: true } },
      region: { select: { id: true, code: true, name: true } },
    },
    orderBy: { openedAt: "desc" },
    take: filters.limit,
  });
  // Mais graves primeiro; dentro da mesma gravidade, os mais recentes (o sort é estável).
  alerts.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  res.json(alerts);
});

/** O operador assume o alerta. A resolução é automática, quando a condição que o gerou deixa de existir. */
alertsRouter.post("/:id/acknowledge", async (req, res) => {
  const { by } = acknowledgeInput.parse(req.body ?? {});
  const alert = await prisma.alert.findUnique({ where: { id: req.params.id } });
  if (!alert) throw notFound("Alerta");
  if (alert.status !== "ABERTO") throw new HttpError(422, "Somente alertas abertos podem ser reconhecidos");

  const updated = await prisma.alert.update({
    where: { id: alert.id },
    data: { status: "RECONHECIDO", acknowledgedAt: new Date(), acknowledgedBy: by ?? "Central de Operações" },
  });
  res.json(updated);
});
