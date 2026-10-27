/**
 * Preenchimento de demonstração: completa os períodos em que o sistema esteve desligado
 * (ex.: Docker parado durante a noite), como o simulador teria feito se estivesse rodando.
 *
 * - Disponibilidade: um registro por hora, interpolado entre o último valor antes da parada
 *   e o primeiro depois dela (ou repetindo o último, se a parada vai até agora).
 * - Ocorrências: sorteadas hora a hora pelo mesmo perfil da cidade usado pela seed e pelo simulador.
 *
 * Só acrescenta registros; nada é apagado. Usado apenas no ambiente de demonstração.
 * Uso: npm run backfill   (ou BACKFILL_ON_START=true no Docker)
 */
import { PrismaClient, type AvailabilitySnapshot, type Prisma } from "@prisma/client";
import { AGENTS_BY_SEVERITY, HANDLING_MINUTES, OCCURRENCE_KINDS } from "../src/domain/occurrences.js";
import { cityHour, cityWeekday } from "../src/domain/time.js";
import { DISTRICT_COORDS, OCCURRENCE_NOTES, expectedPerHour, pickSeverity, poisson } from "./city-profile.js";

const prisma = new PrismaClient();

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** Mesmo limite do gráfico: mais que isso sem registro é parada do sistema. */
const GAP_MS = 90 * MINUTE_MS;
/** Até onde olhar para trás: o histórico de disponibilidade usado pelos gráficos e tendências. */
const WINDOW_DAYS = 7;

interface Downtime {
  from: Date;
  to: Date;
}

const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

/** Paradas da cidade inteira: intervalos sem fotografia de disponibilidade, inclusive até agora. */
function findDowntimes(citySnapshots: AvailabilitySnapshot[], now: Date): Downtime[] {
  const downtimes: Downtime[] = [];
  for (let i = 1; i < citySnapshots.length; i++) {
    const from = citySnapshots[i - 1].takenAt;
    const to = citySnapshots[i].takenAt;
    if (to.getTime() - from.getTime() > GAP_MS) downtimes.push({ from, to });
  }
  const last = citySnapshots.at(-1);
  if (last && now.getTime() - last.takenAt.getTime() > GAP_MS) downtimes.push({ from: last.takenAt, to: now });
  return downtimes;
}

/** Registros de hora em hora dentro de cada parada, para a cidade e para cada região. */
async function backfillSnapshots(downtimes: Downtime[], since: Date) {
  const snapshots = await prisma.availabilitySnapshot.findMany({ where: { takenAt: { gte: since } }, orderBy: { takenAt: "asc" } });
  const scopes = [...new Set(snapshots.map((s) => s.regionId))];
  const rows: Prisma.AvailabilitySnapshotCreateManyInput[] = [];

  for (const scope of scopes) {
    const series = snapshots.filter((s) => s.regionId === scope);
    for (const { from, to } of downtimes) {
      const before = [...series].reverse().find((s) => s.takenAt <= from);
      const after = series.find((s) => s.takenAt >= to) ?? before;
      if (!before || !after) continue;
      for (let t = from.getTime() + HOUR_MS; t < to.getTime(); t += HOUR_MS) {
        const progress = (t - from.getTime()) / (to.getTime() - from.getTime());
        // Pequena oscilação para a linha não parecer régua: o normal da operação
        const swing = Math.random() < 0.3 ? (Math.random() < 0.5 ? -1 : 1) : 0;
        const installed = before.installed;
        const unavailable = Math.min(installed, Math.max(0, lerp(before.unavailable, after.unavailable, progress) + swing));
        rows.push({
          regionId: scope,
          takenAt: new Date(t),
          total: before.total,
          installed,
          operational: installed - unavailable,
          unavailable,
          activeAgents: lerp(before.activeAgents, after.activeAgents, progress),
          openAlerts: lerp(before.openAlerts, after.openAlerts, progress),
        });
      }
    }
  }
  if (rows.length) await prisma.availabilitySnapshot.createMany({ data: rows });
  return rows.length;
}

/** Ocorrências que teriam acontecido durante as paradas, pelo perfil da cidade. */
async function backfillOccurrences(downtimes: Downtime[], now: Date) {
  const regions = await prisma.region.findMany({ include: { districts: true } });
  const rows: Prisma.OccurrenceCreateManyInput[] = [];

  for (const { from, to } of downtimes) {
    for (let slot = Math.ceil(from.getTime() / HOUR_MS) * HOUR_MS; slot < to.getTime(); slot += HOUR_MS) {
      const at = new Date(slot);
      const daysAgo = Math.floor((now.getTime() - slot) / DAY_MS);
      for (const region of regions.filter((r) => r.districts.length)) {
        for (const kind of OCCURRENCE_KINDS) {
          const count = poisson(expectedPerHour(region.code, kind, cityHour(at), cityWeekday(at), daysAgo), Math.random);
          for (let i = 0; i < count; i++) {
            const occurredAt = new Date(slot + Math.random() * HOUR_MS);
            if (occurredAt >= to) continue;
            const district = pick(region.districts).name;
            const [lat, lng] = DISTRICT_COORDS[district] ?? [-22.2139, -49.9458];
            const severity = pickSeverity(kind, Math.random);
            rows.push({
              kind,
              severity,
              district,
              regionId: region.id,
              latitude: lat + (Math.random() - 0.5) * 0.01,
              longitude: lng + (Math.random() - 0.5) * 0.01,
              occurredAt,
              resolvedAt: new Date(occurredAt.getTime() + HANDLING_MINUTES[kind] * (0.5 + Math.random()) * MINUTE_MS),
              agentsDispatched: AGENTS_BY_SEVERITY[severity],
              note: pick(OCCURRENCE_NOTES[kind]),
            });
          }
        }
      }
    }
  }
  if (rows.length) await prisma.occurrence.createMany({ data: rows });
  return rows.length;
}

async function main() {
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
  const citySnapshots = await prisma.availabilitySnapshot.findMany({
    where: { regionId: null, takenAt: { gte: since } },
    orderBy: { takenAt: "asc" },
  });
  const downtimes = findDowntimes(citySnapshots, now);
  if (!downtimes.length) {
    console.log("Preenchimento: nenhum período sem dados nos últimos 7 dias.");
    return;
  }

  const snapshots = await backfillSnapshots(downtimes, since);
  const occurrences = await backfillOccurrences(downtimes, now);
  const hours = downtimes.reduce((sum, d) => sum + (d.to.getTime() - d.from.getTime()) / HOUR_MS, 0);
  console.log(
    `Preenchimento: ${downtimes.length} período(s) sem dados (${Math.round(hours)} h) completado(s) com ` +
      `${snapshots} registros de disponibilidade e ${occurrences} ocorrências.`,
  );
}

main()
  .catch((err) => {
    console.error("Falha no preenchimento:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
