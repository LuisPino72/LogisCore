const VENEZUELA_TZ = 'America/Caracas';

function getVzlaParts(date?: Date): { year: number; month: number; day: number } {
  const d = date ?? new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: VENEZUELA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(d);
  return {
    year: parseInt(parts.find((p) => p.type === 'year')!.value, 10),
    month: parseInt(parts.find((p) => p.type === 'month')!.value, 10),
    day: parseInt(parts.find((p) => p.type === 'day')!.value, 10),
  };
}

export function isSameDayVzla(d1: Date, d2: Date): boolean {
  const p1 = getVzlaParts(d1);
  const p2 = getVzlaParts(d2);
  return p1.year === p2.year && p1.month === p2.month && p1.day === p2.day;
}

export function startOfDayVzla(date?: Date): string {
  const p = getVzlaParts(date);
  const midnightUtc = Date.UTC(p.year, p.month - 1, p.day, 4, 0, 0, 0);
  return new Date(midnightUtc).toISOString();
}

export function endOfDayVzla(date?: Date): string {
  const p = getVzlaParts(date);
  const nextMidnightUtc = Date.UTC(p.year, p.month - 1, p.day + 1, 4, 0, 0, 0);
  return new Date(nextMidnightUtc - 1).toISOString();
}

export function startOfNextDayVzla(date?: Date): string {
  const p = getVzlaParts(date);
  const nextMidnightUtc = Date.UTC(p.year, p.month - 1, p.day + 1, 4, 0, 0, 0);
  return new Date(nextMidnightUtc).toISOString();
}

export function toDateStringVzla(date?: Date): string {
  const p = getVzlaParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Parse a "YYYY-MM-DD" string (Vzla date) → start of that day in Vzla as ISO UTC */
export function startOfDayFromDateStringVzla(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 4, 0, 0, 0)).toISOString();
}

/** Parse a "YYYY-MM-DD" string (Vzla date) → end of that day in Vzla (23:59:59.999) as ISO UTC */
export function endOfDayFromDateStringVzla(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, 3, 59, 59, 999)).toISOString();
}