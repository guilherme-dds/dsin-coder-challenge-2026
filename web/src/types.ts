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
  urgency: UrgencyLevel;
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
  _count?: { responsibleFor: number };
}

export interface FailurePoint {
  latitude: number;
  longitude: number;
  weight: number;
}

export interface OperationsMapData {
  equipments: Equipment[];
  agents: Agent[];
  failures: FailurePoint[];
}

export interface Dashboard {
  totals: { equipments: number; activeAgents: number };
  byUrgency: Record<UrgencyLevel, number>;
  byStatus: Partial<Record<EquipmentStatus, number>>;
  byType: { name: string; code: string; count: number }[];
  critical: Equipment[];
}
