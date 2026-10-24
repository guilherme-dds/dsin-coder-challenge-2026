import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { toEquipmentDto } from "../equipments/service.js";

export const metricsRouter = Router();

const escapeLabel = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

function gauge(name: string, help: string, samples: Map<string, number>) {
  const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`];
  for (const [labels, value] of samples) lines.push(`${name}{${labels}} ${value}`);
  return lines.join("\n");
}

function count(samples: Map<string, number>, labels: Record<string, string>) {
  const key = Object.entries(labels)
    .map(([k, v]) => `${k}="${escapeLabel(v)}"`)
    .join(",");
  samples.set(key, (samples.get(key) ?? 0) + 1);
}

/**
 * Exporta o inventário no formato de exposição do Prometheus, para que o
 * PROMETHEUS possa coletar o estado do parque junto com a telemetria dos equipamentos.
 */
metricsRouter.get("/", async (_req, res) => {
  const [equipments, agents] = await Promise.all([
    prisma.equipment.findMany({ include: { type: true } }),
    prisma.agent.findMany({ where: { active: true }, select: { role: true } }),
  ]);

  const byStatus = new Map<string, number>();
  const byUrgency = new Map<string, number>();
  const agentsByRole = new Map<string, number>();

  for (const e of equipments.map(toEquipmentDto)) {
    count(byStatus, { tipo: e.type.code, situacao: e.status, bairro: e.district, cidade: e.city });
    count(byUrgency, { tipo: e.type.code, urgencia: e.urgency });
  }
  for (const a of agents) count(agentsByRole, { funcao: a.role });

  res.type("text/plain; version=0.0.4").send(
    [
      gauge("fogo_equipamentos", "Quantidade de equipamentos por tipo, situação e bairro", byStatus),
      gauge("fogo_equipamentos_urgencia", "Quantidade de equipamentos por nível de urgência", byUrgency),
      gauge("fogo_agentes_ativos", "Quantidade de agentes ativos por função", agentsByRole),
    ].join("\n\n") + "\n",
  );
});
