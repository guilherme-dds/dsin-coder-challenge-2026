import { PrismaClient, type Prisma } from "@prisma/client";
import type { AttributeField } from "../src/domain/dynamic-attributes.js";
import { sampleMetrics } from "../src/domain/telemetry.js";
import { AGENTS_BY_SEVERITY, HANDLING_MINUTES, OCCURRENCE_KINDS } from "../src/domain/occurrences.js";
import { cityDayStart, cityTime, cityWeekday } from "../src/domain/time.js";
import {
  DISTRICT_COORDS,
  OCCURRENCE_NOTES,
  applyDegradation,
  expectedPerHour,
  pickSeverity,
  poisson,
  weekdayFlowFactor,
} from "../scripts/city-profile.js";

const prisma = new PrismaClient();

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS);

const types: { code: string; name: string; category: string; mobile?: boolean; fields: AttributeField[] }[] = [
  {
    code: "RADAR",
    name: "Radar de fiscalização",
    category: "FISCALIZACAO",
    fields: [
      {
        key: "modalidade",
        label: "Modalidade",
        type: "select",
        options: ["VELOCIDADE", "AVANCO_SEMAFORO", "CONVERSAO_PROIBIDA", "RETORNO_PROIBIDO", "FAIXA_EXCLUSIVA"],
        required: true,
      },
      { key: "velocidadeMaxima", label: "Velocidade máxima", type: "number", unit: "km/h" },
      { key: "faixasMonitoradas", label: "Faixas monitoradas", type: "number" },
    ],
  },
  {
    code: "CAMERA",
    name: "Câmera de videomonitoramento",
    category: "MONITORAMENTO",
    fields: [
      { key: "visaoNoturna", label: "Visão noturna", type: "boolean", required: true },
      { key: "resolucao", label: "Resolução", type: "select", options: ["720p", "1080p", "4K"], required: true },
      { key: "colorida", label: "Colorida", type: "boolean", required: true },
      { key: "ptz", label: "PTZ (giratória)", type: "boolean" },
      { key: "anguloVisao", label: "Ângulo de visão", type: "number", unit: "°" },
      { key: "direcao", label: "Direção (azimute)", type: "number", unit: "°" },
    ],
  },
  {
    code: "BALANCA",
    name: "Balança de caminhão",
    category: "FISCALIZACAO",
    fields: [
      { key: "capacidadeMaxima", label: "Capacidade máxima", type: "number", unit: "t", required: true },
      { key: "tecnologia", label: "Tecnologia", type: "select", options: ["ESTATICA", "DINAMICA_WIM"] },
    ],
  },
  {
    code: "VEICULO_FISCALIZACAO_ESTACIONAMENTO",
    name: "Veículo autônomo de fiscalização (Zona Azul)",
    category: "FISCALIZACAO",
    mobile: true,
    fields: [
      { key: "placa", label: "Placa", type: "text", required: true },
      { key: "camerasLpr", label: "Câmeras LPR", type: "number" },
      { key: "autonomia", label: "Autonomia", type: "number", unit: "h" },
    ],
  },
  {
    code: "CANCELA",
    name: "Cancela automatizada",
    category: "CONTROLE_ACESSO",
    fields: [
      { key: "acionamento", label: "Acionamento", type: "select", options: ["TAG", "LPR", "TICKET", "MANUAL"] },
      { key: "tempoAbertura", label: "Tempo de abertura", type: "number", unit: "s" },
    ],
  },
  {
    code: "VEICULO_TRANSPORTE",
    name: "Veículo de transporte",
    category: "TRANSPORTE",
    mobile: true,
    fields: [
      { key: "categoria", label: "Categoria", type: "select", options: ["TAXI", "MOTOTAXI", "ESCOLAR"], required: true },
      { key: "placa", label: "Placa", type: "text", required: true },
      { key: "alvara", label: "Nº do alvará", type: "text" },
      { key: "capacidadePassageiros", label: "Capacidade de passageiros", type: "number" },
    ],
  },
  {
    code: "TOTEM_ESTACIONAMENTO",
    name: "Totem de autoatendimento (Zona Azul)",
    category: "ESTACIONAMENTO",
    fields: [
      { key: "aceitaPix", label: "Aceita Pix", type: "boolean" },
      { key: "aceitaCartao", label: "Aceita cartão", type: "boolean" },
      { key: "imprimeComprovante", label: "Imprime comprovante", type: "boolean" },
    ],
  },
  {
    code: "PATINETE",
    name: "Patinete elétrico",
    category: "MICROMOBILIDADE",
    mobile: true,
    fields: [
      { key: "operadora", label: "Operadora", type: "text" },
      { key: "compartilhado", label: "Compartilhado", type: "boolean", required: true },
      { key: "velocidadeMaxima", label: "Velocidade máxima", type: "number", unit: "km/h" },
      { key: "autonomia", label: "Autonomia", type: "number", unit: "km" },
    ],
  },
  {
    code: "MOTO_AGENTE",
    name: "Moto de agente de trânsito",
    category: "VIATURA",
    mobile: true,
    fields: [
      { key: "placa", label: "Placa", type: "text", required: true },
      { key: "cilindradas", label: "Cilindradas", type: "number", unit: "cc" },
    ],
  },
  {
    code: "VIATURA",
    name: "Viatura (Guarda Municipal / PM)",
    category: "VIATURA",
    mobile: true,
    fields: [
      { key: "corporacao", label: "Corporação", type: "select", options: ["GUARDA_MUNICIPAL", "POLICIA_MILITAR"], required: true },
      { key: "prefixo", label: "Prefixo", type: "text", required: true },
      { key: "placa", label: "Placa", type: "text", required: true },
      { key: "blindada", label: "Blindada", type: "boolean" },
    ],
  },
];

