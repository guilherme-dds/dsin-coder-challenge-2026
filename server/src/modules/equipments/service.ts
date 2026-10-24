import type { Equipment, EquipmentType, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError, notFound } from "../../lib/http-error.js";
import { buildAttributesValidator, type AttributeField } from "../../domain/dynamic-attributes.js";
import { canTransition, type EquipmentStatus, type MaintenanceType } from "../../domain/status.js";
import { urgency } from "../../domain/urgency.js";
import { connectivity } from "../../domain/connectivity.js";
import { toTypeDto } from "../equipment-types/routes.js";

const DAY_MS = 24 * 60 * 60 * 1000;

type EquipmentWithType = Equipment & { type: EquipmentType };

export function toEquipmentDto(equipment: EquipmentWithType) {
  return {
    ...equipment,
    type: toTypeDto(equipment.type),
    attributes: JSON.parse(equipment.attributes) as Record<string, unknown>,
    urgency: urgency({
      status: equipment.status as EquipmentStatus,
      maintenanceType: equipment.maintenanceType as MaintenanceType,
      nextMaintenanceAt: equipment.nextMaintenanceAt,
    }),
    connectivity: connectivity(equipment.status as EquipmentStatus, equipment.lastSeenAt),
  };
}

/** Valida os atributos dinâmicos contra a definição do tipo e devolve o JSON serializado. */
export async function validateAttributes(typeId: string, attributes: Record<string, unknown>) {
  const type = await prisma.equipmentType.findUnique({ where: { id: typeId } });
  if (!type) throw new HttpError(400, "Tipo de equipamento inexistente");

  const fields = JSON.parse(type.attributesSchema) as AttributeField[];
  const result = buildAttributesValidator(fields).safeParse(attributes);
  if (!result.success) {
    throw new HttpError(400, "Atributos inválidos para o tipo " + type.name, result.error.flatten());
  }
  return JSON.stringify(result.data);
}

/**
 * Altera a situação respeitando a máquina de estados e aplica as regras de manutenção:
 * - mau funcionamento gera manutenção IMEDIATA;
 * - voltar a operar após manutenção reprograma a próxima manutenção periódica.
 */
export async function changeStatus(id: string, to: EquipmentStatus, note?: string, agentId?: string | null) {
  const equipment = await prisma.equipment.findUnique({ where: { id } });
  if (!equipment) throw notFound("Equipamento");

  const from = equipment.status as EquipmentStatus;
  if (!canTransition(from, to)) {
    throw new HttpError(422, `Transição não permitida: ${from} → ${to}`);
  }

  const data: Prisma.EquipmentUpdateInput = { status: to };
  let maintenanceDone = false;

  if (to === "MAU_FUNCIONAMENTO") {
    data.maintenanceType = "IMEDIATA";
  } else if (to === "OPERACIONAL" && (from === "EM_MANUTENCAO" || from === "MAU_FUNCIONAMENTO")) {
    maintenanceDone = true;
    if (equipment.maintenanceIntervalDays) {
      data.maintenanceType = "PERIODICA";
      data.nextMaintenanceAt = new Date(Date.now() + equipment.maintenanceIntervalDays * DAY_MS);
    } else {
      data.maintenanceType = "NENHUMA";
      data.nextMaintenanceAt = null;
    }
  }

  const events: Prisma.EquipmentEventCreateManyEquipmentInput[] = [
    { kind: "STATUS_ALTERADO", fromStatus: from, toStatus: to, note, agentId: agentId ?? null },
  ];
  if (maintenanceDone) events.push({ kind: "MANUTENCAO_CONCLUIDA", agentId: agentId ?? null });

  const updated = await prisma.equipment.update({
    where: { id },
    data: { ...data, events: { createMany: { data: events } } },
    include: { type: true },
  });
  return toEquipmentDto(updated);
}
