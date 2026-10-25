import type { Agent, Alert, Region } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ALERT_SEVERITIES, type AlertSeverity } from "../../domain/alerts.js";
import { regionHealth, summarizeAvailability } from "../../domain/availability.js";
import { ACTIVE_FIELD_STATUSES, type AgentFieldStatus } from "../../domain/field-status.js";
import { URGENCY_LEVELS, type UrgencyLevel } from "../../domain/urgency.js";
import { toEquipmentDto } from "../equipments/service.js";

export type RegionRef = Pick<Region, "id" | "code" | "name">;

/** Região de cada bairro. Bairros fora da tabela (ex.: cadastrados via CEP) ficam sem região. */
export async function loadRegionIndex() {
  const [regions, districts] = await Promise.all([
    prisma.region.findMany({ orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.district.findMany({ select: { name: true, regionId: true } }),
  ]);
  const byId = new Map(regions.map((r) => [r.id, r]));
  const byDistrict = new Map(districts.map((d) => [d.name, byId.get(d.regionId)!]));
  return {
    regions,
    districtsOf: (regionId: string) => districts.filter((d) => d.regionId === regionId).map((d) => d.name),
    regionOf: (district: string): RegionRef | undefined => byDistrict.get(district),
  };
}

export type RegionIndex = Awaited<ReturnType<typeof loadRegionIndex>>;

type EquipmentDto = ReturnType<typeof toEquipmentDto>;

/** Agente em atividade: cadastro ativo e, em campo, disponível, atendendo ou se deslocando. */
export const isInActivity = (agent: Pick<Agent, "active" | "fieldStatus">) =>
  agent.active && ACTIVE_FIELD_STATUSES.includes(agent.fieldStatus as AgentFieldStatus);

function summarizeScope(equipments: EquipmentDto[], agents: Agent[], alerts: Pick<Alert, "severity">[]) {
  const byUrgency = Object.fromEntries(URGENCY_LEVELS.map((l) => [l, 0])) as Record<UrgencyLevel, number>;
  for (const e of equipments) byUrgency[e.urgency]++;

  const openAlerts = Object.fromEntries(ALERT_SEVERITIES.map((s) => [s, 0])) as Record<AlertSeverity, number>;
  for (const a of alerts) openAlerts[a.severity as AlertSeverity]++;

  const availability = summarizeAvailability(equipments);
  return {
    ...availability,
    offline: equipments.filter((e) => e.connectivity === "OFFLINE").length,
    byUrgency,
    activeAgents: agents.filter(isInActivity).length,
    openAlerts,
    health: regionHealth(availability, { critical: openAlerts.CRITICA, high: openAlerts.ALTA }),
  };
}

/**
 * Fotografia da cidade inteira e de cada região. É a base da visão consolidada, dos indicadores
 * e do histórico de disponibilidade.
 */
export async function buildOverview() {
  const [equipments, agents, alerts, index] = await Promise.all([
    prisma.equipment.findMany({ include: { type: true } }),
    prisma.agent.findMany(),
    prisma.alert.findMany({ where: { status: { not: "RESOLVIDO" } } }),
    loadRegionIndex(),
  ]);
  const dtos = equipments.map(toEquipmentDto);

  const scopes: (Omit<RegionRef, "id"> & { id: string | null; districts: string[] })[] = index.regions.map((r) => ({
    ...r,
    districts: index.districtsOf(r.id),
  }));
  // Equipamentos e agentes em bairros sem região não podem sumir da visão consolidada.
  const unassigned = (district: string) => !index.regionOf(district);
  if (dtos.some((e) => unassigned(e.district)) || agents.some((a) => unassigned(a.district))) {
    scopes.push({ id: null, code: "SEM_REGIAO", name: "Sem região", districts: [] });
  }

  const inScope = (scopeId: string | null, district: string) => (index.regionOf(district)?.id ?? null) === scopeId;
  const regions = scopes.map((scope) => ({
    ...scope,
    ...summarizeScope(
      dtos.filter((e) => inScope(scope.id, e.district)),
      agents.filter((a) => inScope(scope.id, a.district)),
      alerts.filter((a) => a.regionId === scope.id),
    ),
  }));

  return { equipments: dtos, agents, alerts, index, city: summarizeScope(dtos, agents, alerts), regions };
}
