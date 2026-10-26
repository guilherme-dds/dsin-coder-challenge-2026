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

/**
 * Cores seguem a lógica de sala de controle (ISA-101): o que está normal fica neutro, e cor saturada
 * só aparece para o que é anormal. Assim o olho vai direto para o problema.
 */
export const STATUS_COLORS: Record<EquipmentStatus, string> = {
  OPERACIONAL: "var(--normal)",
  MAU_FUNCIONAMENTO: "var(--critical)",
  EM_MANUTENCAO: "var(--medium)",
  NAO_INSTALADO: "var(--low)",
  DESATIVADO: "var(--inactive)",
  FURTADO: "var(--magenta)",
  BAIXADO: "var(--inactive-dark)",
};

/** Mesmas cores de STATUS_COLORS em hex, para os pinos do Leaflet. */
export const STATUS_HEX: Record<EquipmentStatus, string> = {
  OPERACIONAL: "#8d939e",
  MAU_FUNCIONAMENTO: "#e5484d",
  EM_MANUTENCAO: "#d9b31c",
  NAO_INSTALADO: "#3aa8c1",
  DESATIVADO: "#5c616b",
  FURTADO: "#cf5b9e",
  BAIXADO: "#3d4149",
};

export const AGENCY_LABELS: Record<Agency, string> = {
  TRANSITO: "Trânsito",
  GUARDA_MUNICIPAL: "Guarda Municipal",
  POLICIA_MILITAR: "Polícia Militar",
  CONCESSIONARIA: "Concessionária",
};

export const CONNECTIVITY: Record<Connectivity, { label: string; description: string; color: string }> = {
  ONLINE: { label: "Online", description: "Comunicando normalmente", color: "var(--normal)" },
  INSTAVEL: { label: "Instável", description: "Sem contato há mais de 2 min", color: "var(--medium)" },
  OFFLINE: { label: "Sem comunicação", description: "Sem contato há mais de 10 min", color: "var(--critical)" },
  SEM_TELEMETRIA: { label: "Sem telemetria", description: "Fora de operação: não envia dados", color: "var(--inactive)" },
};

export const FIELD_STATUS: Record<AgentFieldStatus, { label: string; color: string }> = {
  DISPONIVEL: { label: "Disponível", color: "var(--normal)" },
  EM_ATENDIMENTO: { label: "Em atendimento", color: "var(--violet)" },
  EM_DESLOCAMENTO: { label: "Em deslocamento", color: "var(--accent)" },
  EM_PAUSA: { label: "Em pausa", color: "var(--inactive)" },
  SEM_SINAL: { label: "Sem sinal", color: "var(--critical)" },
};

/**
 * Forma do indicador (padrão de status do IBM Carbon): gravidade nunca depende só da cor,
 * para quem não distingue cores e para impressão.
 */
export type IndicatorShape = "diamond" | "triangle" | "square" | "circle" | "ring";

export const SEVERITY: Record<AlertSeverity, { label: string; color: string; shape: IndicatorShape }> = {
  CRITICA: { label: "Crítica", color: "var(--critical)", shape: "diamond" },
  ALTA: { label: "Alta", color: "var(--high)", shape: "triangle" },
  MEDIA: { label: "Média", color: "var(--medium)", shape: "square" },
  BAIXA: { label: "Baixa", color: "var(--low)", shape: "circle" },
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

export const HEALTH: Record<HealthLevel, { label: string; description: string; color: string; shape: IndicatorShape }> = {
  CRITICO: { label: "Crítica", description: "Alerta crítico ou disponibilidade abaixo de 60%", color: "var(--critical)", shape: "diamond" },
  ATENCAO: { label: "Atenção", description: "Alerta grave ou disponibilidade abaixo de 80%", color: "var(--high)", shape: "triangle" },
  NORMAL: { label: "Normal", description: "Operando normalmente", color: "var(--normal)", shape: "circle" },
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
export const URGENCY: Record<
  UrgencyLevel,
  { label: string; description: string; color: string; hex: string; shape: IndicatorShape }
> = {
  CRITICO: { label: "Crítico", description: "Falha ativa ou manutenção imediata", color: "var(--critical)", hex: "#e5484d", shape: "diamond" },
  ALERTA: { label: "Alerta", description: "Sem comunicação ou manutenção vencida", color: "var(--high)", hex: "#ef7d1a", shape: "triangle" },
  ATENCAO: { label: "Atenção", description: "Em manutenção ou manutenção nos próximos 7 dias", color: "var(--medium)", hex: "#d9b31c", shape: "square" },
  NORMAL: { label: "Normal", description: "Operando normalmente", color: "var(--normal)", hex: "#8d939e", shape: "circle" },
  PENDENTE: { label: "Pendente", description: "Aguardando instalação", color: "var(--low)", hex: "#3aa8c1", shape: "ring" },
  INATIVO: { label: "Inativo", description: "Furtado, desativado ou baixado", color: "var(--inactive)", hex: "#5c616b", shape: "ring" },
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

/**
 * Cor da disponibilidade (barras e medidores), com os mesmos limites da saúde das regiões:
 * neutro a partir de 80%, atenção abaixo disso e crítico abaixo de 60%.
 */
export function availabilityColor(percent: number) {
  if (percent >= 80) return "var(--normal)";
  if (percent >= 60) return "var(--medium)";
  return "var(--critical)";
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