const agents = [
  { name: "Ana Paula Ribeiro", registration: "AT-1021", role: "AGENTE_TRANSITO", shift: "MANHA", baseName: "Base Central de Trânsito", district: "Centro", latitude: -22.2129, longitude: -49.9497 },
  { name: "Carlos Henrique Souza", registration: "AT-1045", role: "AGENTE_TRANSITO", shift: "TARDE", baseName: "Base Central de Trânsito", district: "Centro", latitude: -22.2163, longitude: -49.9452 },
  { name: "Juliana Martins", registration: "GM-2210", role: "GUARDA_MUNICIPAL", rank: "Inspetora", shift: "NOITE", baseName: "Sede da Guarda Municipal", district: "Palmital", latitude: -22.2031, longitude: -49.9402 },
  { name: "Rafael Oliveira", registration: "GM-2234", role: "GUARDA_MUNICIPAL", rank: "Guarda 2ª classe", shift: "MADRUGADA", baseName: "Sede da Guarda Municipal", district: "Palmital", latitude: -22.2078, longitude: -49.9348 },
  { name: "Sgt. Marcos Lima", registration: "PM-90871", role: "POLICIAL_MILITAR", rank: "Sargento", shift: "MANHA", baseName: "9º BPM/I", district: "Fragata", latitude: -22.2248, longitude: -49.9590 },
  // Efetivo distribuído pelas regiões e turnos, para a recomendação de reforço ter onde remanejar
  { name: "Patrícia Gomes", registration: "AT-1062", role: "AGENTE_TRANSITO", shift: "NOITE", baseName: "Base Central de Trânsito", district: "Centro", latitude: -22.2141, longitude: -49.9481 },
  { name: "Diego Ferreira", registration: "AT-1078", role: "AGENTE_TRANSITO", shift: "TARDE", baseName: "Base Central de Trânsito", district: "Centro", latitude: -22.2155, longitude: -49.9466 },
  { name: "Renata Alves", registration: "GM-2251", role: "GUARDA_MUNICIPAL", shift: "TARDE", baseName: "Posto Cascata", district: "Cascata", latitude: -22.2318, longitude: -49.9325 },
  { name: "Cb. André Rocha", registration: "PM-90912", role: "POLICIAL_MILITAR", rank: "Cabo", shift: "NOITE", baseName: "Posto Nova Marília", district: "Nova Marília", latitude: -22.2411, longitude: -49.9306 },
  { name: "Thiago Mendes", registration: "GM-2263", role: "GUARDA_MUNICIPAL", shift: "NOITE", baseName: "Posto Fragata", district: "Fragata", latitude: -22.2269, longitude: -49.9568 },
  { name: "Sd. Larissa Costa", registration: "PM-90934", role: "POLICIAL_MILITAR", rank: "Soldado", shift: "MADRUGADA", baseName: "9º BPM/I", district: "Somenzari", latitude: -22.2231, longitude: -49.9695 },
  { name: "Bruno Carvalho", registration: "AT-1091", role: "AGENTE_TRANSITO", shift: "MANHA", baseName: "Posto Palmital", district: "Palmital", latitude: -22.2024, longitude: -49.9391 },
  { name: "Fernanda Lopes", registration: "AT-1103", role: "AGENTE_TRANSITO", shift: "MANHA", baseName: "Posto Zona Norte", district: "Jardim Cavallari", latitude: -22.1962, longitude: -49.9515 },
  { name: "Gustavo Pereira", registration: "GM-2277", role: "GUARDA_MUNICIPAL", shift: "TARDE", baseName: "Posto Zona Norte", district: "Alto Cafezal", latitude: -22.2063, longitude: -49.9605 },
  { name: "Sgt. Eduardo Nunes", registration: "PM-90956", role: "POLICIAL_MILITAR", rank: "Sargento", shift: "NOITE", baseName: "Base Rodoviária", district: "Zona Rural", latitude: -22.2396, longitude: -49.9866 },
];

