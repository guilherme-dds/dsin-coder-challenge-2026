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
