import type { Connectivity } from "./connectivity.js";
import type { EquipmentStatus } from "./status.js";

/** Situações em que o equipamento ainda (ou já) não faz parte da rede instalada. */
const NOT_INSTALLED: EquipmentStatus[] = ["NAO_INSTALADO", "BAIXADO"];

interface AvailabilityInput {
  /** String porque o Prisma devolve a situação sem o tipo da união (SQLite não tem enum). */
  status: string;
  connectivity: Connectivity;
}

export function isInstalled(e: AvailabilityInput) {
  return !(NOT_INSTALLED as string[]).includes(e.status);
}

/**
 * Operando de fato: situação operacional e sem estar em silêncio. Um equipamento que parou de
 * enviar telemetria conta como indisponível mesmo que ninguém tenha registrado a falha.
 */
export function isOperational(e: AvailabilityInput) {
  return e.status === "OPERACIONAL" && e.connectivity !== "OFFLINE";
}

export interface AvailabilitySummary {
  total: number;
  installed: number;
  operational: number;
  unavailable: number;
  /** Percentual de equipamentos instalados que estão operando (0 a 100, uma casa decimal). */
  availability: number;
}

/** Abaixo destes percentuais de disponibilidade uma região é considerada degradada ou crítica. */
export const REGION_DEGRADED_PCT = 80;
export const REGION_CRITICAL_PCT = 60;
/** Com menos equipamentos instalados que isso, o percentual sozinho não basta para declarar a região crítica. */
export const REGION_MIN_INSTALLED = 3;

export const HEALTH_LEVELS = ["CRITICO", "ATENCAO", "NORMAL"] as const;

export type HealthLevel = (typeof HEALTH_LEVELS)[number];

/** Saúde de uma região, para a visão consolidada: disponibilidade e gravidade dos alertas abertos. */
export function regionHealth(summary: AvailabilitySummary, openAlerts: { critical: number; high: number }): HealthLevel {
  const measurable = summary.installed >= REGION_MIN_INSTALLED;
  if (openAlerts.critical > 0 || (measurable && summary.availability < REGION_CRITICAL_PCT)) return "CRITICO";
  if (openAlerts.high > 0 || summary.availability < REGION_DEGRADED_PCT) return "ATENCAO";
  return "NORMAL";
}

export function summarizeAvailability(equipments: AvailabilityInput[]): AvailabilitySummary {
  const installed = equipments.filter(isInstalled);
  const operational = installed.filter(isOperational).length;
  return {
    total: equipments.length,
    installed: installed.length,
    operational,
    unavailable: installed.length - operational,
    availability: installed.length ? Math.round((operational / installed.length) * 1000) / 10 : 100,
  };
}
