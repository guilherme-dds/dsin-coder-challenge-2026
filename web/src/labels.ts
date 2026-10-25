import type {
  Agency,
  AgentFieldStatus,
  AgentRole,
  AlertKind,
  AlertSeverity,
  Connectivity,
  EquipmentEvent,
  EquipmentStatus,
  HealthLevel,
  MaintenanceType,
  Shift,
  UrgencyLevel,
} from "./types";

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

/** Mesmas cores de STATUS_COLORS em hex, para os pinos do Leaflet. */
export const STATUS_HEX: Record<EquipmentStatus, string> = {
  OPERACIONAL: "#2ee59d",
  MAU_FUNCIONAMENTO: "#ff4d5e",
  EM_MANUTENCAO: "#ffd23f",
  NAO_INSTALADO: "#4d9fff",
  DESATIVADO: "#8b93a7",
  FURTADO: "#b46bff",
  BAIXADO: "#3f4452",
};

export const AGENCY_LABELS: Record<Agency, string> = {
  TRANSITO: "Trânsito",
  GUARDA_MUNICIPAL: "Guarda Municipal",
  POLICIA_MILITAR: "Polícia Militar",
  CONCESSIONARIA: "Concessionária",
};

export const CONNECTIVITY: Record<Connectivity, { label: string; description: string; color: string }> = {
  ONLINE: { label: "Online", description: "Comunicando normalmente", color: "var(--state-green)" },
  INSTAVEL: { label: "Instável", description: "Sem contato há mais de 2 min", color: "var(--state-yellow)" },
  OFFLINE: { label: "Sem comunicação", description: "Sem contato há mais de 10 min", color: "var(--state-red)" },
  SEM_TELEMETRIA: { label: "Sem telemetria", description: "Fora de operação: não envia dados", color: "var(--state-gray)" },
};

export const FIELD_STATUS: Record<AgentFieldStatus, { label: string; color: string }> = {
  DISPONIVEL: { label: "Disponível", color: "var(--state-green)" },
  EM_ATENDIMENTO: { label: "Em atendimento", color: "var(--state-orange)" },
  EM_DESLOCAMENTO: { label: "Em deslocamento", color: "var(--state-blue)" },
  EM_PAUSA: { label: "Em pausa", color: "var(--state-gray)" },
  SEM_SINAL: { label: "Sem sinal", color: "var(--state-red)" },
};

export const SEVERITY: Record<AlertSeverity, { label: string; color: string }> = {
  CRITICA: { label: "Crítica", color: "var(--state-red)" },
  ALTA: { label: "Alta", color: "var(--state-orange)" },
  MEDIA: { label: "Média", color: "var(--state-yellow)" },
  BAIXA: { label: "Baixa", color: "var(--state-blue)" },
};

export const ALERT_KIND_LABELS: Record<AlertKind, string> = {
  EQUIPAMENTO_OFFLINE: "Sem comunicação",
  FALHA_REPORTADA: "Falha reportada",
  FURTO: "Furto",
  MANUTENCAO_VENCIDA: "Manutenção vencida",
  MANUTENCAO_PROXIMA: "Manutenção próxima",
  LEITURA_ANOMALA: "Leitura anômala",
  REGIAO_DEGRADADA: "Região degradada",
  AGENTE_SEM_SINAL: "Agente sem sinal",
};

export const HEALTH: Record<HealthLevel, { label: string; description: string; color: string }> = {
  CRITICO: { label: "Crítica", description: "Alerta crítico ou disponibilidade abaixo de 60%", color: "var(--state-red)" },
  ATENCAO: { label: "Atenção", description: "Alerta grave ou disponibilidade abaixo de 80%", color: "var(--state-orange)" },
  NORMAL: { label: "Normal", description: "Operando normalmente", color: "var(--state-green)" },
};

/** Nome amigável das medições de telemetria; medições desconhecidas aparecem pela chave. */
export const METRIC_LABELS: Record<string, string> = {
  veiculosHora: "Veículos/h",
  velocidadeMedia: "Velocidade média (km/h)",
  infracoesHora: "Infrações/h",
  fps: "Quadros/s",
  bitrateKbps: "Transmissão (kbps)",
  pesagensHora: "Pesagens/h",
  excessosHora: "Excessos/h",
  transacoesHora: "Transações/h",
  papelPct: "Papel (%)",
  aberturasHora: "Aberturas/h",
  bateriaPct: "Bateria (%)",
  velocidade: "Velocidade (km/h)",
  ignicao: "Ignição",
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

/** Tempo decorrido em texto curto: "agora", "há 40 s", "há 12 min", "há 3 h". */
export function timeAgo(iso: string | null, now = Date.now()) {
  if (!iso) return "nunca";
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "agora";
  if (seconds < 60) return `há ${seconds} s`;
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `há ${Math.floor(seconds / 3600)} h`;
  return `há ${Math.floor(seconds / 86400)} d`;
}

export const initials = (name: string) =>
  name
    .replace(/^(Sgt|Cb|Sd|Ten|Cap)\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
