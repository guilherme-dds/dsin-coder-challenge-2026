/** Regras que podem gerar alertas operacionais. */
export const ALERT_KINDS = [
  "EQUIPAMENTO_OFFLINE",
  "FALHA_REPORTADA",
  "FURTO",
  "MANUTENCAO_VENCIDA",
  "MANUTENCAO_PROXIMA",
  "LEITURA_ANOMALA",
  "REGIAO_DEGRADADA",
  "AGENTE_SEM_SINAL",
] as const;

export type AlertKind = (typeof ALERT_KINDS)[number];

export const ALERT_SEVERITIES = ["CRITICA", "ALTA", "MEDIA", "BAIXA"] as const;

export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = ["ABERTO", "RECONHECIDO", "RESOLVIDO"] as const;

export type AlertStatus = (typeof ALERT_STATUSES)[number];
