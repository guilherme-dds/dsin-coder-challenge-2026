import { z } from "zod";
import { EQUIPMENT_STATUSES, MAINTENANCE_TYPES } from "../../domain/status.js";
import { URGENCY_LEVELS } from "../../domain/urgency.js";
import { AGENCIES } from "../../domain/agency.js";

export const equipmentInput = z.object({
  typeId: z.string().min(1),
  serialNumber: z.string().trim().min(1),
  brand: z.string().trim().min(1),
  model: z.string().trim().min(1),
  status: z.enum(EQUIPMENT_STATUSES).default("NAO_INSTALADO"),
  // Opcional: na ausência, o banco assume TRANSITO (e uma edição não sobrescreve o valor atual).
  agency: z.enum(AGENCIES).optional(),

  zipCode: z.string().regex(/^\d{5}-?\d{3}$/, "CEP inválido"),
  street: z.string().trim().min(1),
  reference: z.string().trim().min(1, 'informe uma referência (ex.: "número 181", "S/N", "KM 203")'),
  district: z.string().trim().min(1),
  city: z.string().trim().min(1),
  state: z.string().trim().length(2).toUpperCase(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),

  maintenanceType: z.enum(MAINTENANCE_TYPES).default("NENHUMA"),
  nextMaintenanceAt: z.coerce.date().nullish(),
  maintenanceIntervalDays: z.number().int().positive().nullish(),

  responsibleAgentId: z.string().nullish(),
  attributes: z.record(z.unknown()).default({}),
});

// A situação só muda pelo endpoint de status, que respeita a máquina de estados.
export const equipmentUpdateInput = equipmentInput.omit({ status: true });

export const statusChangeInput = z.object({
  status: z.enum(EQUIPMENT_STATUSES),
  note: z.string().trim().optional(),
  agentId: z.string().nullish(),
});

export const scheduleMaintenanceInput = z.object({
  date: z.coerce.date(),
  note: z.string().trim().optional(),
  agentId: z.string().nullish(),
});

export const equipmentFilters = z.object({
  q: z.string().optional(),
  typeId: z.string().optional(),
  status: z.enum(EQUIPMENT_STATUSES).optional(),
  district: z.string().optional(),
  urgency: z.enum(URGENCY_LEVELS).optional(),
});
