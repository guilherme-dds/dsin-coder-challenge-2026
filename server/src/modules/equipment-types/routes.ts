import { Router } from "express";
import { z } from "zod";
import type { EquipmentType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { notFound } from "../../lib/http-error.js";
import { attributesSchemaSchema, type AttributeField } from "../../domain/dynamic-attributes.js";

const typeInput = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/, "use MAIÚSCULAS_COM_UNDERLINE"),
  name: z.string().min(1),
  category: z.string().min(1),
  mobile: z.boolean().default(false),
  attributesSchema: attributesSchemaSchema.default([]),
});

export function toTypeDto(type: EquipmentType) {
  return { ...type, attributesSchema: JSON.parse(type.attributesSchema) as AttributeField[] };
}

export const equipmentTypesRouter = Router();

equipmentTypesRouter.get("/", async (_req, res) => {
  const types = await prisma.equipmentType.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { equipments: true } } },
  });
  res.json(types.map(toTypeDto));
});

equipmentTypesRouter.get("/:id", async (req, res) => {
  const type = await prisma.equipmentType.findUnique({ where: { id: req.params.id } });
  if (!type) throw notFound("Tipo de equipamento");
  res.json(toTypeDto(type));
});

equipmentTypesRouter.post("/", async (req, res) => {
  const input = typeInput.parse(req.body);
  const type = await prisma.equipmentType.create({
    data: { ...input, attributesSchema: JSON.stringify(input.attributesSchema) },
  });
  res.status(201).json(toTypeDto(type));
});

equipmentTypesRouter.put("/:id", async (req, res) => {
  const input = typeInput.parse(req.body);
  const type = await prisma.equipmentType.update({
    where: { id: req.params.id },
    data: { ...input, attributesSchema: JSON.stringify(input.attributesSchema) },
  });
  res.json(toTypeDto(type));
});
