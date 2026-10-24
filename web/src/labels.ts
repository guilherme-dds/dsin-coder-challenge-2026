import type { AgentRole, EquipmentEvent, EquipmentStatus, MaintenanceType, Shift, UrgencyLevel } from "./types";

export const STATUS_LABELS: Record<EquipmentStatus, string> = {
  NAO_INSTALADO: "Ainda não instalado",
  OPERACIONAL: "Operacional",
  MAU_FUNCIONAMENTO: "Mau funcionamento",
  EM_MANUTENCAO: "Em manutenção",
  DESATIVADO: "Desativado",
  FURTADO: "Furtado",
  BAIXADO: "Baixado (descartado)",
};

export const STATUS_COLORS: Record<EquipmentStatus, string> = {
  OPERACIONAL: "var(--state-green)",
  MAU_FUNCIONAMENTO: "var(--state-red)",
  EM_MANUTENCAO: "var(--state-yellow)",
  NAO_INSTALADO: "var(--state-blue)",
  DESATIVADO: "#8b93a7",
  FURTADO: "#b46bff",
  BAIXADO: "#3f4452",
};

export const MAINTENANCE_LABELS: Record<MaintenanceType, string> = {
  NENHUMA: "Nenhuma",
  IMEDIATA: "Imediata",
  PERIODICA: "Periódica",
  AGENDADA: "Agendada",
};

/** `hex` é usado onde variáveis CSS não chegam (ícones e camadas do Leaflet). */
export const URGENCY: Record<UrgencyLevel, { label: string; description: string; color: string; hex: string }> = {
  CRITICO: { label: "Crítico", description: "Falha ativa ou manutenção imediata", color: "var(--state-red)", hex: "#ff4d5e" },
  ALERTA: { label: "Alerta", description: "Manutenção vencida", color: "var(--state-orange)", hex: "#ff9f1c" },
  ATENCAO: { label: "Atenção", description: "Em manutenção ou manutenção nos próximos 7 dias", color: "var(--state-yellow)", hex: "#ffd23f" },
  NORMAL: { label: "Normal", description: "Operando normalmente", color: "var(--state-green)", hex: "#2ee59d" },
  PENDENTE: { label: "Pendente", description: "Aguardando instalação", color: "var(--state-blue)", hex: "#4d9fff" },
  INATIVO: { label: "Inativo", description: "Furtado, desativado ou baixado", color: "var(--state-gray)", hex: "#6b7280" },
};

export const ROLE_LABELS: Record<AgentRole, string> = {
  AGENTE_TRANSITO: "Agente de trânsito",
  GUARDA_MUNICIPAL: "Guarda municipal",
  POLICIAL_MILITAR: "Policial militar",
};

export const SHIFT_LABELS: Record<Shift, string> = {
  MANHA: "Manhã",
  TARDE: "Tarde",
  NOITE: "Noite",
  MADRUGADA: "Madrugada",
};

export const EVENT_LABELS: Record<EquipmentEvent["kind"], string> = {
  CRIADO: "Cadastrado no inventário",
  ATUALIZADO: "Dados atualizados",
  STATUS_ALTERADO: "Situação alterada",
  MANUTENCAO_AGENDADA: "Manutenção agendada",
  MANUTENCAO_CONCLUIDA: "Manutenção concluída",
};

export const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

export const formatDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR");

const DAY_MS = 24 * 60 * 60 * 1000;

/** Texto relativo para a próxima manutenção: "vencida há 3 dias", "em 5 dias"... */
export function maintenanceDue(iso: string | null) {
  if (!iso) return null;
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS);
  if (days < 0) return `vencida há ${-days} ${-days === 1 ? "dia" : "dias"}`;
  if (days === 0) return "vence hoje";
  return `em ${days} ${days === 1 ? "dia" : "dias"}`;
}

export const initials = (name: string) =>
  name
    .replace(/^(Sgt|Cb|Sd|Ten|Cap)\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
