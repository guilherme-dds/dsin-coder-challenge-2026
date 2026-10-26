/**
 * Perfil de comportamento da cidade usado APENAS para gerar dados de exemplo (seed e simulador).
 *
 * Os modelos de previsão da API nunca leem este arquivo: eles descobrem os padrões a partir das
 * ocorrências e da telemetria registradas no banco, como fariam com dados reais. Este perfil só
 * garante que o histórico de exemplo tenha padrões plausíveis para serem descobertos.
 */
import type { AlertSeverity } from "../src/domain/alerts.js";
import type { OccurrenceKind } from "../src/domain/occurrences.js";

/** Peso relativo de cada hora do dia (0–23), por tipo de ocorrência. */
const HOUR_WEIGHTS: Record<OccurrenceKind, number[]> = {
  // Picos nos horários de ida e volta do trabalho
  ACIDENTE: [0.4, 0.3, 0.25, 0.2, 0.25, 0.5, 1.0, 1.8, 2.0, 1.2, 1.0, 1.1, 1.3, 1.2, 1.1, 1.2, 1.6, 2.1, 2.2, 1.5, 1.0, 0.8, 0.7, 0.5],
  CONGESTIONAMENTO: [0, 0, 0, 0, 0, 0.2, 1.2, 3.0, 3.2, 1.5, 0.8, 0.9, 1.4, 1.2, 0.8, 0.9, 1.6, 3.2, 3.4, 1.8, 0.6, 0.2, 0.1, 0],
  // Concentrados de madrugada
  VANDALISMO: [2.4, 2.6, 2.2, 1.6, 0.8, 0.3, 0.1, 0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.3, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.4, 1.8, 2.2, 2.4],
  FURTO: [1.8, 2.0, 1.9, 1.5, 1.0, 0.5, 0.3, 0.3, 0.4, 0.5, 0.6, 0.7, 0.7, 0.6, 0.6, 0.7, 0.8, 1.0, 1.3, 1.5, 1.6, 1.7, 1.8, 1.8],
  // Horário comercial (obras, cargas e descargas)
  OBSTRUCAO_VIA: [0.1, 0.1, 0.1, 0.1, 0.2, 0.4, 0.8, 1.2, 1.5, 1.8, 1.9, 1.8, 1.4, 1.6, 1.8, 1.7, 1.4, 1.0, 0.6, 0.4, 0.2, 0.2, 0.1, 0.1],
  // Tardes de chuva de verão
  SEMAFORO_INOPERANTE: [0.4, 0.4, 0.4, 0.4, 0.4, 0.5, 0.6, 0.7, 0.8, 0.8, 0.9, 1.0, 1.2, 1.4, 1.8, 2.2, 2.4, 2.0, 1.4, 0.9, 0.7, 0.6, 0.5, 0.4],
};

/** Peso relativo de cada dia da semana (domingo … sábado). */
const WEEKDAY_WEIGHTS: Record<OccurrenceKind, number[]> = {
  ACIDENTE: [0.9, 1.0, 0.95, 0.95, 1.0, 1.2, 1.15],
  CONGESTIONAMENTO: [0.3, 1.15, 1.1, 1.1, 1.15, 1.3, 0.6],
  VANDALISMO: [1.1, 0.6, 0.6, 0.7, 0.9, 1.6, 1.9],
  FURTO: [1.0, 0.8, 0.8, 0.85, 0.95, 1.2, 1.4],
  OBSTRUCAO_VIA: [0.5, 1.2, 1.15, 1.15, 1.15, 1.1, 0.7],
  SEMAFORO_INOPERANTE: [1, 1, 1, 1, 1, 1, 1],
};

/** Ocorrências esperadas por dia em cada região (código da região), por tipo. */
const DAILY_RATES: Record<string, Partial<Record<OccurrenceKind, number>>> = {
  CENTRO: { ACIDENTE: 1.6, CONGESTIONAMENTO: 2.4, VANDALISMO: 0.5, FURTO: 0.8, OBSTRUCAO_VIA: 0.9, SEMAFORO_INOPERANTE: 0.4 },
  NORTE: { ACIDENTE: 0.5, CONGESTIONAMENTO: 0.4, VANDALISMO: 0.2, FURTO: 0.3, OBSTRUCAO_VIA: 0.3, SEMAFORO_INOPERANTE: 0.15 },
  LESTE: { ACIDENTE: 0.6, CONGESTIONAMENTO: 0.5, VANDALISMO: 0.2, FURTO: 0.3, OBSTRUCAO_VIA: 0.3, SEMAFORO_INOPERANTE: 0.15 },
  SUL: { ACIDENTE: 0.8, CONGESTIONAMENTO: 0.5, VANDALISMO: 0.4, FURTO: 0.6, OBSTRUCAO_VIA: 0.4, SEMAFORO_INOPERANTE: 0.2 },
  OESTE: { ACIDENTE: 0.7, CONGESTIONAMENTO: 0.4, VANDALISMO: 1.2, FURTO: 1.0, OBSTRUCAO_VIA: 0.3, SEMAFORO_INOPERANTE: 0.2 },
  RODOVIAS: { ACIDENTE: 1.0, CONGESTIONAMENTO: 0.3, VANDALISMO: 0.05, FURTO: 0.2, OBSTRUCAO_VIA: 0.4 },
};

/**
 * A Zona Sul está piorando: o volume de ocorrências cresce ao longo dos últimos meses.
 * É a tendência que os modelos devem conseguir enxergar sozinhos.
 */
