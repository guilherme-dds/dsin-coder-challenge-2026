export const CITY_UTC_OFFSET_MS = -3 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const toCity = (date: Date) => new Date(date.getTime() + CITY_UTC_OFFSET_MS);

export const cityHour = (date: Date) => toCity(date).getUTCHours();

export const cityWeekday = (date: Date) => toCity(date).getUTCDay();

export function cityDayStart(date: Date) {
  const local = toCity(date);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
      CITY_UTC_OFFSET_MS,
  );
}

export function cityTime(now: Date, daysAgo: number, hour: number, minute = 0) {
  return new Date(
    cityDayStart(now).getTime() -
      daysAgo * DAY_MS +
      hour * HOUR_MS +
      minute * 60 * 1000,
  );
}

export const WEEKDAY_LABELS = [
  "Dom",
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
] as const;
