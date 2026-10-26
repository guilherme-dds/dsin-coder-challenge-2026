/** Situação do agente em campo, reportada pelo dispositivo da equipe. */
export const AGENT_FIELD_STATUSES = [
  "DISPONIVEL",
  "EM_ATENDIMENTO",
  "EM_DESLOCAMENTO",
  "EM_PAUSA",
  "SEM_SINAL",
] as const;

export type AgentFieldStatus = (typeof AGENT_FIELD_STATUSES)[number];

export const ACTIVE_FIELD_STATUSES: AgentFieldStatus[] = [
  "DISPONIVEL",
  "EM_ATENDIMENTO",
  "EM_DESLOCAMENTO",
];
