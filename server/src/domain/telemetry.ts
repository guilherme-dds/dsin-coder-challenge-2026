export type TelemetryMetrics = Record<string, number>;

export function sampleMetrics(
  type: string,
  random: () => number = Math.random,
): TelemetryMetrics {
  switch (type) {
    case "RADAR":
      return {
        veiculosHora: 200 + Math.floor(random() * 600),
        velocidadeMedia: 35 + Math.floor(random() * 20),
        infracoesHora: Math.floor(random() * 12),
      };
    case "CAMERA":
      return {
        fps: 24 + Math.floor(random() * 7),
        bitrateKbps: 2500 + Math.floor(random() * 3000),
      };
    case "BALANCA":
      return {
        pesagensHora: 20 + Math.floor(random() * 60),
        excessosHora: Math.floor(random() * 5),
      };
    case "TOTEM_ESTACIONAMENTO":
      return {
        transacoesHora: Math.floor(random() * 40),
        papelPct: 20 + Math.floor(random() * 80),
      };
    case "CANCELA":
      return { aberturasHora: Math.floor(random() * 120) };
    case "PATINETE":
      return { bateriaPct: 15 + Math.floor(random() * 85) };
    default:
      return {
        velocidade: Math.floor(random() * 60),
        ignicao: random() > 0.3 ? 1 : 0,
      };
  }
}

interface MetricLimit {
  label: string;
  min: number;
}

export const METRIC_LIMITS: Record<string, MetricLimit> = {
  fps: { label: "Taxa de quadros", min: 10 },
  bitrateKbps: { label: "Taxa de transmissão", min: 500 },
  papelPct: { label: "Papel do comprovante", min: 10 },
  bateriaPct: { label: "Bateria", min: 10 },
};

export const METRIC_LABELS: Record<string, string> = {
  veiculosHora: "veículos por hora",
  velocidadeMedia: "velocidade média",
  infracoesHora: "infrações por hora",
  fps: "taxa de quadros",
  bitrateKbps: "taxa de transmissão",
  pesagensHora: "pesagens por hora",
  excessosHora: "excessos de peso por hora",
  transacoesHora: "transações por hora",
  papelPct: "papel do comprovante",
  aberturasHora: "aberturas por hora",
  bateriaPct: "bateria",
  velocidade: "velocidade",
  ignicao: "ignição",
};

export const FLOW_METRICS = [
  "veiculosHora",
  "aberturasHora",
  "transacoesHora",
  "pesagensHora",
];

export const DEGRADATION_CHECKS: {
  metric: string;
  stat: "avg" | "max";
  limit: number;
  meaning: string;
}[] = [
  {
    metric: "fps",
    stat: "avg",
    limit: 10,
    meaning: "a câmera deixa de gerar imagem útil",
  },
  {
    metric: "bitrateKbps",
    stat: "avg",
    limit: 500,
    meaning: "a transmissão de vídeo se torna inviável",
  },
  {
    metric: "bateriaPct",
    stat: "max",
    limit: 70,
    meaning: "a bateria não segura mais uma jornada de uso",
  },
];

export interface MetricViolation {
  metric: string;
  label: string;
  value: number;
  min: number;
}

export function findViolations(metrics: TelemetryMetrics): MetricViolation[] {
  return Object.entries(metrics).flatMap(([metric, value]) => {
    const limit = METRIC_LIMITS[metric];
    return limit && value < limit.min
      ? [{ metric, label: limit.label, value, min: limit.min }]
      : [];
  });
}
