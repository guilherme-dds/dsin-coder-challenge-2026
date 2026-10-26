import type {
  Agent,
  Alert,
  AvailabilityPoint,
  Dashboard,
  Equipment,
  EquipmentRecord,
  EquipmentStatus,
  EquipmentType,
  Location,
  OperationsMapData,
  RegionOverview,
  TelemetryReading,
} from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      body?.error ?? "Erro inesperado",
      body?.details,
    );
  return body as T;
}

const json = (method: string, data: unknown): RequestInit => ({
  method,
  body: JSON.stringify(data),
});

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  );
  return search.size ? `?${search}` : "";
};

export type EquipmentPayload = Omit<
  Equipment,
  | "id"
  | "type"
  | "urgency"
  | "connectivity"
  | "lastSeenAt"
  | "createdAt"
  | "updatedAt"
>;

export type AgentPayload = Omit<
  Agent,
  "id" | "_count" | "fieldStatus" | "lastPositionAt"
>;

export const api = {
  dashboard: () => request<Dashboard>("/dashboard"),
  operationsMap: () => request<OperationsMapData>("/map"),

  regions: () => request<RegionOverview[]>("/regions"),
  availabilityHistory: (regionId?: string, hours = 24) =>
    request<AvailabilityPoint[]>(
      `/regions/history${query({ regionId, hours: String(hours) })}`,
    ),

  alerts: () => request<Alert[]>("/alerts"),
  acknowledgeAlert: (id: string) =>
    request<Alert>(`/alerts/${id}/acknowledge`, json("POST", {})),

  equipmentTypes: () => request<EquipmentType[]>("/equipment-types"),

  equipments: (filters: Record<string, string | undefined> = {}) =>
    request<Equipment[]>(`/equipments${query(filters)}`),
  equipment: (id: string) => request<EquipmentRecord>(`/equipments/${id}`),
  telemetry: (id: string, limit = 10) =>
    request<TelemetryReading[]>(`/equipments/${id}/telemetry?limit=${limit}`),
  createEquipment: (data: EquipmentPayload) =>
    request<Equipment>("/equipments", json("POST", data)),
  updateEquipment: (id: string, data: EquipmentPayload) =>
    request<Equipment>(`/equipments/${id}`, json("PUT", data)),
  changeStatus: (
    id: string,
    data: { status: EquipmentStatus; note?: string; agentId?: string | null },
  ) => request<Equipment>(`/equipments/${id}/status`, json("POST", data)),
  scheduleMaintenance: (id: string, data: { date: string; note?: string }) =>
    request<Equipment>(`/equipments/${id}/maintenance`, json("POST", data)),

  agents: (filters: Record<string, string | undefined> = {}) =>
    request<Agent[]>(`/agents${query(filters)}`),
  agent: (id: string) => request<Agent>(`/agents/${id}`),
  createAgent: (data: AgentPayload) =>
    request<Agent>("/agents", json("POST", data)),
  updateAgent: (id: string, data: AgentPayload) =>
    request<Agent>(`/agents/${id}`, json("PUT", data)),

  cep: (cep: string) =>
    request<Omit<Location, "reference" | "latitude" | "longitude">>(
      `/cep/${cep}`,
    ),
};