function trend(regionCode: string, daysAgo: number) {
  if (regionCode !== "SUL") return 1;
  return 0.75 + 0.85 * Math.max(0, 1 - daysAgo / 90);
}

const SEVERITY_MIX: Record<OccurrenceKind, Partial<Record<AlertSeverity, number>>> = {
  ACIDENTE: { CRITICA: 0.1, ALTA: 0.35, MEDIA: 0.4, BAIXA: 0.15 },
  CONGESTIONAMENTO: { ALTA: 0.15, MEDIA: 0.5, BAIXA: 0.35 },
  VANDALISMO: { ALTA: 0.2, MEDIA: 0.5, BAIXA: 0.3 },
  FURTO: { CRITICA: 0.05, ALTA: 0.4, MEDIA: 0.45, BAIXA: 0.1 },
  OBSTRUCAO_VIA: { ALTA: 0.1, MEDIA: 0.45, BAIXA: 0.45 },
  SEMAFORO_INOPERANTE: { ALTA: 0.3, MEDIA: 0.55, BAIXA: 0.15 },
};

/** Ocorrências esperadas de um tipo, numa região, numa hora local específica. */
export function expectedPerHour(regionCode: string, kind: OccurrenceKind, hour: number, weekday: number, daysAgo: number) {
  const daily = DAILY_RATES[regionCode]?.[kind] ?? 0;
  const hours = HOUR_WEIGHTS[kind];
  const hourShare = hours[hour] / hours.reduce((sum, w) => sum + w, 0);
  return daily * hourShare * WEEKDAY_WEIGHTS[kind][weekday] * trend(regionCode, daysAgo);
}

export function pickSeverity(kind: OccurrenceKind, random: () => number): AlertSeverity {
  let roll = random();
  for (const [severity, share] of Object.entries(SEVERITY_MIX[kind]) as [AlertSeverity, number][]) {
    roll -= share;
    if (roll <= 0) return severity;
  }
  return "MEDIA";
}

/** Sorteio de Poisson (Knuth): quantos eventos acontecem num intervalo com média `lambda`. */
export function poisson(lambda: number, random: () => number) {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= random();
  } while (p > limit);
  return k - 1;
}

/**
 * Histórias de degradação de alguns dispositivos, aplicadas sobre as medições normais.
 * `daysAgo` = 0 é hoje (usado pelo simulador); valores maiores reconstroem o passado (seed).
 * - CAM-IN-10442: a taxa de quadros cai aos poucos há 30 dias (câmera prestes a falhar).
 * - RAD-2024-0001: a contagem de veículos despencou nos últimos 5 dias (sensor com defeito).
 * - PAT-0099: a bateria carrega cada vez menos (desgaste).
 * - TOT-ZA-0031: o uso do totem cresce mês a mês (demanda subindo).
 */
export function applyDegradation(serialNumber: string, metrics: Record<string, number>, daysAgo: number) {
  const result = { ...metrics };
  if (serialNumber === "CAM-IN-10442" && result.fps !== undefined && daysAgo < 30) {
    const progress = 1 - daysAgo / 30;
    result.fps = Math.max(4, Math.round(result.fps - 15 * progress));
  }
  if (serialNumber === "RAD-2024-0001" && result.veiculosHora !== undefined && daysAgo < 5) {
    result.veiculosHora = Math.round(result.veiculosHora * 0.35);
  }
  if (serialNumber === "PAT-0099" && result.bateriaPct !== undefined) {
    const cap = 100 - 38 * Math.max(0, 1 - daysAgo / 60);
    result.bateriaPct = Math.round(Math.min(result.bateriaPct, cap));
  }
  if (serialNumber === "TOT-ZA-0031" && result.transacoesHora !== undefined) {
    result.transacoesHora = Math.round(result.transacoesHora * (1 + 0.5 * Math.max(0, 1 - daysAgo / 60)));
  }
  return result;
}

/** Equipamentos de fluxo (radar, cancela, totem) têm bem menos movimento no fim de semana. */
export function weekdayFlowFactor(weekday: number) {
  return weekday === 0 ? 0.55 : weekday === 6 ? 0.7 : 1;
}

/** Centro aproximado de cada bairro, para posicionar as ocorrências no mapa. */
export const DISTRICT_COORDS: Record<string, [number, number]> = {
  Centro: [-22.2148, -49.9478],
  Palmital: [-22.2018, -49.9385],
  "Jardim Maria Izabel": [-22.2105, -49.9285],
  Fragata: [-22.2262, -49.9575],
  Somenzari: [-22.2238, -49.9702],
  Cascata: [-22.2312, -49.9318],
  "Nova Marília": [-22.2418, -49.9298],
  "Jardim Cavallari": [-22.1958, -49.9521],
  "Alto Cafezal": [-22.2058, -49.9612],
  "Zona Rural": [-22.2402, -49.9874],
};

export const OCCURRENCE_NOTES: Record<OccurrenceKind, string[]> = {
  ACIDENTE: ["Colisão traseira", "Colisão lateral em cruzamento", "Atropelamento", "Queda de motociclista"],
  CONGESTIONAMENTO: ["Fluxo intenso no horário de pico", "Lentidão por evento", "Fila no cruzamento"],
  VANDALISMO: ["Pichação em equipamento", "Caixa de proteção arrombada", "Lâmpada quebrada"],
  FURTO: ["Furto de cabos", "Furto de veículo", "Furto a pedestre"],
  OBSTRUCAO_VIA: ["Caminhão em carga e descarga", "Obra sem sinalização", "Árvore caída"],
  SEMAFORO_INOPERANTE: ["Semáforo apagado após chuva", "Semáforo em amarelo intermitente"],
};
