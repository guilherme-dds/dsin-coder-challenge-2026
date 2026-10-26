import { Router } from "express";
import { z } from "zod";
import { HISTORY_WEEKS } from "./risk-model.js";
import { forecastRisk, riskHeatmap } from "./risk.js";
import { recommendStaffing } from "./staffing.js";

const horizon = z.object({ hours: z.coerce.number().int().min(1).max(72).default(24) });
const heatmapFilters = z.object({ regionId: z.string().optional() });

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
