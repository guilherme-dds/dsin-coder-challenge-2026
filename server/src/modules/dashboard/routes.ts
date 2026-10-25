import { Router } from "express";
import { CONNECTIVITY_LEVELS, type Connectivity } from "../../domain/connectivity.js";
import { AGENT_FIELD_STATUSES, type AgentFieldStatus } from "../../domain/field-status.js";
import { urgencyPriority } from "../../domain/urgency.js";
import { buildOverview } from "../regions/service.js";

export const dashboardRouter = Router();

const tally = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

/** Indicadores consolidados da cidade: disponibilidade da rede, equipes em campo e alertas. */
dashboardRouter.get("/", async (_req, res) => {
  const { equipments, agents, city, regions } = await buildOverview();

  const byStatus: Record<string, number> = {};
  const byAgency: Record<string, number> = {};
  const byType: Record<string, { name: string; code: string; count: number }> = {};
  const connectivity = tally(CONNECTIVITY_LEVELS);

  for (const e of equipments) {
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
    byAgency[e.agency] = (byAgency[e.agency] ?? 0) + 1;
    byType[e.typeId] ??= { name: e.type.name, code: e.type.code, count: 0 };
    byType[e.typeId].count++;
    connectivity[e.connectivity as Connectivity]++;
  }

  const onDuty = agents.filter((a) => a.active);
  const agentsByFieldStatus = tally(AGENT_FIELD_STATUSES);
  for (const a of onDuty) agentsByFieldStatus[a.fieldStatus as AgentFieldStatus]++;

  const critical = equipments
    .filter((e) => e.urgency === "CRITICO" || e.urgency === "ALERTA")
    .sort((a, b) => urgencyPriority(a.urgency) - urgencyPriority(b.urgency))
    .slice(0, 10);

  res.json({
    totals: {
      equipments: city.total,
      installed: city.installed,
      operational: city.operational,
      unavailable: city.unavailable,
      availability: city.availability,
      /** Agentes em atividade agora (disponíveis, em atendimento ou em deslocamento). */
      activeAgents: city.activeAgents,
      /** Agentes com cadastro ativo, incluindo os em pausa ou sem sinal. */
      agentsOnDuty: onDuty.length,
    },
    health: city.health,
    openAlerts: city.openAlerts,
    connectivity,
    agentsByFieldStatus,
    regionsByHealth: {
      CRITICO: regions.filter((r) => r.health === "CRITICO").length,
      ATENCAO: regions.filter((r) => r.health === "ATENCAO").length,
      NORMAL: regions.filter((r) => r.health === "NORMAL").length,
    },
    byUrgency: city.byUrgency,
    byStatus,
    byAgency,
    byType: Object.values(byType).sort((a, b) => b.count - a.count),
    critical,
  });
});
