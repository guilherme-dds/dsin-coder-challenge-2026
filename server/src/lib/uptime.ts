import { ONLINE_WINDOW_MS } from "../domain/connectivity.js";

const startedAt = Date.now();

/**
 * Logo depois que a API sobe, os dispositivos ainda não tiveram tempo de reportar: pelo banco,
 * parece que todos estão em silêncio desde a última vez que a API esteve no ar. Durante essa
 * carência, o silêncio não vira alerta nem entra no histórico de disponibilidade.
 */
export const STARTUP_GRACE_MS = ONLINE_WINDOW_MS;

export const graceRemainingMs = () => Math.max(0, STARTUP_GRACE_MS - (Date.now() - startedAt));

export const inStartupGrace = () => graceRemainingMs() > 0;
