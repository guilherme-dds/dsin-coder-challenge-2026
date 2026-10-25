import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http-error.js";
import { STATUS_TRANSITIONS, type EquipmentStatus } from "../../domain/status.js";
import { urgencyPriority } from "../../domain/urgency.js";
import {
  equipmentFilters,
  equipmentInput,
  equipmentUpdateInput,
  scheduleMaintenanceInput,
  statusChangeInput,
  telemetryFilters,
} from "./schemas.js";
import type { TelemetryMetrics } from "../../domain/telemetry.js";
import { changeStatus, toEquipmentDto, validateAttributes } from "./service.js";
import { scheduleAlertEvaluation } from "../alerts/engine.js";

export const equipmentsRouter = Router();

equipmentsRouter.get("/", async (req, res) => {
  const filters = equipmentFilters.parse(req.query);
  const where: Prisma.EquipmentWhereInput = {
    typeId: filters.typeId,
    status: filters.status,
    district: filters.district,
  };
  if (filters.q) {
    where.OR = [
      { serialNumber: { contains: filters.q } },
      { brand: { contains: filters.q } },
      { model: { contains: filters.q } },
      { street: { contains: filters.q } },
      { reference: { contains: filters.q } },
    ];
  }

  const equipments = await prisma.equipment.findMany({ where, include: { type: true } });
  const dtos = equipments
    .map(toEquipmentDto)
    // A urgência é calculada (depende da data atual), por isso o filtro é feito em memória.
    .filter((e) => !filters.urgency || e.urgency === filters.urgency)
    .sort((a, b) => urgencyPriority(a.urgency) - urgencyPriority(b.urgency));
  res.json(dtos);
});

equipmentsRouter.get("/:id", async (req, res) => {
  const equipment = await prisma.equipment.findUnique({
    where: { id: req.params.id },
    include: {
      type: true,
      responsibleAgent: true,
      events: { orderBy: { createdAt: "desc" }, include: { agent: { select: { id: true, name: true } } } },
    },
  });
  if (!equipment) throw notFound("Equipamento");

  const { events, responsibleAgent, ...rest } = equipment;
  res.json({
    ...toEquipmentDto(rest),
    responsibleAgent,
    events,
    allowedTransitions: STATUS_TRANSITIONS[equipment.status as EquipmentStatus],
  });
});

/** Leituras mais recentes do dispositivo, da mais nova para a mais antiga. */
equipmentsRouter.get("/:id/telemetry", async (req, res) => {
  const { limit } = telemetryFilters.parse(req.query);
  const readings = await prisma.telemetryReading.findMany({
    where: { equipmentId: req.params.id },
    orderBy: { receivedAt: "desc" },
    take: limit,
  });
  res.json(readings.map((r) => ({ receivedAt: r.receivedAt, metrics: JSON.parse(r.metrics) as TelemetryMetrics })));
});

equipmentsRouter.post("/", async (req, res) => {
  const { attributes, ...input } = equipmentInput.parse(req.body);
  const serializedAttributes = await validateAttributes(input.typeId, attributes);

  const equipment = await prisma.equipment.create({
    data: {
      ...input,
      attributes: serializedAttributes,
      events: { create: { kind: "CRIADO", toStatus: input.status } },
    },
    include: { type: true },
  });
  scheduleAlertEvaluation();
  res.status(201).json(toEquipmentDto(equipment));
});

equipmentsRouter.put("/:id", async (req, res) => {
  const { attributes, ...input } = equipmentUpdateInput.parse(req.body);
  const serializedAttributes = await validateAttributes(input.typeId, attributes);

  const equipment = await prisma.equipment.update({
    where: { id: req.params.id },
    data: {
      ...input,
      attributes: serializedAttributes,
      events: { create: { kind: "ATUALIZADO" } },
    },
    include: { type: true },
  });
  scheduleAlertEvaluation();
  res.json(toEquipmentDto(equipment));
});

equipmentsRouter.post("/:id/status", async (req, res) => {
  const { status, note, agentId } = statusChangeInput.parse(req.body);
  const equipment = await changeStatus(req.params.id, status, note, agentId);
  scheduleAlertEvaluation();
  res.json(equipment);
});

equipmentsRouter.post("/:id/maintenance", async (req, res) => {
  const { date, note, agentId } = scheduleMaintenanceInput.parse(req.body);
  const equipment = await prisma.equipment.update({
    where: { id: req.params.id },
    data: {
      maintenanceType: "AGENDADA",
      nextMaintenanceAt: date,
      events: { create: { kind: "MANUTENCAO_AGENDADA", note, agentId: agentId ?? null } },
    },
    include: { type: true },
  });
  scheduleAlertEvaluation();
  res.json(toEquipmentDto(equipment));
});
