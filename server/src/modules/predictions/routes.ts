import { Router } from "express";
import { z } from "zod";
import { HISTORY_WEEKS } from "./risk-model.js";
import { forecastRisk, riskHeatmap } from "./risk.js";
import { recommendStaffing } from "./staffing.js";
import { DEGRADATION_WINDOW_DAYS, FAILURE_HISTORY_DAYS, predictFailures } from "./failures.js";
import { BASELINE_FROM_DAYS, BASELINE_TO_DAYS, RECENT_DAYS, Z_THRESHOLD, detectAnomalies } from "./anomalies.js";
import { AVAILABILITY_WINDOW_DAYS, OCCURRENCE_WINDOW_WEEKS, UTILIZATION_WINDOW_WEEKS, analyzeTrends } from "./trends.js";

const horizon = z.object({ hours: z.coerce.number().int().min(1).max(72).default(24) });
const heatmapFilters = z.object({ regionId: z.string().optional() });
const failureFilters = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
  limit: z.coerce.number().int().positive().max(200).default(20),
});

/** Explicação que acompanha cada previsão: o que é previsto, com quais dados e como usar. */
const ABOUT = {
  risk: {
    predicts: "Risco de ocorrências (acidentes, congestionamentos, vandalismo, furtos…) em cada região, hora a hora.",
    inputs: [
      `Ocorrências registradas nas últimas ${HISTORY_WEEKS} semanas, por região, dia da semana e hora`,
      "Gravidade de cada ocorrência (crítica pesa 4, alta 2, média 1, baixa 0,5)",
      "Ocorrências das últimas 3 horas comparadas ao esperado para elas",
      "Câmeras sem operar ou sem comunicação em cada região",
    ],
    method:
      "Média ponderada por recência (meia-vida de 3 semanas) para cada região × dia da semana × hora, suavizada pelo " +
      "padrão geral da região para evitar picos falsos em horários com poucos dados. O índice 0–100 diz em quantos % " +
      "dos horários da cidade a carga esperada é menor: 85 ou mais é risco alto, 60 a 84 moderado.",
    use: "Antecipar patrulhas e fiscalização nos horários e regiões de maior risco, antes das ocorrências acontecerem.",
  },
  heatmap: {
    predicts: "Dias da semana e horários com maior probabilidade de ocorrências.",
    inputs: [`Ocorrências das últimas ${HISTORY_WEEKS} semanas, ponderadas pela gravidade e pela recência`],
    method: "Mesma expectativa do índice de risco, calculada para as 168 horas de uma semana típica.",
    use: "Planejar escalas e operações recorrentes (ex.: reforço fixo às sextas à noite).",
  },
  staffing: {
    predicts: "Quantos agentes cada região vai precisar em cada turno das próximas horas, e quem pode reforçar.",
    inputs: [
      "Previsão de risco por região e hora",
      "Agentes empenhados e tempo típico de atendimento de cada tipo de ocorrência",
      "Agentes ativos escalados em cada turno, pela região da base",
    ],
    method:
      "Agentes ocupados esperados no horário de pico do turno (ocorrências × agentes × duração). O efetivo necessário " +
      "é o menor número de agentes com o qual a chance de todos estarem ocupados quando surge uma nova ocorrência fica " +
      "abaixo de 20% (distribuição de Poisson). A diferença para o efetivo escalado indica reforço ou folga.",
    use: "Remanejar agentes entre regiões ou convocar reforço antes do pico, em vez de reagir depois.",
  },
  failures: {
    predicts: "Probabilidade de cada equipamento operacional falhar nos próximos dias (manutenção preditiva).",
    inputs: [
      `Falhas registradas nos últimos ${FAILURE_HISTORY_DAYS} dias, por tipo de equipamento e por bairro`,
      "Falhas anteriores do próprio equipamento e manutenção preventiva vencida",
      `Telemetria diária dos últimos ${DEGRADATION_WINDOW_DAYS} dias: tendência da medição rumo ao limite de funcionamento`,
      "Alertas recentes de falta de comunicação e de leitura anômala",
      "Medições fora do padrão do próprio equipamento (detecção de anomalias)",
    ],
    method:
      "Risco base = taxa de falhas do tipo no histórico (suavizada pela média geral em tipos com poucos equipamentos). " +
      "Cada fator do equipamento multiplica esse risco (ex.: desgaste que cruza o limite em até 7 dias ×4). " +
      "Probabilidade = 1 − e^(−taxa × dias × fatores).",
    use: "Antecipar a manutenção dos equipamentos com maior chance de falhar, antes que a falha tire o serviço do ar.",
  },
  anomalies: {
    predicts: "Equipamentos cujas medições fugiram do padrão nos últimos dias, mesmo sem ter falhado.",
    inputs: [`Telemetria diária dos últimos ${BASELINE_TO_DAYS} dias de cada equipamento`],
    method:
      `Cada um dos últimos ${RECENT_DAYS} dias completos é comparado com a mediana de ${BASELINE_FROM_DAYS} a ${BASELINE_TO_DAYS} ` +
      `dias atrás, do mesmo tipo de dia (útil ou fim de semana), em desvios robustos. ${Z_THRESHOLD} ou mais desvios ` +
      "em pelo menos 2 dias caracterizam a anomalia.",
    use: "Encontrar sensores com defeito, desvios de tráfego e equipamentos se deteriorando antes de virarem falha.",
  },
  trends: {
    predicts: "Para onde caminham a disponibilidade das regiões, o volume de ocorrências e o uso dos equipamentos.",
    inputs: [
      `Disponibilidade por hora dos últimos ${AVAILABILITY_WINDOW_DAYS} dias (cidade e regiões)`,
      `Ocorrências por semana nas últimas ${OCCURRENCE_WINDOW_WEEKS} semanas`,
      `Médias semanais de uso dos equipamentos de fluxo nas últimas ${UTILIZATION_WINDOW_WEEKS} semanas`,
    ],
    method:
      "Regressão linear em cada série. Só é apontada como tendência a inclinação que dificilmente é acaso " +
      "(estatística t de 2 ou mais) e que tem tamanho relevante. A disponibilidade é projetada 7 dias à frente.",
    use: "Agir sobre regiões e equipamentos que estão piorando (ou com demanda crescendo) antes que cruzem os limites.",
  },
};