interface SeedEquipment {
  type: string;
  serialNumber: string;
  brand: string;
  model: string;
  status: string;
  zipCode: string;
  street: string;
  reference: string;
  district: string;
  latitude: number;
  longitude: number;
  maintenanceType: string;
  nextMaintenanceAt?: Date;
  maintenanceIntervalDays?: number;
  attributes: Record<string, unknown>;
  responsible?: string;
}

// PRNG determinístico: o seed gera sempre a mesma cidade.
let state = 2026;
function random() {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
}
const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];

/** Propensão a falhas por bairro (0 a 1) — cria regiões quentes no mapa de calor. */
const FAILURE_HOTSPOTS: Record<string, number> = {
  Fragata: 1,
  Centro: 0.8,
  Cascata: 0.7,
  "Nova Marília": 0.6,
  Somenzari: 0.2,
  Palmital: 0.15,
  "Jardim Cavallari": 0.1,
};

const FAILURE_NOTES = [
  "Queda de energia após temporal",
  "Vandalismo na caixa de proteção",
  "Perda de conexão com a central",
  "Lente danificada",
  "Falha no sensor",
];

const NEIGHBORHOODS = [
  { district: "Centro", zipCode: "17500-000", lat: -22.2148, lng: -49.9478, streets: ["Rua 9 de Julho", "Av. Sampaio Vidal", "Rua São Luiz", "Rua Bahia"] },
  { district: "Palmital", zipCode: "17509-000", lat: -22.2018, lng: -49.9385, streets: ["Av. República", "Rua Paraíba", "Rua Ceará"] },
  { district: "Fragata", zipCode: "17513-000", lat: -22.2262, lng: -49.9575, streets: ["Av. Tiradentes", "Rua Santa Helena", "Av. Pedro de Toledo"] },
  { district: "Cascata", zipCode: "17506-000", lat: -22.2312, lng: -49.9318, streets: ["Av. Brigadeiro Eduardo Gomes", "Rua Prudente de Moraes"] },
  { district: "Nova Marília", zipCode: "17519-300", lat: -22.2418, lng: -49.9298, streets: ["Av. das Esmeraldas", "Rua das Turmalinas"] },
  { district: "Jardim Cavallari", zipCode: "17526-000", lat: -22.1958, lng: -49.9521, streets: ["Av. Castro Alves", "Rua José Bonifácio"] },
  { district: "Somenzari", zipCode: "17512-500", lat: -22.2238, lng: -49.9702, streets: ["Av. Vicente Ferreira", "Rua Benedito Alves"] },
];

const NETWORK_TEMPLATES: { type: string; prefix: string; brand: string; model: string; attributes: () => Record<string, unknown> }[] = [
  {
    type: "CAMERA", prefix: "CAM", brand: "Hikvision", model: "DS-2CD2T47",
    attributes: () => ({ visaoNoturna: random() > 0.4, resolucao: pick(["1080p", "4K"]), colorida: true, anguloVisao: 90, direcao: Math.floor(random() * 360) }),
  },
  {
    type: "RADAR", prefix: "RAD", brand: "Perkons", model: "PK-Speed 3",
    attributes: () => ({ modalidade: pick(["VELOCIDADE", "AVANCO_SEMAFORO", "CONVERSAO_PROIBIDA"]), velocidadeMaxima: pick([40, 50, 60]), faixasMonitoradas: 2 }),
  },
  {
    type: "TOTEM_ESTACIONAMENTO", prefix: "TOT", brand: "Digicon", model: "ParkStation 2",
    attributes: () => ({ aceitaPix: true, aceitaCartao: random() > 0.3, imprimeComprovante: random() > 0.5 }),
  },
  {
    type: "PATINETE", prefix: "PAT", brand: "Segway", model: "Ninebot Max",
    attributes: () => ({ operadora: "Prefeitura", compartilhado: true, velocidadeMaxima: 20, autonomia: 60 }),
  },
];

