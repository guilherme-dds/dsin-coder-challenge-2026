/**
 * Horário da cidade. Marília segue o horário de Brasília (UTC−3, sem horário de verão desde 2019).
 * Padrões de "hora do dia" e "dia da semana" precisam ser calculados no horário local, e não no
 * fuso do servidor (o container roda em UTC).
 */
export const CITY_UTC_OFFSET_MS = -3 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const toCity = (date: Date) => new Date(date.getTime() + CITY_UTC_OFFSET_MS);

/** Hora local (0–23). */
export const cityHour = (date: Date) => toCity(date).getUTCHours();

/** Dia da semana local (0 = domingo … 6 = sábado). */
export const cityWeekday = (date: Date) => toCity(date).getUTCDay();

/** Início (00:00 local) do dia que contém a data, como instante UTC. */
export function cityDayStart(date: Date) {
  const local = toCity(date);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - CITY_UTC_OFFSET_MS);
}

/** Instante UTC de um dia/hora locais: `daysAgo` dias antes de hoje, na hora `hour`. */
export function cityTime(now: Date, daysAgo: number, hour: number, minute = 0) {
  return new Date(cityDayStart(now).getTime() - daysAgo * DAY_MS + hour * HOUR_MS + minute * 60 * 1000);
}

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
