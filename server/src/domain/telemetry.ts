/** Medições enviadas por um dispositivo IoT (ex.: {"veiculosHora": 420} ou {"fps": 25}). */
export type TelemetryMetrics = Record<string, number>;

/** Medições típicas de cada tipo de dispositivo. Usado pelo seed e pelo simulador. */
export function sampleMetrics(type: string, random: () => number = Math.random): TelemetryMetrics {
  switch (type) {
    case "RADAR":
      return { veiculosHora: 200 + Math.floor(random() * 600), velocidadeMedia: 35 + Math.floor(random() * 20), infracoesHora: Math.floor(random() * 12) };
    case "CAMERA":
      return { fps: 24 + Math.floor(random() * 7), bitrateKbps: 2500 + Math.floor(random() * 3000) };
    case "BALANCA":
      return { pesagensHora: 20 + Math.floor(random() * 60), excessosHora: Math.floor(random() * 5) };
    case "TOTEM_ESTACIONAMENTO":
      return { transacoesHora: Math.floor(random() * 40), papelPct: 20 + Math.floor(random() * 80) };
    case "CANCELA":
      return { aberturasHora: Math.floor(random() * 120) };
    case "PATINETE":
      return { bateriaPct: 15 + Math.floor(random() * 85) };
    default:
      return { velocidade: Math.floor(random() * 60), ignicao: random() > 0.3 ? 1 : 0 };
  }
}

interface MetricLimit {
  label: string;
  min: number;
}

/**
 * Limites abaixo dos quais a leitura indica um problema, mesmo com o dispositivo comunicando:
 * a câmera que transmite mas sem imagem útil, o totem sem papel, o patinete sem bateria.
 */
export const METRIC_LIMITS: Record<string, MetricLimit> = {
  fps: { label: "Taxa de quadros", min: 10 },
  bitrateKbps: { label: "Taxa de transmissão", min: 500 },
  papelPct: { label: "Papel do comprovante", min: 10 },
  bateriaPct: { label: "Bateria", min: 10 },
};

export interface MetricViolation {
  metric: string;
  label: string;
  value: number;
  min: number;
}

export function findViolations(metrics: TelemetryMetrics): MetricViolation[] {
  return Object.entries(metrics).flatMap(([metric, value]) => {
    const limit = METRIC_LIMITS[metric];
    return limit && value < limit.min ? [{ metric, label: limit.label, value, min: limit.min }] : [];
  });
}
