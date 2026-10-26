import type { AlertSeverity } from "./alerts.js";

/** Ocorrências operacionais atendidas pelas equipes em campo. */
export const OCCURRENCE_KINDS = [
  "ACIDENTE",
  "CONGESTIONAMENTO",
  "VANDALISMO",
  "FURTO",
  "OBSTRUCAO_VIA",
  "SEMAFORO_INOPERANTE",
] as const;

export type OccurrenceKind = (typeof OCCURRENCE_KINDS)[number];

export const OCCURRENCE_LABELS: Record<OccurrenceKind, string> = {
  ACIDENTE: "Acidente de trânsito",
  CONGESTIONAMENTO: "Congestionamento",
  VANDALISMO: "Vandalismo",
  FURTO: "Furto",
  OBSTRUCAO_VIA: "Obstrução de via",
  SEMAFORO_INOPERANTE: "Semáforo inoperante",
};

/** Tempo típico de atendimento, em minutos: quanto tempo a ocorrência ocupa a equipe. */
export const HANDLING_MINUTES: Record<OccurrenceKind, number> = {
  ACIDENTE: 70,
  CONGESTIONAMENTO: 45,
  VANDALISMO: 50,
  FURTO: 60,
  OBSTRUCAO_VIA: 40,
  SEMAFORO_INOPERANTE: 90,
};

/** Agentes normalmente empenhados conforme a gravidade. */
export const AGENTS_BY_SEVERITY: Record<AlertSeverity, number> = {
  CRITICA: 3,
  ALTA: 2,
  MEDIA: 1,
  BAIXA: 1,
};
