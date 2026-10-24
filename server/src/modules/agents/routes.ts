import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http-error.js";

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
});

const agentFilters = z.object({
  role: z.enum(AGENT_ROLES).optional(),
  active: z.enum(["true", "false"]).optional(),
  q: z.string().optional(),
});

export const agentsRouter = Router();

agentsRouter.get("/", async (req, res) => {
  const filters = agentFilters.parse(req.query);
  const agents = await prisma.agent.findMany({
    where: {
      role: filters.role,
      active: filters.active === undefined ? undefined : filters.active === "true",
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