export const predictionsRouter = Router();

predictionsRouter.get("/risk", async (req, res) => {
  const { hours } = horizon.parse(req.query);
  const { model, regions } = await forecastRisk(hours);
  res.json({
    generatedAt: new Date().toISOString(),
    about: ABOUT.risk,
    basedOn: { occurrences: model.occurrencesUsed, weeks: HISTORY_WEEKS },
    regions,
  });
});

predictionsRouter.get("/risk/heatmap", async (req, res) => {
  const { regionId } = heatmapFilters.parse(req.query);
  const { model, cells } = await riskHeatmap(regionId);
  res.json({
    generatedAt: new Date().toISOString(),
    about: ABOUT.heatmap,
    basedOn: { occurrences: model.occurrencesUsed, weeks: HISTORY_WEEKS },
    cells,
  });
});

predictionsRouter.get("/staffing", async (req, res) => {
  const { hours } = horizon.parse(req.query);
  const staffing = await recommendStaffing(hours);
  res.json({ generatedAt: new Date().toISOString(), about: ABOUT.staffing, ...staffing });
});

predictionsRouter.get("/failures", async (req, res) => {
  const { days, limit } = failureFilters.parse(req.query);
  const result = await predictFailures(days);
  res.json({
    generatedAt: new Date().toISOString(),
    about: ABOUT.failures,
    ...result,
    predictions: result.predictions.slice(0, limit),
  });
});

predictionsRouter.get("/anomalies", async (_req, res) => {
  res.json({ generatedAt: new Date().toISOString(), about: ABOUT.anomalies, anomalies: await detectAnomalies() });
});

predictionsRouter.get("/trends", async (_req, res) => {
  res.json({ generatedAt: new Date().toISOString(), about: ABOUT.trends, ...(await analyzeTrends()) });
});
