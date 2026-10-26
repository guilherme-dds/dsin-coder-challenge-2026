export const ALERT_KINDS = [
  "EQUIPAMENTO_OFFLINE",
  "FALHA_REPORTADA",
  "FURTO",
  "MANUTENCAO_VENCIDA",
  "MANUTENCAO_PROXIMA",
  "LEITURA_ANOMALA",
  "REGIAO_DEGRADADA",
  "AGENTE_SEM_SINAL",
  "RISCO_PREVISTO",
  "FALHA_PROVAVEL",
  "COMPORTAMENTO_ANOMALO",
  "TENDENCIA_DISPONIBILIDADE",
  "TENDENCIA_OCORRENCIAS",
] as const;

export type AlertKind = (typeof ALERT_KINDS)[number];

export const PREVENTIVE_KINDS: AlertKind[] = [
  "RISCO_PREVISTO",
  "FALHA_PROVAVEL",
  "COMPORTAMENTO_ANOMALO",
  "TENDENCIA_DISPONIBILIDADE",
  "TENDENCIA_OCORRENCIAS",
];

export const ALERT_SEVERITIES = ["CRITICA", "ALTA", "MEDIA", "BAIXA"] as const;

export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = ["ABERTO", "RECONHECIDO", "RESOLVIDO"] as const;

export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const DEFAULT_RECOMMENDATIONS: Partial<Record<AlertKind, string>> = {
  FURTO:
    "Acionar a Guarda Municipal, registrar o boletim e avaliar a reposição do equipamento.",
  FALHA_REPORTADA: "Despachar a equipe de manutenção para o local.",
  EQUIPAMENTO_OFFLINE: "Verificar energia e conexão do dispositivo no local.",
  MANUTENCAO_VENCIDA: "Agendar a manutenção preventiva.",
  MANUTENCAO_PROXIMA: "Confirmar equipe e material para a manutenção agendada.",
  LEITURA_ANOMALA:
    "Vistoria do dispositivo: imagem, papel ou bateria fora do limite.",
  REGIAO_DEGRADADA:
    "Priorizar o reparo dos equipamentos indisponíveis da região.",
  AGENTE_SEM_SINAL: "Contatar o agente por rádio ou telefone.",
};
