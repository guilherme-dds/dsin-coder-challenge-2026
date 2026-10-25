import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http-error.js";
import { AGENT_FIELD_STATUSES } from "../../domain/field-status.js";
import { scheduleAlertEvaluation } from "../alerts/engine.js";

export const AGENT_ROLES = ["AGENTE_TRANSITO", "GUARDA_MUNICIPAL", "POLICIAL_MILITAR"] as const;
export const SHIFTS = ["MANHA", "TARDE", "NOITE", "MADRUGADA"] as const;

const agentInput = z.object({
  name: z.string().trim().min(1),
  registration: z.string().trim().min(1),
  role: z.enum(AGENT_ROLES),
  rank: z.string().trim().nullish(),
  phone: z.string().trim().nullish(),
  email: z.string().trim().email().nullish().or(z.literal("")),
  shift: z.enum(SHIFTS).nullish(),
  baseName: z.string().trim().min(1),
  district: z.string().trim().min(1),
  city: z.string().trim().min(1),
  state: z.string().trim().length(2).toUpperCase(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  active: z.boolean().default(true),
  fieldStatus: z.enum(AGENT_FIELD_STATUSES).optional(),
});

/** Posição (e, opcionalmente, situação) reportada pelo dispositivo da equipe em campo. */
const positionInput = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  fieldStatus: z.enum(AGENT_FIELD_STATUSES).optional(),
  recordedAt: z.coerce.date().optional(),
});

const trailFilters = z.object({ minutes: z.coerce.number().int().positive().max(24 * 60).default(30) });

const agentFilters = z.object({
  role: z.enum(AGENT_ROLES).optional(),
  active: z.enum(["true", "false"]).optional(),
  fieldStatus: z.enum(AGENT_FIELD_STATUSES).optional(),
  q: z.string().optional(),
});

export const agentsRouter = Router();

agentsRouter.get("/", async (req, res) => {
  const filters = agentFilters.parse(req.query);
  const agents = await prisma.agent.findMany({
    where: {
      role: filters.role,
      active: filters.active === undefined ? undefined : filters.active === "true",
      fieldStatus: filters.fieldStatus,
      OR: filters.q ? [{ name: { contains: filters.q } }, { registration: { contains: filters.q } }] : undefined,
    },
    orderBy: { name: "asc" },
    include: { _count: { select: { responsibleFor: true } } },
  });
  res.json(agents);
});

agentsRouter.get("/:id", async (req, res) => {
  const agent = await prisma.agent.findUnique({
    where: { id: req.params.id },
    include: {
      responsibleFor: { include: { type: { select: { name: true } } } },
      events: { orderBy: { createdAt: "desc" }, take: 20, include: { equipment: { select: { id: true, serialNumber: true } } } },
    },
  });
  if (!agent) throw notFound("Agente");
  res.json(agent);
});

agentsRouter.post("/", async (req, res) => {
  const agent = await prisma.agent.create({ data: agentInput.parse(req.body) });
  res.status(201).json(agent);
});

agentsRouter.put("/:id", async (req, res) => {
  const agent = await prisma.agent.update({ where: { id: req.params.id }, data: agentInput.parse(req.body) });
  res.json(agent);
});

agentsRouter.post("/:id/position", async (req, res) => {
  const { latitude, longitude, fieldStatus, recordedAt = new Date() } = positionInput.parse(req.body);
  const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
  if (!agent) throw notFound("Agente");

  // Uma posição atrasada entra na trilha, mas não substitui a posição atual do agente.
  const isLatest = !agent.lastPositionAt || recordedAt >= agent.lastPositionAt;
  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: {
      positions: { create: { latitude, longitude, recordedAt } },
      ...(isLatest && { latitude, longitude, lastPositionAt: recordedAt }),
      // Receber posição prova que há sinal: sai de SEM_SINAL mesmo sem informar a situação.
      fieldStatus: fieldStatus ?? (agent.fieldStatus === "SEM_SINAL" ? "DISPONIVEL" : undefined),
    },
  });
  scheduleAlertEvaluation();
  res.status(202).json(updated);
});

/** Trilha recente do agente, da posição mais antiga para a mais nova. */
agentsRouter.get("/:id/positions", async (req, res) => {
  const { minutes } = trailFilters.parse(req.query);
  const positions = await prisma.agentPosition.findMany({
    where: { agentId: req.params.id, recordedAt: { gte: new Date(Date.now() - minutes * 60 * 1000) } },
    orderBy: { recordedAt: "asc" },
    select: { latitude: true, longitude: true, recordedAt: true },
  });
  res.json(positions);
});
