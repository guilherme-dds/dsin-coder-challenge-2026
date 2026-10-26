import { prisma } from "../../lib/prisma.js";
import { DEGRADATION_CHECKS, METRIC_LABELS } from "../../domain/telemetry.js";
import { isInstalled } from "../../domain/availability.js";
import { linearRegression } from "../../domain/stats.js";
import { cityDayStart } from "../../domain/time.js";
import { toEquipmentDto } from "../equipments/service.js";
import { detectAnomalies } from "./anomalies.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Janela do histórico de falhas usada para a taxa base. */
export const FAILURE_HISTORY_DAYS = 180;
/** Janela da telemetria diária usada para medir desgaste. */
export const DEGRADATION_WINDOW_DAYS = 21;
/**
 * Tipos com poucos equipamentos não têm falhas suficientes para uma taxa própria confiável:
 * a taxa do tipo é puxada para a média geral como se houvesse este tanto de "equipamento-dias" dela.
 */
const PRIOR_EQUIPMENT_DAYS = 365;
const INSTABILITY_WINDOW_DAYS = 7;

export type FailureLevel = "ALTA" | "MEDIA" | "BAIXA";

export interface FailureFactor {
  label: string;
  detail: string;
  /** Multiplicador aplicado ao risco base (ex.: 2 = dobra o risco). */
  multiplier: number;
}

export interface FailurePrediction {
  equipment: {
    id: string;
    serialNumber: string;
    type: { code: string; name: string };
    district: string;
    latitude: number;
    longitude: number;
  };
  probability: number;
  level: FailureLevel;
  factors: FailureFactor[];
  recommendation: string;
}

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Probabilidade de cada equipamento operacional falhar nos próximos `days` dias.
 *
 * Risco base: taxa de falhas do tipo de equipamento no histórico (falhas por equipamento por dia).
 * Sobre ela, multiplicadores do próprio equipamento: falhas anteriores, bairro com mais falhas
 * que a média, manutenção vencida, desgaste medido pela telemetria e instabilidade recente.
 * A probabilidade vem de P = 1 − e^(−taxa × dias × multiplicadores).
 */
