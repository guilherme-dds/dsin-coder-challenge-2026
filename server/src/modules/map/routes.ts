import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { FAILURE_STATUSES } from "../../domain/urgency.js";
import { toEquipmentDto } from "../equipments/service.js";
import { loadRegionIndex } from "../regions/service.js";

export const mapRouter = Router();

/**
 * Tudo o que o mapa operacional precisa em uma única chamada:
 * equipamentos, agentes posicionados e os pontos da camada de calor de falhas.
 */
mapRouter.get("/", async (_req, res) => {
  const [equipments, agents, failureEvents, index] = await Promise.all([
    prisma.equipment.findMany({ include: { type: true } }),
    prisma.agent.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      include: { _count: { select: { responsibleFor: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.equipmentEvent.groupBy({
      by: ["equipmentId"],
      where: { kind: "STATUS_ALTERADO", toStatus: { in: FAILURE_STATUSES } },
      _count: { _all: true },
    }),
    loadRegionIndex(),
  ]);

  const failuresByEquipment = new Map(failureEvents.map((f) => [f.equipmentId, f._count._all]));

  // Peso = falhas registradas no histórico + 1 se o equipamento está falhando agora.
  const failures = equipments
    .map((e) => ({
      latitude: e.latitude,
      longitude: e.longitude,
      weight: (failuresByEquipment.get(e.id) ?? 0) + ((FAILURE_STATUSES as string[]).includes(e.status) ? 1 : 0),
    }))
    .filter((p) => p.weight > 0);

  // Código da região em cada ponto, para o filtro por região no mapa.
  const regionCode = (district: string) => index.regionOf(district)?.code ?? "SEM_REGIAO";

  res.json({
    equipments: equipments.map((e) => ({ ...toEquipmentDto(e), regionCode: regionCode(e.district) })),
    agents: agents.map((a) => ({ ...a, regionCode: regionCode(a.district) })),
    regions: index.regions,
    failures,
  });
});
