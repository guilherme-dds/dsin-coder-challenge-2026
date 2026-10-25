import { Router } from "express";
import { buildOverview } from "../regions/service.js";

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
  const { equipments, agents, alerts, regions } = await buildOverview();
  const availability = new Map(regions.map((r) => [`regiao="${escapeLabel(r.name)}"`, r.availability]));

  const byStatus = new Map<string, number>();
  const byUrgency = new Map<string, number>();
  const agentsByRole = new Map<string, number>();
  const openAlerts = new Map<string, number>();

  for (const e of equipments) {
    count(byStatus, { tipo: e.type.code, situacao: e.status, bairro: e.district, cidade: e.city });
    count(byUrgency, { tipo: e.type.code, urgencia: e.urgency });
  }
  for (const a of agents.filter((a) => a.active)) count(agentsByRole, { funcao: a.role });
  for (const a of alerts) count(openAlerts, { regra: a.kind, gravidade: a.severity });

  res.type("text/plain; version=0.0.4").send(
    [
      gauge("fogo_equipamentos", "Quantidade de equipamentos por tipo, situação e bairro", byStatus),
      gauge("fogo_equipamentos_urgencia", "Quantidade de equipamentos por nível de urgência", byUrgency),
      gauge("fogo_agentes_ativos", "Quantidade de agentes ativos por função", agentsByRole),
      gauge("fogo_alertas_abertos", "Alertas não resolvidos por regra e gravidade", openAlerts),
      gauge("fogo_disponibilidade_percentual", "Percentual de equipamentos instalados operando, por região", availability),
    ].join("\n\n") + "\n",
  );
});