/** Gera a malha de equipamentos espalhada pelos bairros, com mais falhas nas regiões quentes. */
function generateNetwork(): SeedEquipment[] {
  return Array.from({ length: 22 }, (_, i) => {
    const hood = NEIGHBORHOODS[i % NEIGHBORHOODS.length];
    const template = NETWORK_TEMPLATES[i % NETWORK_TEMPLATES.length];
    const failing = random() < (FAILURE_HOTSPOTS[hood.district] ?? 0) * 0.45;
    const overdue = !failing && random() < 0.15;
    return {
      type: template.type,
      serialNumber: `${template.prefix}-NET-${String(i + 1).padStart(3, "0")}`,
      brand: template.brand,
      model: template.model,
      status: failing ? "MAU_FUNCIONAMENTO" : "OPERACIONAL",
      zipCode: hood.zipCode,
      street: pick(hood.streets),
      reference: `número ${100 + Math.floor(random() * 1800)}`,
      district: hood.district,
      latitude: hood.lat + (random() - 0.5) * 0.012,
      longitude: hood.lng + (random() - 0.5) * 0.012,
      maintenanceType: failing ? "IMEDIATA" : "PERIODICA",
      nextMaintenanceAt: failing ? undefined : daysFromNow(overdue ? -Math.ceil(random() * 15) : 10 + Math.floor(random() * 80)),
      maintenanceIntervalDays: 90,
      attributes: template.attributes(),
    };
  });
}

/** Regiões da cidade e seus bairros (visão consolidada da Central de Operações). */
const REGIONS: { code: string; name: string; districts: string[] }[] = [
  { code: "CENTRO", name: "Centro", districts: ["Centro"] },
  { code: "NORTE", name: "Zona Norte", districts: ["Jardim Cavallari", "Alto Cafezal"] },
  { code: "LESTE", name: "Zona Leste", districts: ["Palmital", "Jardim Maria Izabel"] },
  { code: "SUL", name: "Zona Sul", districts: ["Cascata", "Nova Marília"] },
  { code: "OESTE", name: "Zona Oeste", districts: ["Fragata", "Somenzari"] },
  { code: "RODOVIAS", name: "Rodovias e zona rural", districts: ["Zona Rural"] },
];

/** Órgão responsável conforme o tipo (e, para viaturas, a corporação). */
function agencyFor(type: string, attributes: Record<string, unknown>) {
  if (type === "CAMERA") return "GUARDA_MUNICIPAL";
  if (type === "VIATURA") return attributes.corporacao === "POLICIA_MILITAR" ? "POLICIA_MILITAR" : "GUARDA_MUNICIPAL";
  if (["TOTEM_ESTACIONAMENTO", "CANCELA", "PATINETE"].includes(type)) return "CONCESSIONARIA";
  return "TRANSITO";
}

const FIELD_STATUS_BY_AGENT: Record<string, string> = {
  "AT-1021": "EM_ATENDIMENTO",
  "AT-1045": "DISPONIVEL",
  "GM-2210": "EM_DESLOCAMENTO",
  "GM-2234": "EM_PAUSA",
  "PM-90871": "DISPONIVEL",
};

const MINUTE_MS = 60 * 1000;
const secondsAgo = (s: number) => new Date(Date.now() - s * 1000);

/** Último contato do dispositivo: a maioria online, falhas às vezes offline e alguns "silenciosos". */
function lastSeenFor(status: string) {
  if (["NAO_INSTALADO", "DESATIVADO", "FURTADO", "BAIXADO"].includes(status)) return null;
  const offline = status === "MAU_FUNCIONAMENTO" ? random() < 0.5 : random() < 0.08;
  return offline ? secondsAgo(20 * 60 + Math.floor(random() * 100 * 60)) : secondsAgo(Math.floor(random() * 90));
}

const UNAVAILABLE = ["MAU_FUNCIONAMENTO", "EM_MANUTENCAO", "DESATIVADO", "FURTADO"];

/** Quanto histórico de exemplo é gerado para as previsões. */
const OCCURRENCE_HISTORY_DAYS = 90;
const TELEMETRY_HISTORY_DAYS = 60;
const AVAILABILITY_HISTORY_HOURS = 7 * 24;

/** Dispositivos nessas situações não transmitem, então não têm histórico de telemetria. */
const SILENT_STATUSES = ["NAO_INSTALADO", "DESATIVADO", "FURTADO", "BAIXADO"];
/** Medições de fluxo, que caem no fim de semana. */
const FLOW_METRICS = ["veiculosHora", "aberturasHora", "transacoesHora", "pesagensHora"];

