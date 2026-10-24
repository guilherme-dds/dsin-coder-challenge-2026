import type { EquipmentStatus, MaintenanceType } from "./status.js";

/**
 * Nível de urgência operacional de um equipamento, usado para colorir o mapa
 * e priorizar o atendimento das equipes de campo.
 */
export const URGENCY_LEVELS = ["CRITICO", "ALERTA", "ATENCAO", "NORMAL", "PENDENTE", "INATIVO"] as const;

export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_WINDOW_DAYS = 7;

interface UrgencyInput {
  status: EquipmentStatus;
  maintenanceType: MaintenanceType;
  nextMaintenanceAt: Date | null;
}

export function urgency(input: UrgencyInput, now = new Date()): UrgencyLevel {
  const { status, maintenanceType, nextMaintenanceAt } = input;

  if (status === "FURTADO" || status === "DESATIVADO" || status === "BAIXADO") return "INATIVO";
  if (status === "NAO_INSTALADO") return "PENDENTE";
  if (status === "MAU_FUNCIONAMENTO" || maintenanceType === "IMEDIATA") return "CRITICO";
  if (nextMaintenanceAt && nextMaintenanceAt.getTime() < now.getTime()) return "ALERTA";
  if (status === "EM_MANUTENCAO") return "ATENCAO";
  if (nextMaintenanceAt && nextMaintenanceAt.getTime() - now.getTime() <= UPCOMING_WINDOW_DAYS * DAY_MS) {
    return "ATENCAO";
  }
  return "NORMAL";
}

export function urgencyPriority(level: UrgencyLevel): number {
  return URGENCY_LEVELS.indexOf(level);
}

/** Situações que contam como falha para a camada de calor do mapa. */
export const FAILURE_STATUSES: EquipmentStatus[] = ["MAU_FUNCIONAMENTO", "FURTADO"];