export async function predictFailures(days = 7, now = new Date()) {
  const since = new Date(now.getTime() - FAILURE_HISTORY_DAYS * DAY_MS);
  const [equipments, failures, daily, recentAlerts, anomalies] = await Promise.all([
    prisma.equipment.findMany({ include: { type: true } }),
    prisma.equipmentEvent.findMany({
      where: { kind: "STATUS_ALTERADO", toStatus: "MAU_FUNCIONAMENTO", createdAt: { gte: since } },
      select: { equipmentId: true },
    }),
    prisma.telemetryDaily.findMany({
      where: {
        // Só dias completos: o dia em curso tem poucas amostras e distorce a tendência
        date: { gte: new Date(cityDayStart(now).getTime() - DEGRADATION_WINDOW_DAYS * DAY_MS), lt: cityDayStart(now) },
        metric: { in: DEGRADATION_CHECKS.map((c) => c.metric) },
      },
      orderBy: { date: "asc" },
    }),
    prisma.alert.findMany({
      where: {
        kind: { in: ["EQUIPAMENTO_OFFLINE", "LEITURA_ANOMALA"] },
        openedAt: { gte: new Date(now.getTime() - INSTABILITY_WINDOW_DAYS * DAY_MS) },
        equipmentId: { not: null },
      },
      select: { equipmentId: true },
    }),
    detectAnomalies(now),
  ]);

  const dtos = equipments.map(toEquipmentDto);
  const installed = dtos.filter(isInstalled);
  const failuresOf = new Map<string, number>();
  for (const f of failures) failuresOf.set(f.equipmentId, (failuresOf.get(f.equipmentId) ?? 0) + 1);
  const alertsOf = new Map<string, number>();
  for (const a of recentAlerts) alertsOf.set(a.equipmentId!, (alertsOf.get(a.equipmentId!) ?? 0) + 1);

  // Taxas aprendidas do histórico: geral, por tipo e por bairro
  const totalFailures = failures.length;
  const overallRate = totalFailures / Math.max(1, installed.length * FAILURE_HISTORY_DAYS);
  const typeRate = (typeId: string) => {
    const ofType = installed.filter((e) => e.typeId === typeId);
    const f = ofType.reduce((sum, e) => sum + (failuresOf.get(e.id) ?? 0), 0);
    return (f + overallRate * PRIOR_EQUIPMENT_DAYS) / (ofType.length * FAILURE_HISTORY_DAYS + PRIOR_EQUIPMENT_DAYS);
  };
  const districtRatio = (district: string) => {
    const inDistrict = installed.filter((e) => e.district === district);
    const f = inDistrict.reduce((sum, e) => sum + (failuresOf.get(e.id) ?? 0), 0);
    // +1 dos dois lados: bairro com 1 equipamento e 1 falha não vira "o pior da cidade"
    return (f + 1) / (inDistrict.length + 1) / ((totalFailures + 1) / (installed.length + 1));
  };

  const predictions: FailurePrediction[] = dtos
    .filter((e) => e.status === "OPERACIONAL")
    .map((e) => {
      const factors: FailureFactor[] = [];
      const base = typeRate(e.typeId);

      const ownFailures = failuresOf.get(e.id) ?? 0;
      if (ownFailures > 0) {
        factors.push({
          label: "Falhas anteriores",
          detail: `${ownFailures} falha(s) nos últimos ${FAILURE_HISTORY_DAYS / 30} meses.`,
          multiplier: 1 + 0.4 * ownFailures,
        });
      }

      const ratio = districtRatio(e.district);
      const districtMultiplier = Math.min(2, Math.max(0.7, Math.sqrt(ratio)));
      if (Math.abs(districtMultiplier - 1) >= 0.15) {
        factors.push({
          label: districtMultiplier > 1 ? "Bairro com mais falhas" : "Bairro com menos falhas",
          detail: `Equipamentos em ${e.district} falham ${round(ratio, 1).toLocaleString("pt-BR")}× a média da cidade.`,
          multiplier: districtMultiplier,
        });
      }

      if (e.nextMaintenanceAt && e.nextMaintenanceAt < now) {
        const overdue = Math.ceil((now.getTime() - e.nextMaintenanceAt.getTime()) / DAY_MS);
        factors.push({
          label: "Manutenção vencida",
          detail: `Manutenção preventiva vencida há ${overdue} dia(s).`,
          multiplier: 1 + Math.min(overdue / 30, 1),
        });
      }

      // Desgaste: tendência da medição nos últimos dias rumo ao limite de funcionamento
      for (const check of DEGRADATION_CHECKS) {
        const series = daily.filter((d) => d.equipmentId === e.id && d.metric === check.metric);
        const reg = linearRegression(
          series.map((d) => (d.date.getTime() - now.getTime()) / DAY_MS),
          series.map((d) => d[check.stat]),
        );
        if (!reg) continue;
        const label = METRIC_LABELS[check.metric] ?? check.metric;
        const what = check.stat === "max" ? `${label} (carga máxima)` : label;
        if (reg.last < check.limit) {
          factors.push({
            label: "Desgaste abaixo do limite",
            detail: `${capitalize(what)} em ${round(reg.last, 1)}, abaixo do limite de ${check.limit}: ${check.meaning}.`,
            multiplier: 5,
          });
        } else if (reg.slope < 0 && reg.tStat < -2) {
          const daysToLimit = (check.limit - reg.last) / reg.slope;
          if (daysToLimit <= 21) {
            factors.push({
              label: "Desgaste em curso",
              detail:
                `${capitalize(what)} caindo ${round(-reg.slope, 2).toLocaleString("pt-BR")} por dia ` +
                `(hoje ${round(reg.last, 1)}); deve cruzar o limite de ${check.limit} em ~${Math.ceil(daysToLimit)} dia(s).`,
              multiplier: daysToLimit <= 7 ? 4 : 2,
            });
          }
        }
      }

      // Medição fora do padrão do próprio equipamento: costuma anteceder a falha do sensor
      for (const a of anomalies.filter((x) => x.equipment.id === e.id)) {
        factors.push({
          label: "Leitura fora do padrão",
          detail: `${capitalize(a.metricLabel)} ${a.changePct}% em relação ao normal há ${a.anomalousDays} dia(s). ${a.interpretation}`,
          multiplier: 2,
        });
      }

      const instability = alertsOf.get(e.id) ?? 0;
      if (instability > 0) {
        factors.push({
          label: "Instabilidade recente",
          detail: `${instability} alerta(s) de comunicação ou leitura anômala nos últimos ${INSTABILITY_WINDOW_DAYS} dias.`,
          multiplier: Math.min(2.5, 1 + 0.3 * instability),
        });
      }

      const multiplier = factors.reduce((product, f) => product * f.multiplier, 1);
      const probability = Math.min(0.95, 1 - Math.exp(-base * days * multiplier));
      const level: FailureLevel = probability >= 0.5 ? "ALTA" : probability >= 0.2 ? "MEDIA" : "BAIXA";
      factors.sort((a, b) => b.multiplier - a.multiplier);

      return {
        equipment: {
          id: e.id,
          serialNumber: e.serialNumber,
          type: { code: e.type.code, name: e.type.name },
          district: e.district,
          latitude: e.latitude,
          longitude: e.longitude,
        },
        probability: round(probability, 3),
        level,
        factors: factors.map((f) => ({ ...f, multiplier: round(f.multiplier) })),
        recommendation: recommend(factors),
      };
    })
    .sort((a, b) => b.probability - a.probability);

  return {
    days,
    baseRatePerWeek: round(overallRate * 7, 4),
    failuresUsed: totalFailures,
    /** Soma das probabilidades: quantas falhas a rede deve ter no período. */
    expectedFailures: round(predictions.reduce((sum, p) => sum + p.probability, 0), 1),
    predictions,
  };
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** O que fazer primeiro, por fator: a ordem segue o que é mais acionável, não o maior multiplicador. */
const ACTIONS: [string, string][] = [
  ["Desgaste abaixo do limite", "Antecipar a manutenção ou a troca da peça antes da falha."],
  ["Desgaste em curso", "Antecipar a manutenção ou a troca da peça antes da falha."],
  ["Leitura fora do padrão", "Vistoria técnica do sensor: a medição fugiu do padrão do equipamento."],
  ["Manutenção vencida", "Executar a manutenção preventiva vencida."],
  ["Falhas anteriores", "Vistoria preventiva: o equipamento tem falhas recorrentes."],
  ["Instabilidade recente", "Verificar alimentação e conexão do dispositivo."],
  ["Bairro com mais falhas", "Reforçar a proteção física e a vistoria no bairro."],
];

function recommend(factors: FailureFactor[]) {
  const action = ACTIONS.find(([label]) => factors.some((f) => f.label === label));
  return action ? action[1] : "Manter o plano de manutenção.";
}