interface SeededEquipment {
  id: string;
  serialNumber: string;
  type: string;
  status: string;
  district: string;
}

/**
 * 90 dias de ocorrências sorteadas hora a hora a partir do perfil da cidade (scripts/city-profile.ts).
 * As previsões só enxergam o resultado, nunca o perfil.
 */
async function seedOccurrences(regionIds: Record<string, string>, equipments: SeededEquipment[], now: Date) {
  const rows: Prisma.OccurrenceCreateManyInput[] = [];
  for (let daysAgo = OCCURRENCE_HISTORY_DAYS; daysAgo >= 0; daysAgo--) {
    const weekday = cityWeekday(cityTime(now, daysAgo, 12));
    for (let hour = 0; hour < 24; hour++) {
      const slotStart = cityTime(now, daysAgo, hour);
      if (slotStart > now) break;
      for (const region of REGIONS) {
        for (const kind of OCCURRENCE_KINDS) {
          const count = poisson(expectedPerHour(region.code, kind, hour, weekday, daysAgo), random);
          for (let i = 0; i < count; i++) {
            const occurredAt = new Date(slotStart.getTime() + random() * 60 * MINUTE_MS);
            if (occurredAt > now) continue;
            const district = pick(region.districts);
            const [lat, lng] = DISTRICT_COORDS[district];
            const severity = pickSeverity(kind, random);
            const resolvedAt = new Date(occurredAt.getTime() + HANDLING_MINUTES[kind] * (0.5 + random()) * MINUTE_MS);
            // Parte do vandalismo atinge equipamentos do próprio bairro
            const target = kind === "VANDALISMO" && random() < 0.3 ? pick(equipments.filter((e) => e.district === district)) : undefined;
            rows.push({
              kind,
              severity,
              district,
              regionId: regionIds[region.code],
              latitude: lat + (random() - 0.5) * 0.01,
              longitude: lng + (random() - 0.5) * 0.01,
              occurredAt,
              resolvedAt: resolvedAt > now ? null : resolvedAt,
              agentsDispatched: AGENTS_BY_SEVERITY[severity],
              equipmentId: target?.id ?? null,
              note: pick(OCCURRENCE_NOTES[kind]),
            });
          }
        }
      }
    }
  }
  await prisma.occurrence.createMany({ data: rows });
  return rows.length;
}

/** 60 dias de resumos diários de telemetria, com as histórias de degradação aplicadas. */
async function seedTelemetryDaily(equipments: SeededEquipment[], now: Date) {
  const rows: Prisma.TelemetryDailyCreateManyInput[] = [];
  for (const e of equipments) {
    if (SILENT_STATUSES.includes(e.status)) continue;
    for (let daysAgo = TELEMETRY_HISTORY_DAYS; daysAgo >= 1; daysAgo--) {
      const noon = cityTime(now, daysAgo, 12);
      const flow = weekdayFlowFactor(cityWeekday(noon));
      const samples = Array.from({ length: 8 }, () => applyDegradation(e.serialNumber, sampleMetrics(e.type, random), daysAgo));
      for (const metric of Object.keys(samples[0])) {
        const values = samples.map((sample) => (FLOW_METRICS.includes(metric) ? Math.round(sample[metric] * flow) : sample[metric]));
        rows.push({
          equipmentId: e.id,
          date: cityDayStart(noon),
          metric,
          avg: Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10,
          min: Math.min(...values),
          max: Math.max(...values),
          // Um dia de leituras a cada 10 s
          samples: 8640,
        });
      }
    }
  }
  await prisma.telemetryDaily.createMany({ data: rows });
  return rows.length;
}

