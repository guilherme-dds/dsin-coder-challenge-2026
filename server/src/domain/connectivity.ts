import type { EquipmentStatus } from "./status.js";

/**
 * Conectividade do dispositivo com o PROMETHEUS, calculada a partir do último contato.
 * É o que permite perceber a falha "silenciosa": o equipamento que simplesmente para de responder.
 */
export const CONNECTIVITY_LEVELS = ["ONLINE", "INSTAVEL", "OFFLINE", "SEM_TELEMETRIA"] as const;

export type Connectivity = (typeof CONNECTIVITY_LEVELS)[number];

const MINUTE_MS = 60 * 1000;
export const ONLINE_WINDOW_MS = 2 * MINUTE_MS;
export const UNSTABLE_WINDOW_MS = 10 * MINUTE_MS;

/** Equipamentos fora de operação não têm expectativa de enviar telemetria. */
const NOT_EXPECTED: EquipmentStatus[] = ["NAO_INSTALADO", "DESATIVADO", "FURTADO", "BAIXADO"];

export function connectivity(status: EquipmentStatus, lastSeenAt: Date | null, now = new Date()): Connectivity {
  if (NOT_EXPECTED.includes(status) || !lastSeenAt) return "SEM_TELEMETRIA";
  const silence = now.getTime() - lastSeenAt.getTime();
  if (silence <= ONLINE_WINDOW_MS) return "ONLINE";
  if (silence <= UNSTABLE_WINDOW_MS) return "INSTAVEL";
  return "OFFLINE";
}
