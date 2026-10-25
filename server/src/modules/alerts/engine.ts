import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { AlertKind, AlertSeverity } from "../../domain/alerts.js";
import { summarizeAvailability } from "../../domain/availability.js";
import { UNSTABLE_WINDOW_MS } from "../../domain/connectivity.js";
import { findViolations, type TelemetryMetrics } from "../../domain/telemetry.js";
import { toEquipmentDto } from "../equipments/service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_WINDOW_DAYS = 7;
const ENGINE_INTERVAL_MS = 30 * 1000;

/** Abaixo destes percentuais de disponibilidade a região é considerada degradada. */
const REGION_DEGRADED_PCT = 80;
const REGION_CRITICAL_PCT = 60;
const REGION_MIN_INSTALLED = 3;

interface AlertCandidate {
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  message: string;
  equipmentId?: string;
  agentId?: string;
  regionId?: string;
}

const dedupKey = (c: AlertCandidate) => `${c.kind}:${c.equipmentId ?? c.agentId ?? c.regionId}`;

const minutesSince = (date: Date, now: Date) => Math.round((now.getTime() - date.getTime()) / 60000);

/** Aplica as regras sobre o estado atual da cidade e devolve os alertas que deveriam estar abertos. */
async function collectCandidates(now: Date): Promise<AlertCandidate[]> {
  const [equipments, agents, districts, recentReadings] = await Promise.all([
    prisma.equipment.findMany({ include: { type: true } }),
    prisma.agent.findMany({ where: { active: true } }),
    prisma.district.findMany({ include: { region: true } }),
    prisma.telemetryReading.findMany({
      where: { receivedAt: { gte: new Date(now.getTime() - UNSTABLE_WINDOW_MS) } },
      orderBy: { receivedAt: "desc" },
      select: { equipmentId: true, metrics: true },
    }),
  ]);
  const regionOf = new Map(districts.map((d) => [d.name, d.region]));
  // Leitura mais recente de cada dispositivo (a lista vem da mais nova para a mais antiga).
  const latestReading = new Map<string, TelemetryMetrics>();
  for (const r of recentReadings) {
    if (!latestReading.has(r.equipmentId)) latestReading.set(r.equipmentId, JSON.parse(r.metrics));
  }
  const dtos = equipments.map(toEquipmentDto);
  const candidates: AlertCandidate[] = [];

  for (const e of dtos) {
    const label = `${e.type.name} #${e.serialNumber}`;
    const where = `${e.street}, ${e.reference} · ${e.district}`;
    const base = { equipmentId: e.id, regionId: regionOf.get(e.district)?.id };

    if (e.status === "FURTADO") {
      candidates.push({ ...base, kind: "FURTO", severity: "CRITICA", title: `${label} furtado`, message: where });
      continue;
    }
    if (e.status === "MAU_FUNCIONAMENTO") {
      candidates.push({ ...base, kind: "FALHA_REPORTADA", severity: "ALTA", title: `Falha em ${label}`, message: where });
    }
    // Em manutenção é normal o dispositivo ficar desligado.
    if (e.connectivity === "OFFLINE" && e.status !== "EM_MANUTENCAO") {
      candidates.push({
        ...base,
        kind: "EQUIPAMENTO_OFFLINE",
        severity: "ALTA",
        title: `${label} sem comunicação`,
        message: `Sem telemetria há ${minutesSince(e.lastSeenAt!, now)} min · ${where}`,
      });
    }
    // Comunicando, mas com medições fora do esperado: o problema que só a telemetria revela.
    const violations = e.status === "OPERACIONAL" ? findViolations(latestReading.get(e.id) ?? {}) : [];
    if (violations.length) {
      candidates.push({
        ...base,
        kind: "LEITURA_ANOMALA",
        severity: "MEDIA",
        title: `Leitura anômala: ${label}`,
        message: `${violations.map((v) => `${v.label} ${v.value} (mín. ${v.min})`).join(", ")} · ${where}`,
      });
    }
    if (e.urgency === "INATIVO" || e.urgency === "PENDENTE" || !e.nextMaintenanceAt) continue;

    const daysLeft = Math.ceil((e.nextMaintenanceAt.getTime() - now.getTime()) / DAY_MS);
    if (daysLeft < 0) {
      candidates.push({
        ...base,
        kind: "MANUTENCAO_VENCIDA",
        severity: "MEDIA",
        title: `Manutenção vencida: ${label}`,
        message: `Vencida há ${-daysLeft} dia(s) · ${where}`,
      });
    } else if (daysLeft <= UPCOMING_WINDOW_DAYS && e.status === "OPERACIONAL") {
      candidates.push({
        ...base,
        kind: "MANUTENCAO_PROXIMA",
        severity: "BAIXA",
        title: `Manutenção próxima: ${label}`,
        message: `Prevista para ${daysLeft === 0 ? "hoje" : `daqui a ${daysLeft} dia(s)`} · ${where}`,
      });
    }
  }

  // Agentes em serviço sem enviar posição: possível problema com a equipe em campo.
  for (const a of agents) {
    if (a.fieldStatus === "EM_PAUSA") continue;
    const silent = !a.lastPositionAt || now.getTime() - a.lastPositionAt.getTime() > UNSTABLE_WINDOW_MS;
    if (a.fieldStatus !== "SEM_SINAL" && !silent) continue;
    candidates.push({
      kind: "AGENTE_SEM_SINAL",
      severity: "MEDIA",
      title: `${a.name} sem sinal`,
      message: a.lastPositionAt
        ? `Última posição há ${minutesSince(a.lastPositionAt, now)} min · base ${a.baseName}`
        : `Nenhuma posição recebida · base ${a.baseName}`,
      agentId: a.id,
      regionId: regionOf.get(a.district)?.id,
    });
  }

  // Regiões com disponibilidade abaixo do aceitável.
  const byRegion = new Map<string, { name: string; items: typeof dtos }>();
  for (const e of dtos) {
    const region = regionOf.get(e.district);
    if (!region) continue;
    if (!byRegion.has(region.id)) byRegion.set(region.id, { name: region.name, items: [] });
    byRegion.get(region.id)!.items.push(e);
  }
  for (const [regionId, { name, items }] of byRegion) {
    const summary = summarizeAvailability(items);
    if (summary.installed < REGION_MIN_INSTALLED || summary.availability >= REGION_DEGRADED_PCT) continue;
    candidates.push({
      kind: "REGIAO_DEGRADADA",
      severity: summary.availability < REGION_CRITICAL_PCT ? "CRITICA" : "ALTA",
      title: `${name} com disponibilidade de ${summary.availability}%`,
      message: `${summary.unavailable} de ${summary.installed} equipamentos instalados indisponíveis`,
      regionId,
    });
  }

  return candidates;
}