async function main() {
  const now = new Date();
  await prisma.occurrence.deleteMany();
  await prisma.telemetryDaily.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.availabilitySnapshot.deleteMany();
  await prisma.telemetryReading.deleteMany();
  await prisma.agentPosition.deleteMany();
  await prisma.district.deleteMany();
  await prisma.region.deleteMany();
  await prisma.equipmentEvent.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.equipmentType.deleteMany();

  const typeIds: Record<string, string> = {};
  for (const t of types) {
    const created = await prisma.equipmentType.create({
      data: {
        code: t.code,
        name: t.name,
        category: t.category,
        mobile: t.mobile ?? false,
        attributesSchema: JSON.stringify(t.fields),
      },
    });
    typeIds[t.code] = created.id;
  }

  const regionIds: Record<string, string> = {};
  const regionOfDistrict: Record<string, string> = {};
  for (const r of REGIONS) {
    const region = await prisma.region.create({
      data: { code: r.code, name: r.name, districts: { create: r.districts.map((name) => ({ name })) } },
    });
    regionIds[r.code] = region.id;
    r.districts.forEach((d) => (regionOfDistrict[d] = r.code));
  }

  const agentIds: Record<string, string> = {};
  for (const a of agents) {
    // Trilha dos últimos 25 minutos, terminando na posição atual
    const trail = Array.from({ length: 6 }, (_, i) => ({
      latitude: a.latitude + (5 - i) * 0.0009 * (random() - 0.3),
      longitude: a.longitude + (5 - i) * 0.0009 * (random() - 0.3),
      recordedAt: secondsAgo((5 - i) * 5 * 60 + 30),
    }));
    const created = await prisma.agent.create({
      data: {
        ...a,
        city: "Marília",
        state: "SP",
        fieldStatus: FIELD_STATUS_BY_AGENT[a.registration] ?? "DISPONIVEL",
        lastPositionAt: trail[trail.length - 1].recordedAt,
        positions: { create: trail },
      },
    });
    agentIds[a.registration] = created.id;
  }

  const equipments: SeedEquipment[] = [
    {
      type: "RADAR", serialNumber: "RAD-2024-0001", brand: "Perkons", model: "PK-Speed 3", status: "OPERACIONAL",
      zipCode: "17500-020", street: "Av. Sampaio Vidal", reference: "oposto ao número 181", district: "Centro",
      latitude: -22.2171, longitude: -49.9501, maintenanceType: "PERIODICA", nextMaintenanceAt: daysFromNow(45), maintenanceIntervalDays: 90,
      attributes: { modalidade: "VELOCIDADE", velocidadeMaxima: 50, faixasMonitoradas: 2 },
    },
    {
      type: "RADAR", serialNumber: "RAD-2024-0002", brand: "Velsis", model: "VS-Red", status: "MAU_FUNCIONAMENTO",
      zipCode: "17501-000", street: "Av. Rio Branco", reference: "cruzamento com a Rua 9 de Julho", district: "Centro",
      latitude: -22.2139, longitude: -49.9462, maintenanceType: "IMEDIATA",
      attributes: { modalidade: "AVANCO_SEMAFORO", faixasMonitoradas: 3 },
    },
    {
      type: "RADAR", serialNumber: "RAD-2023-0107", brand: "Perkons", model: "PK-Speed 2", status: "OPERACIONAL",
      zipCode: "17519-000", street: "Rodovia SP-294 (Comandante João Ribeiro de Barros)", reference: "KM 437", district: "Zona Rural",
      latitude: -22.2402, longitude: -49.9874, maintenanceType: "PERIODICA", nextMaintenanceAt: daysFromNow(-3), maintenanceIntervalDays: 60,
      attributes: { modalidade: "VELOCIDADE", velocidadeMaxima: 80, faixasMonitoradas: 2 },
    },
    {
      type: "CAMERA", serialNumber: "CAM-HK-55821", brand: "Hikvision", model: "DS-2DE4425IW", status: "OPERACIONAL",
      zipCode: "17500-090", street: "Rua 9 de Julho", reference: "em frente ao Mercado do Tio", district: "Centro",
      latitude: -22.2152, longitude: -49.9478, maintenanceType: "AGENDADA", nextMaintenanceAt: daysFromNow(4),
      attributes: { visaoNoturna: true, resolucao: "4K", colorida: true, ptz: true, anguloVisao: 110, direcao: 90 },
    },
    {
      type: "CAMERA", serialNumber: "CAM-IN-10442", brand: "Intelbras", model: "VIP 3230 B", status: "OPERACIONAL",
      zipCode: "17509-000", street: "Av. República", reference: "número 2.300", district: "Palmital",
      latitude: -22.2018, longitude: -49.9389, maintenanceType: "NENHUMA",
      attributes: { visaoNoturna: false, resolucao: "1080p", colorida: true, ptz: false, anguloVisao: 90, direcao: 180 },
    },
    {
      type: "CAMERA", serialNumber: "CAM-IN-10443", brand: "Intelbras", model: "VIP 3230 B", status: "FURTADO",
      zipCode: "17513-000", street: "Av. Tiradentes", reference: "S/N, próximo à praça", district: "Fragata",
      latitude: -22.2257, longitude: -49.9566, maintenanceType: "NENHUMA",
      attributes: { visaoNoturna: true, resolucao: "1080p", colorida: false },
    },
    {
      type: "BALANCA", serialNumber: "BAL-WIM-0007", brand: "Toledo", model: "WIM 9000", status: "EM_MANUTENCAO",
      zipCode: "17519-000", street: "Rodovia SP-333", reference: "KM 203", district: "Zona Rural",
      latitude: -22.1789, longitude: -49.9215, maintenanceType: "IMEDIATA",
      attributes: { capacidadeMaxima: 74, tecnologia: "DINAMICA_WIM" },
    },
    {
      type: "TOTEM_ESTACIONAMENTO", serialNumber: "TOT-ZA-0031", brand: "Digicon", model: "ParkStation 2", status: "OPERACIONAL",
      zipCode: "17500-010", street: "Rua São Luiz", reference: "número 540", district: "Centro",
      latitude: -22.2163, longitude: -49.9489, maintenanceType: "PERIODICA", nextMaintenanceAt: daysFromNow(20), maintenanceIntervalDays: 30,
      attributes: { aceitaPix: true, aceitaCartao: true, imprimeComprovante: false },
    },
    {
      type: "CANCELA", serialNumber: "CAN-PPA-1180", brand: "PPA", model: "Cancela Speed", status: "NAO_INSTALADO",
      zipCode: "17506-000", street: "Av. Brigadeiro Eduardo Gomes", reference: "entrada do terminal rodoviário", district: "Cascata",
      latitude: -22.2309, longitude: -49.9321, maintenanceType: "NENHUMA",
      attributes: { acionamento: "LPR", tempoAbertura: 3 },
    },
    {
      type: "PATINETE", serialNumber: "PAT-0099", brand: "Xiaomi", model: "Mi Pro 2", status: "OPERACIONAL",
      zipCode: "17500-020", street: "Av. Sampaio Vidal", reference: "estação Praça Saturnino de Brito", district: "Centro",
      latitude: -22.2146, longitude: -49.9468, maintenanceType: "NENHUMA",
      attributes: { operadora: "Prefeitura", compartilhado: true, velocidadeMaxima: 20, autonomia: 45 },
    },
    {
      type: "VEICULO_TRANSPORTE", serialNumber: "9BWZZZ377VT004251", brand: "Volkswagen", model: "Kombi Escolar", status: "OPERACIONAL",
      zipCode: "17512-000", street: "Rua Bahia", reference: "garagem da cooperativa, número 77", district: "Alto Cafezal",
      latitude: -22.2058, longitude: -49.9612, maintenanceType: "PERIODICA", nextMaintenanceAt: daysFromNow(-10), maintenanceIntervalDays: 180,
      attributes: { categoria: "ESCOLAR", placa: "FGO-2E26", alvara: "ESC-0412", capacidadePassageiros: 12 },
    },
    {
      type: "MOTO_AGENTE", serialNumber: "9C2KC1670LR000881", brand: "Honda", model: "XRE 300", status: "OPERACIONAL",
      zipCode: "17500-000", street: "Rua Coronel José Brás", reference: "Base Central de Trânsito", district: "Centro",
      latitude: -22.2129, longitude: -49.9497, maintenanceType: "PERIODICA", nextMaintenanceAt: daysFromNow(60), maintenanceIntervalDays: 120,
      attributes: { placa: "FGO-1A23", cilindradas: 300 }, responsible: "AT-1021",
    },
    {
      type: "VIATURA", serialNumber: "9BD358A4NKY123456", brand: "Fiat", model: "Toro Freedom", status: "OPERACIONAL",
      zipCode: "17509-000", street: "Av. República", reference: "Sede da Guarda Municipal", district: "Palmital",
      latitude: -22.2031, longitude: -49.9402, maintenanceType: "NENHUMA",
      attributes: { corporacao: "GUARDA_MUNICIPAL", prefixo: "GM-12", placa: "FGO-9H12", blindada: false }, responsible: "GM-2210",
    },
    {
      type: "VEICULO_FISCALIZACAO_ESTACIONAMENTO", serialNumber: "AUTO-ZA-01", brand: "Mobilis", model: "ScanCar LPR", status: "DESATIVADO",
      zipCode: "17500-000", street: "Rua Coronel José Brás", reference: "Base Central de Trânsito", district: "Centro",
      latitude: -22.2129, longitude: -49.9497, maintenanceType: "NENHUMA",
      attributes: { placa: "FGO-0Z01", camerasLpr: 4, autonomia: 10 },
    },
  ];

  const all: SeedEquipment[] = [...equipments, ...generateNetwork()];
  const seeded: SeededEquipment[] = [];
  let failureEvents = 0;

  for (const { type, responsible, attributes, ...e } of all) {
    // Histórico de falhas passadas: alimenta a camada de calor do mapa operacional.
    const pastFailures = Math.round((FAILURE_HOTSPOTS[e.district] ?? 0.3) * random() * 4);
    const history = Array.from({ length: pastFailures }, (_, i) => {
      const failedAt = daysFromNow(-(20 + i * 35 + Math.floor(random() * 20)));
      return [
        { kind: "STATUS_ALTERADO", fromStatus: "OPERACIONAL", toStatus: "MAU_FUNCIONAMENTO", note: pick(FAILURE_NOTES), createdAt: failedAt },
        { kind: "STATUS_ALTERADO", fromStatus: "MAU_FUNCIONAMENTO", toStatus: "OPERACIONAL", createdAt: new Date(failedAt.getTime() + 2 * DAY_MS) },
      ];
    }).flat();
    failureEvents += pastFailures;

    const lastSeenAt = lastSeenFor(e.status);
    const readings = lastSeenAt
      ? [0, 60, 120].map((offset) => ({
          metrics: JSON.stringify(sampleMetrics(type, random)),
          receivedAt: new Date(lastSeenAt.getTime() - offset * 1000),
        }))
      : [];

    const created = await prisma.equipment.create({
      data: {
        ...e,
        city: "Marília",
        state: "SP",
        typeId: typeIds[type],
        agency: agencyFor(type, attributes),
        lastSeenAt,
        readings: { create: readings },
        attributes: JSON.stringify(attributes),
        responsibleAgentId: responsible ? agentIds[responsible] : null,
        events: {
          create: [
            { kind: "CRIADO", toStatus: e.status, note: "Carga inicial do inventário", createdAt: daysFromNow(-200) },
            ...history,
          ],
        },
      },
    });
    seeded.push({ id: created.id, serialNumber: e.serialNumber, type, status: e.status, district: e.district });
  }

  const occurrences = await seedOccurrences(regionIds, seeded, now);
  const dailyMetrics = await seedTelemetryDaily(seeded, now);

  const activeAgents = Object.values(FIELD_STATUS_BY_AGENT).filter((s) => s !== "EM_PAUSA" && s !== "SEM_SINAL").length;
  const scopes: { regionId: string | null; code: string | null; items: SeedEquipment[] }[] = [
    { regionId: null, code: null, items: all },
    ...REGIONS.map((r) => ({
      regionId: regionIds[r.code],
      code: r.code,
      items: all.filter((e) => regionOfDistrict[e.district] === r.code),
    })),
  ];
  const snapshots = scopes.flatMap(({ regionId, code, items }) => {
    const total = items.length;
    const installed = items.filter((e) => e.status !== "NAO_INSTALADO" && e.status !== "BAIXADO").length;
    const unavailableNow = items.filter((e) => UNAVAILABLE.includes(e.status)).length;
    return Array.from({ length: AVAILABILITY_HISTORY_HOURS }, (_, h) => {
      // Oscilação ao longo do dia, com pico de indisponibilidade no fim da tarde
      const swing = Math.round((Math.sin((h / 24) * Math.PI * 2) + random() - 0.5) * Math.max(1, installed * 0.06));
      // A Zona Sul vem perdendo equipamentos ao longo da semana (tendência para as previsões)
      const decline = code === "SUL" ? Math.round(2 * (1 - h / AVAILABILITY_HISTORY_HOURS)) : 0;
      const unavailable = Math.min(installed, Math.max(0, unavailableNow + swing - decline));
      return {
        regionId,
        takenAt: new Date(now.getTime() - (AVAILABILITY_HISTORY_HOURS - h) * 60 * MINUTE_MS),
        total,
        installed,
        operational: installed - unavailable,
        unavailable,
        activeAgents: regionId ? 0 : activeAgents,
        openAlerts: Math.max(0, Math.round(unavailable * 0.8)),
      };
    });
  });
  await prisma.availabilitySnapshot.createMany({ data: snapshots });

  console.log(
    `Seed concluído: ${types.length} tipos, ${agents.length} agentes, ${all.length} equipamentos, ${failureEvents} falhas históricas, ${REGIONS.length} regiões, ${snapshots.length} registros de disponibilidade, ${occurrences} ocorrências em ${OCCURRENCE_HISTORY_DAYS} dias, ${dailyMetrics} resumos diários de telemetria.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
