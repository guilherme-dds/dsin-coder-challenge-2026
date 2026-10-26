import {
  sampleMetrics,
  type TelemetryMetrics,
} from "../src/domain/telemetry.js";
import {
  HANDLING_MINUTES,
  OCCURRENCE_KINDS,
  type OccurrenceKind,
} from "../src/domain/occurrences.js";
import { cityHour, cityWeekday } from "../src/domain/time.js";
import {
  DISTRICT_COORDS,
  OCCURRENCE_NOTES,
  applyDegradation,
  expectedPerHour,
  pickSeverity,
  weekdayFlowFactor,
} from "./city-profile.js";

const API_URL = process.env.API_URL ?? "http://localhost:3333";
const TICK_MS = Number(process.env.TICK_MS ?? 10_000);
const REFRESH_MS = 60_000;
const MINUTE_MS = 60_000;

const SILENCE_MS: [number, number] = [12 * MINUTE_MS, 20 * MINUTE_MS];
const ANOMALY_MS: [number, number] = [4 * MINUTE_MS, 8 * MINUTE_MS];
const MAX_INCIDENTS = 2;

const INCIDENT_CHANCE = Number(process.env.INCIDENT_CHANCE ?? 0.04);

const OCCURRENCE_RATE = Number(process.env.OCCURRENCE_RATE ?? 1);
const FLOW_METRICS = [
  "veiculosHora",
  "aberturasHora",
  "transacoesHora",
  "pesagensHora",
];

const ANOMALIES: Record<string, TelemetryMetrics> = {
  CAMERA: { fps: 3 },
  TOTEM_ESTACIONAMENTO: { papelPct: 4 },
  PATINETE: { bateriaPct: 6 },
};

const TRANSMITTING = ["OPERACIONAL", "MAU_FUNCIONAMENTO"];
const MOVING_STATUSES = ["DISPONIVEL", "EM_ATENDIMENTO", "EM_DESLOCAMENTO"];

interface MapEquipment {
  id: string;
  serialNumber: string;
  status: string;
  connectivity: string;
  type: { code: string; name: string };
}

interface MapAgent {
  id: string;
  name: string;
  active: boolean;
  fieldStatus: string;
  latitude: number;
  longitude: number;
}

interface Region {
  code: string;
  name: string;
  districts: string[];
}

interface OpenOccurrence {
  id: string;
  resolveAt: number;
}

interface Incident {
  kind: "silence" | "anomaly" | "agent";
  targetId: string;
  until: number;
}

let equipments: MapEquipment[] = [];
let agents: MapAgent[] = [];
let lastRefresh = 0;
let apiDown = false;
let incidents: Incident[] = [];
let regions: Region[] = [];
let openOccurrences: OpenOccurrence[] = [];

const PERMANENTLY_SILENT = 3;
let deadOnArrival: Set<string> | null = null;
const heading = new Map<string, number>();

const between = ([min, max]: [number, number]) =>
  min + Math.random() * (max - min);
const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const clock = () => new Date().toLocaleTimeString("pt-BR");

async function api<T>(
  path: string,
  init?: { method: string; body: unknown },
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: init ? JSON.stringify(init.body) : undefined,
  });
  if (!response.ok)
    throw new Error(
      `${init?.method ?? "GET"} ${path}: HTTP ${response.status}`,
    );
  return (await response.json()) as T;
}

async function refresh() {
  const data = await api<{ equipments: MapEquipment[]; agents: MapAgent[] }>(
    "/api/map",
  );
  equipments = data.equipments;
  agents = data.agents;
  regions = (await api<Region[]>("/api/regions")).filter(
    (r) => r.districts.length > 0,
  );
  lastRefresh = Date.now();
  if (!deadOnArrival) {
    const offline = equipments.filter((e) => e.connectivity === "OFFLINE");
    const pool = offline.length
      ? offline
      : equipments.filter((e) => e.status === "OPERACIONAL");
    const silent = shuffle(pool).slice(0, PERMANENTLY_SILENT);
    deadOnArrival = new Set(silent.map((e) => e.id));
    for (const e of silent)
      console.log(
        `[${clock()}] sem comunicação permanente: ${e.type.name} #${e.serialNumber}`,
      );
  }
}