/**
 * Sincroniza os alertas com o estado atual: abre os novos, atualiza os que mudaram de gravidade
 * e resolve automaticamente aqueles cuja condição deixou de existir.
 */
export async function evaluateAlerts(now = new Date()) {
  const candidates = await collectCandidates(now);
  const open = await prisma.alert.findMany({ where: { status: { not: "RESOLVIDO" } } });
  const openByKey = new Map(open.map((a) => [a.dedupKey, a]));
  const wanted = new Set<string>();
  const operations: Prisma.PrismaPromise<unknown>[] = [];

  for (const candidate of candidates) {
    const key = dedupKey(candidate);
    wanted.add(key);
    const existing = openByKey.get(key);
    if (!existing) {
      operations.push(prisma.alert.create({ data: { ...candidate, dedupKey: key, openedAt: now } }));
    } else if (
      existing.severity !== candidate.severity ||
      existing.title !== candidate.title ||
      existing.message !== candidate.message
    ) {
      operations.push(
        prisma.alert.update({
          where: { id: existing.id },
          data: { severity: candidate.severity, title: candidate.title, message: candidate.message },
        }),
      );
    }
  }

  const cleared = open.filter((a) => !wanted.has(a.dedupKey)).map((a) => a.id);
  if (cleared.length) {
    operations.push(
      prisma.alert.updateMany({ where: { id: { in: cleared } }, data: { status: "RESOLVIDO", resolvedAt: now } }),
    );
  }

  await prisma.$transaction(operations);
}

// Uma avaliação por vez: duas rodando juntas poderiam abrir o mesmo alerta em dobro.
let running: Promise<void> | null = null;
let rerun = false;

/** Reavalia logo após uma mudança feita pelo operador, sem esperar o próximo ciclo. */
export function scheduleAlertEvaluation() {
  if (running) {
    rerun = true;
    return;
  }
  running = evaluateAlerts()
    .catch((err) => console.error("Falha ao avaliar alertas:", err))
    .finally(() => {
      running = null;
      if (rerun) {
        rerun = false;
        scheduleAlertEvaluation();
      }
    });
}

/** Reavalia as regras periodicamente: é assim que a falha silenciosa (equipamento offline) vira alerta. */
export function startAlertEngine() {
  scheduleAlertEvaluation();
  return setInterval(scheduleAlertEvaluation, ENGINE_INTERVAL_MS);
}
