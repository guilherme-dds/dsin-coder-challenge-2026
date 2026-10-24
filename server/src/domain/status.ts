export const EQUIPMENT_STATUSES = [
  "NAO_INSTALADO",
  "OPERACIONAL",
  "MAU_FUNCIONAMENTO",
  "EM_MANUTENCAO",
  "DESATIVADO",
  "FURTADO",
  "BAIXADO",
] as const;

export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export const MAINTENANCE_TYPES = ["NENHUMA", "IMEDIATA", "PERIODICA", "AGENDADA"] as const;

export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];

/**
 * Máquina de estados da situação do equipamento. Impede transições sem sentido,
 * como um equipamento furtado voltar direto a "operacional" sem passar por revisão.
 */
export const STATUS_TRANSITIONS: Record<EquipmentStatus, EquipmentStatus[]> = {
  NAO_INSTALADO: ["OPERACIONAL", "DESATIVADO", "FURTADO"],
  OPERACIONAL: ["MAU_FUNCIONAMENTO", "EM_MANUTENCAO", "DESATIVADO", "FURTADO"],
  MAU_FUNCIONAMENTO: ["EM_MANUTENCAO", "OPERACIONAL", "DESATIVADO", "FURTADO"],
  EM_MANUTENCAO: ["OPERACIONAL", "MAU_FUNCIONAMENTO", "DESATIVADO"],
  DESATIVADO: ["NAO_INSTALADO", "EM_MANUTENCAO", "BAIXADO"],
  FURTADO: ["EM_MANUTENCAO", "BAIXADO"],
  BAIXADO: [],
};

export function canTransition(from: EquipmentStatus, to: EquipmentStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}
