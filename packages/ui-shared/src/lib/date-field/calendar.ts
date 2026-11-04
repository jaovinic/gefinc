/** Utilidades de calendário sobre datas ISO ("AAAA-MM-DD"), sempre em UTC para não depender do fuso do aparelho. */

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export function pad(value: number, size = 2): string {
  return String(value).padStart(size, '0');
}

export function toIso(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Decompõe uma data ISO; devolve `null` quando não é uma data real (ex.: 2026-02-29). */
export function parseIso(iso: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? { year, month, day }
    : null;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Dia da semana de uma data ISO válida: 0 = domingo. */
export function weekdayOf(iso: string): number {
  const d = parseIso(iso);
  return d ? new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() : 0;
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  if (!d) {
    return iso;
  }
  const date = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return toIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Soma meses mantendo o dia; se o mês de destino é mais curto, usa o último dia dele. */
export function addMonths(iso: string, months: number): string {
  const d = parseIso(iso);
  if (!d) {
    return iso;
  }
  const first = new Date(Date.UTC(d.year, d.month - 1 + months, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth() + 1;
  return toIso(year, month, Math.min(d.day, daysInMonth(year, month)));
}

/** Semanas do mês (domingo a sábado); os dias fora do mês vêm como `null`. */
export function monthWeeks(year: number, month: number): (string | null)[][] {
  const lead = weekdayOf(toIso(year, month, 1));
  const total = daysInMonth(year, month);
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => toIso(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}
