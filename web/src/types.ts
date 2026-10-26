export type EquipmentStatus =
  | "NAO_INSTALADO"
  | "OPERACIONAL"
  | "MAU_FUNCIONAMENTO"
  | "EM_MANUTENCAO"
  | "DESATIVADO"
  | "FURTADO"
  | "BAIXADO";

export type MaintenanceType = "NENHUMA" | "IMEDIATA" | "PERIODICA" | "AGENDADA";

export type UrgencyLevel = "CRITICO" | "ALERTA" | "ATENCAO" | "NORMAL" | "PENDENTE" | "INATIVO";

export type AgentRole = "AGENTE_TRANSITO" | "GUARDA_MUNICIPAL" | "POLICIAL_MILITAR";

export type Agency = "TRANSITO" | "GUARDA_MUNICIPAL" | "POLICIA_MILITAR" | "CONCESSIONARIA";

export type Connectivity = "ONLINE" | "INSTAVEL" | "OFFLINE" | "SEM_TELEMETRIA";

export type AgentFieldStatus = "DISPONIVEL" | "EM_ATENDIMENTO" | "EM_DESLOCAMENTO" | "EM_PAUSA" | "SEM_SINAL";

export type AlertSeverity = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";

export type AlertStatus = "ABERTO" | "RECONHECIDO" | "RESOLVIDO";

export type AlertKind =
  | "EQUIPAMENTO_OFFLINE"
  | "FALHA_REPORTADA"
  | "FURTO"
  | "MANUTENCAO_VENCIDA"
  | "MANUTENCAO_PROXIMA"
  | "LEITURA_ANOMALA"
  | "REGIAO_DEGRADADA"
  | "AGENTE_SEM_SINAL";

export type HealthLevel = "CRITICO" | "ATENCAO" | "NORMAL";

export type Shift = "MANHA" | "TARDE" | "NOITE" | "MADRUGADA";

export interface AttributeField {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "select";
  unit?: string;
  options?: string[];
  required?: boolean;
}

export interface EquipmentType {
  id: string;
  code: string;
  name: string;
  category: string;
  mobile: boolean;
  attributesSchema: AttributeField[];
  _count?: { equipments: number };
}

export interface Location {
  zipCode: string;
  street: string;
  reference: string;
  district: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}

export interface Equipment extends Location {
  id: string;
  serialNumber: string;
  brand: string;
  model: string;
  typeId: string;
  type: EquipmentType;
  status: EquipmentStatus;
  maintenanceType: MaintenanceType;
  nextMaintenanceAt: string | null;
  maintenanceIntervalDays: number | null;
  attributes: Record<string, unknown>;
  responsibleAgentId: string | null;
  agency: Agency;
  urgency: UrgencyLevel;
  connectivity: Connectivity;
  /** Último contato recebido do dispositivo. */
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentEvent {
  id: string;
  kind: "CRIADO" | "ATUALIZADO" | "STATUS_ALTERADO" | "MANUTENCAO_AGENDADA" | "MANUTENCAO_CONCLUIDA";
  fromStatus: EquipmentStatus | null;
  toStatus: EquipmentStatus | null;
  note: string | null;
  agent: { id: string; name: string } | null;
  createdAt: string;
}

export interface EquipmentRecord extends Equipment {
  responsibleAgent: Agent | null;
  events: EquipmentEvent[];
  allowedTransitions: EquipmentStatus[];
}

export interface Agent {
  id: string;
  name: string;
  registration: string;
  role: AgentRole;
  rank: string | null;
  phone: string | null;
  email: string | null;
  shift: Shift | null;
  baseName: string;
  district: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
  fieldStatus: AgentFieldStatus;
  lastPositionAt: string | null;
  _count?: { responsibleFor: number };
}

export interface FailurePoint {
  latitude: number;
  longitude: number;
  weight: number;
}

export interface RegionRef {
  id: string;
  code: string;
  name: string;
}

/** Código da região de cada ponto do mapa ("SEM_REGIAO" para bairros fora das regiões). */
export type WithRegion<T> = T & { regionCode: string };

export interface OperationsMapData {
  equipments: WithRegion<Equipment>[];
  agents: WithRegion<Agent>[];
  regions: RegionRef[];
  failures: FailurePoint[];
}

/** Região na visão consolidada: disponibilidade, alertas e nível de saúde. */
export interface RegionOverview {
  /** Nulo no grupo "Sem região" (bairros fora das regiões cadastradas). */
  id: string | null;
  code: string;
  name: string;
  districts: string[];
  total: number;
  installed: number;
  operational: number;
  unavailable: number;
  availability: number;
  offline: number;
  byUrgency: Record<UrgencyLevel, number>;
  activeAgents: number;
  openAlerts: Record<AlertSeverity, number>;
  health: HealthLevel;
}

/** Registro do histórico de disponibilidade (cidade ou região). */
export interface AvailabilityPoint {
  takenAt: string;
  total: number;
  installed: number;
  operational: number;
  unavailable: number;
  activeAgents: number;
  openAlerts: number;
  availability: number;
}

export interface TelemetryReading {
  receivedAt: string;
  metrics: Record<string, number>;
}

export interface Alert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string | null;
  openedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  equipment: {
    id: string;
    serialNumber: string;
    district: string;
    latitude: number;
    longitude: number;
    type: { code: string; name: string };
  } | null;
  agent: { id: string; name: string; role: AgentRole; latitude: number | null; longitude: number | null } | null;
  region: RegionRef | null;
}

export interface Dashboard {
  totals: {
    equipments: number;
    installed: number;
    operational: number;
    unavailable: number;
    availability: number;
    activeAgents: number;
    agentsOnDuty: number;
  };
  health: HealthLevel;
  openAlerts: Record<AlertSeverity, number>;
  connectivity: Record<Connectivity, number>;
  agentsByFieldStatus: Record<AgentFieldStatus, number>;
  regionsByHealth: Record<HealthLevel, number>;
  byUrgency: Record<UrgencyLevel, number>;
  byStatus: Partial<Record<EquipmentStatus, number>>;
  byAgency: Partial<Record<Agency, number>>;
  byType: { name: string; code: string; count: number }[];
  critical: Equipment[];
}
