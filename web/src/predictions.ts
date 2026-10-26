/** Tipos e chamadas da API de previsões (parte 3: cidade preditiva). */
import type { RegionRef } from "./types";

export type RiskLevel = "ALTO" | "MODERADO" | "BAIXO";
export type FailureLevel = "ALTA" | "MEDIA" | "BAIXA";
export type StaffingStatus = "REFORCAR" | "ADEQUADO" | "FOLGA";

/** Explicação que acompanha cada previsão. */
export interface PredictionAbout {
  predicts: string;
  inputs: string[];
  method: string;
  use: string;
}

export interface HourForecast {
  at: string;
  hour: number;
  weekday: number;
  riskIndex: number;
  level: RiskLevel;
  expectedOccurrences: number;
  probability: number;
  expectedBusyAgents: number;
  topKinds: { kind: string; label: string; expected: number }[];
}

export interface RegionForecast {
  region: RegionRef;
  now: HourForecast;
  peak: HourForecast;
  hours: HourForecast[];
  factors: { label: string; detail: string }[];
}

export interface RiskResponse {
  generatedAt: string;
  about: PredictionAbout;
  basedOn: { occurrences: number; weeks: number };
  regions: RegionForecast[];
}

export interface HeatmapResponse {
  about: PredictionAbout;
  basedOn: { occurrences: number; weeks: number };
  cells: { weekday: number; hour: number; expectedOccurrences: number; riskIndex: number; level: RiskLevel }[][];
}

export interface StaffingResponse {
  about: PredictionAbout;
  currentShift: string;
  windows: {
    shift: string;
    label: string;
    start: string;
    end: string;
    reinforcement: number;
    regions: {
      region: RegionRef;
      expectedOccurrences: number;
      peakHour: number;
      needed: number;
      available: number;
      status: StaffingStatus;
      gap: number;
      suggestion: string;
    }[];
  }[];
}

export interface PredictedEquipment {
  id: string;
  serialNumber: string;
  type: { code: string; name: string };
  district: string;
}

export interface FailuresResponse {
  about: PredictionAbout;
  days: number;
  expectedFailures: number;
  failuresUsed: number;
  predictions: {
    equipment: PredictedEquipment & { latitude: number; longitude: number };
    probability: number;
    level: FailureLevel;
    factors: { label: string; detail: string; multiplier: number }[];
    recommendation: string;
  }[];
}

export interface AnomaliesResponse {
  about: PredictionAbout;
  anomalies: {
    equipment: PredictedEquipment;
    metric: string;
    metricLabel: string;
    direction: "ALTA" | "QUEDA";
    recent: number;
    baseline: number;
    changePct: number;
    score: number;
    anomalousDays: number;
    since: string;
    interpretation: string;
  }[];
}

export interface TrendsResponse {
  about: PredictionAbout;
  availability: {
    scope: { id: string | null; code: string; name: string };
    current: number;
    slopePerDay: number;
    projected: number;
    significant: boolean;
    daysToDegraded: number | null;
    daysToCritical: number | null;
    summary: string;
  }[];
  occurrences: {
    region: RegionRef;
    weekly: number[];
    changePerWeekPct: number;
    nextWeek: number;
    significant: boolean;
    summary: string;
  }[];
  utilization: {
    equipment: PredictedEquipment;
    metric: string;
    metricLabel: string;
    changePct: number;
    weeks: number;
    summary: string;
  }[];
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`/api/predictions${path}`);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? "Erro inesperado");
  return body as T;
}

export const predictionsApi = {
  risk: (hours = 24) => get<RiskResponse>(`/risk?hours=${hours}`),
  heatmap: (regionId?: string) => get<HeatmapResponse>(`/risk/heatmap${regionId ? `?regionId=${regionId}` : ""}`),
  staffing: (hours = 24) => get<StaffingResponse>(`/staffing?hours=${hours}`),
  failures: (days = 7, limit = 15) => get<FailuresResponse>(`/failures?days=${days}&limit=${limit}`),
  anomalies: () => get<AnomaliesResponse>("/anomalies"),
  trends: () => get<TrendsResponse>("/trends"),
};

/** Cor de cada nível de risco: só o alto usa cor de alerta; o baixo fica neutro (ISA-101). */
export const RISK_COLORS: Record<RiskLevel, string> = {
  ALTO: "var(--high)",
  MODERADO: "var(--medium)",
  BAIXO: "var(--normal)",
};

export const RISK_LABELS: Record<RiskLevel, string> = { ALTO: "Alto", MODERADO: "Moderado", BAIXO: "Baixo" };

export const FAILURE_COLORS: Record<FailureLevel, string> = {
  ALTA: "var(--high)",
  MEDIA: "var(--medium)",
  BAIXA: "var(--normal)",
};
