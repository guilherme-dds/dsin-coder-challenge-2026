import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { HttpError, notFound } from "../../lib/http-error.js";
import { ALERT_SEVERITIES } from "../../domain/alerts.js";
import { AGENTS_BY_SEVERITY, OCCURRENCE_KINDS } from "../../domain/occurrences.js";
import { loadRegionIndex } from "../regions/service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 60 * 1000;

const occurrenceInput = z.object({
  kind: z.enum(OCCURRENCE_KINDS),
  severity: z.enum(ALERT_SEVERITIES).default("MEDIA"),
  district: z.string().trim().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  occurredAt: z.coerce
    .date()
    .refine((d) => d.getTime() <= Date.now() + CLOCK_SKEW_MS, "data no futuro")
    .optional(),
  /** Sem informar, assume o empenho típico para a gravidade. */
  agentsDispatched: z.number().int().positive().max(50).optional(),
  equipmentId: z.string().nullish(),
  note: z.string().trim().max(500).optional(),
});

const occurrenceFilters = z.object({
  /** Janela em dias a partir de agora (padrão: últimos 7 dias). */
  days: z.coerce.number().int().positive().max(365).default(7),
  regionId: z.string().optional(),
  kind: z.enum(OCCURRENCE_KINDS).optional(),
  open: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().positive().max(2000).default(500),
});

export const occurrencesRouter = Router();

occurrencesRouter.get("/", async (req, res) => {
  const filters = occurrenceFilters.parse(req.query);
  const occurrences = await prisma.occurrence.findMany({
    where: {
      occurredAt: { gte: new Date(Date.now() - filters.days * DAY_MS) },
      regionId: filters.regionId,
      kind: filters.kind,
      resolvedAt: filters.open === undefined ? undefined : filters.open === "true" ? null : { not: null },
    },
    include: { region: { select: { id: true, code: true, name: true } } },
    orderBy: { occurredAt: "desc" },
    take: filters.limit,
  });
  res.json(occurrences);
});

/** Registro de uma ocorrência pela equipe em campo (ou pela integração com o 190/153). */
occurrencesRouter.post("/", async (req, res) => {
  const input = occurrenceInput.parse(req.body);
  const { regionOf } = await loadRegionIndex();
  const occurrence = await prisma.occurrence.create({
    data: {
      ...input,
      occurredAt: input.occurredAt ?? new Date(),
      agentsDispatched: input.agentsDispatched ?? AGENTS_BY_SEVERITY[input.severity],
      regionId: regionOf(input.district)?.id ?? null,
    },
  });
  res.status(201).json(occurrence);
});

occurrencesRouter.post("/:id/resolve", async (req, res) => {
  const occurrence = await prisma.occurrence.findUnique({ where: { id: req.params.id } });
  if (!occurrence) throw notFound("Ocorrência");
  if (occurrence.resolvedAt) throw new HttpError(422, "Ocorrência já encerrada");
  res.json(await prisma.occurrence.update({ where: { id: occurrence.id }, data: { resolvedAt: new Date() } }));
});