function shuffle<T>(items: T[]) {
  return items
    .map((item) => ({ item, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

const isIncident = (kind: Incident["kind"], id: string) =>
  incidents.some((i) => i.kind === kind && i.targetId === id);

function maybeStartIncident() {
  if (incidents.length >= MAX_INCIDENTS || Math.random() > INCIDENT_CHANCE)
    return;
  const busy = new Set(incidents.map((i) => i.targetId));
  const healthy = equipments.filter(
    (e) =>
      e.status === "OPERACIONAL" &&
      !busy.has(e.id) &&
      !deadOnArrival?.has(e.id),
  );
  const roll = Math.random();

  if (roll < 0.45 && healthy.length) {
    const target = pick(healthy);
    incidents.push({
      kind: "silence",
      targetId: target.id,
      until: Date.now() + between(SILENCE_MS),
    });
    console.log(
      `[${clock()}] incidente: ${target.type.name} #${target.serialNumber} parou de responder`,
    );
  } else if (roll < 0.8) {
    const candidates = healthy.filter((e) => ANOMALIES[e.type.code]);
    if (!candidates.length) return;
    const target = pick(candidates);
    incidents.push({
      kind: "anomaly",
      targetId: target.id,
      until: Date.now() + between(ANOMALY_MS),
    });
    console.log(
      `[${clock()}] incidente: leitura anômala em ${target.type.name} #${target.serialNumber}`,
    );
  } else {
    const candidates = agents.filter(
      (a) =>
        a.active && MOVING_STATUSES.includes(a.fieldStatus) && !busy.has(a.id),
    );
    if (!candidates.length) return;
    const target = pick(candidates);
    incidents.push({
      kind: "agent",
      targetId: target.id,
      until: Date.now() + between(SILENCE_MS),
    });
    console.log(`[${clock()}] incidente: ${target.name} perdeu o sinal`);
  }
}

function endIncidents() {
  const now = Date.now();
  for (const incident of incidents.filter((i) => i.until <= now)) {
    console.log(
      `[${clock()}] incidente encerrado (${incident.kind}): ${incident.targetId}`,
    );
  }
  incidents = incidents.filter((i) => i.until > now);
}

function liveMetrics(e: MapEquipment): TelemetryMetrics {
  const flow = weekdayFlowFactor(cityWeekday(new Date()));
  const sample = sampleMetrics(e.type.code);
  for (const metric of FLOW_METRICS)
    if (sample[metric] !== undefined)
      sample[metric] = Math.round(sample[metric] * flow);
  return applyDegradation(e.serialNumber, sample, 0);
}

async function sendOccurrences() {
  const now = new Date();
  for (const open of openOccurrences.filter(
    (o) => o.resolveAt <= now.getTime(),
  )) {
    await api(`/api/occurrences/${open.id}/resolve`, {
      method: "POST",
      body: {},
    }).catch(() => undefined);
  }
  openOccurrences = openOccurrences.filter((o) => o.resolveAt > now.getTime());

  const hour = cityHour(now);
  const weekday = cityWeekday(now);
  for (const region of regions) {
    for (const kind of OCCURRENCE_KINDS) {
      const chance =
        expectedPerHour(region.code, kind, hour, weekday, 0) *
        (TICK_MS / (60 * MINUTE_MS)) *
        OCCURRENCE_RATE;
      if (Math.random() >= chance) continue;
      await reportOccurrence(region, kind);
    }
  }
}

async function reportOccurrence(region: Region, kind: OccurrenceKind) {
  const district = pick(region.districts);
  const [lat, lng] = DISTRICT_COORDS[district] ?? [-22.2139, -49.9458];
  const severity = pickSeverity(kind, Math.random);
  const created = await api<{ id: string }>("/api/occurrences", {
    method: "POST",
    body: {
      kind,
      severity,
      district,
      latitude: lat + (Math.random() - 0.5) * 0.01,
      longitude: lng + (Math.random() - 0.5) * 0.01,
      note: pick(OCCURRENCE_NOTES[kind]),
    },
  });
  openOccurrences.push({
    id: created.id,
    resolveAt:
      Date.now() + HANDLING_MINUTES[kind] * (0.5 + Math.random()) * MINUTE_MS,
  });
  console.log(
    `[${clock()}] ocorrência: ${kind} (${severity.toLowerCase()}) em ${district} · ${region.name}`,
  );
}

async function sendTelemetry() {
  const readings = equipments
    .filter((e) => TRANSMITTING.includes(e.status))
    .filter((e) => !deadOnArrival?.has(e.id) && !isIncident("silence", e.id))
    .filter((e) => e.status === "OPERACIONAL" || Math.random() < 0.5)
    .map((e) => ({
      serialNumber: e.serialNumber,
      metrics: {
        ...liveMetrics(e),
        ...(isIncident("anomaly", e.id) ? ANOMALIES[e.type.code] : {}),
      },
    }));
  if (readings.length)
    await api("/api/telemetry", { method: "POST", body: readings });
}

function walk(agent: MapAgent) {
  const current = heading.get(agent.id) ?? Math.random() * Math.PI * 2;
  const next = current + (Math.random() - 0.5) * 0.8;
  heading.set(agent.id, next);
  const step = agent.fieldStatus === "EM_DESLOCAMENTO" ? 0.0006 : 0.00025;
  agent.latitude += Math.sin(next) * step;
  agent.longitude += Math.cos(next) * step;
}

async function sendPositions() {
  for (const agent of agents) {
    if (
      !agent.active ||
      agent.fieldStatus === "SEM_SINAL" ||
      isIncident("agent", agent.id)
    )
      continue;

    let fieldStatus: string | undefined;
    if (MOVING_STATUSES.includes(agent.fieldStatus)) {
      walk(agent);
      if (Math.random() < 0.02)
        fieldStatus = agent.fieldStatus = pick(MOVING_STATUSES);
    }
    await api(`/api/agents/${agent.id}/position`, {
      method: "POST",
      body: {
        latitude: agent.latitude,
        longitude: agent.longitude,
        fieldStatus,
      },
    });
  }
}

async function tick() {
  try {
    if (Date.now() - lastRefresh > REFRESH_MS) await refresh();
    endIncidents();
    maybeStartIncident();
    await sendTelemetry();
    await sendPositions();
    await sendOccurrences();
    if (apiDown) console.log(`[${clock()}] API disponível novamente`);
    apiDown = false;
  } catch (err) {
    if (!apiDown)
      console.log(
        `[${clock()}] aguardando a API em ${API_URL} (${(err as Error).message})`,
      );
    apiDown = true;
    lastRefresh = 0;
  }
}

console.log(
  `🛰️  Simulador do F.O.G.O. enviando dados para ${API_URL} a cada ${TICK_MS / 1000}s`,
);
await tick();
setInterval(tick, TICK_MS);
