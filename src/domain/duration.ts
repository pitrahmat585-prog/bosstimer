import { DateTime } from 'luxon';

const DAY_ALIASES: Record<string, number> = {
  '0': 0,
  '7': 0,
  sun: 0,
  sunday: 0,
  min: 0,
  minggu: 0,
  ahad: 0,
  '1': 1,
  mon: 1,
  monday: 1,
  sen: 1,
  senin: 1,
  '2': 2,
  tue: 2,
  tues: 2,
  tuesday: 2,
  sel: 2,
  selasa: 2,
  '3': 3,
  wed: 3,
  wednesday: 3,
  rab: 3,
  rabu: 3,
  '4': 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  kam: 4,
  kamis: 4,
  '5': 5,
  fri: 5,
  friday: 5,
  jum: 5,
  jumat: 5,
  "jum'at": 5,
  '6': 6,
  sat: 6,
  saturday: 6,
  sab: 6,
  sabtu: 6,
};

const DAY_LABELS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const UNIT_MULTIPLIERS: Record<string, number> = {
  d: 1440,
  day: 1440,
  days: 1440,
  hari: 1440,
  h: 60,
  hr: 60,
  hrs: 60,
  j: 60,
  jam: 60,
  m: 1,
  min: 1,
  mins: 1,
  menit: 1,
};

/**
 * Parses duration strings such as "90", "90m", "2h", "1h30m", "2j15m", "1d 4h", "1.5h".
 * Returns total minutes (integer >= 1) or null if invalid.
 */
export function parseDurationMinutes(input: string, allowZero = false): number | null {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;

  // Bare number -> interpreted as minutes
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    const mins = Math.round(Number.parseFloat(normalized));
    if (!Number.isFinite(mins)) return null;
    if (allowZero ? mins >= 0 : mins >= 1) return mins;
    return null;
  }

  const tokenRegex = /(\d+(?:\.\d+)?)\s*([a-z]+)/g;
  let totalMinutes = 0;
  let matchedNoSpace = '';
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(normalized)) !== null) {
    const numStr = match[1];
    const unit = match[2];
    if (!numStr || !unit) continue;

    const multiplier = UNIT_MULTIPLIERS[unit];
    if (multiplier === undefined) return null;

    const value = Number.parseFloat(numStr);
    if (!Number.isFinite(value)) return null;

    totalMinutes += value * multiplier;
    matchedNoSpace += `${numStr}${unit}`;
  }

  const stripped = normalized.replace(/\s+/g, '');
  if (!matchedNoSpace || matchedNoSpace !== stripped) {
    return null;
  }

  const rounded = Math.round(totalMinutes);
  if (allowZero ? rounded >= 0 : rounded >= 1) {
    return rounded;
  }
  return null;
}

export function formatDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0m';
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins = Math.round(totalMinutes % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  return parts.join(' ') || '0m';
}

export function parseTimeOfDay(raw: string): { hour: number; minute: number; formatted: string } | null {
  const cleaned = raw.trim().replace('.', ':');
  const match = /^(\d{1,2}):(\d{2})$/.exec(cleaned);
  if (!match) return null;

  const hour = Number.parseInt(match[1] ?? '', 10);
  const minute = Number.parseInt(match[2] ?? '', 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  const formatted = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { hour, minute, formatted };
}

export function parseScheduleTimes(raw: string): string[] | null {
  const parts = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;

  const seen = new Set<string>();
  for (const part of parts) {
    const parsed = parseTimeOfDay(part);
    if (!parsed) return null;
    seen.add(parsed.formatted);
  }

  return Array.from(seen).sort();
}

export function parseScheduleDays(raw: string): number[] | null {
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return null;

  if (['daily', 'everyday', 'all', '*', 'harian', 'setiap hari', 'tiap hari'].includes(cleaned)) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  if (['weekdays', 'weekday', 'kerja', 'senin-jumat'].includes(cleaned)) {
    return [1, 2, 3, 4, 5];
  }
  if (['weekend', 'weekends', 'akhir pekan'].includes(cleaned)) {
    return [0, 6];
  }

  const tokens = cleaned
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) return null;

  const days = new Set<number>();
  for (const token of tokens) {
    const dayNum = DAY_ALIASES[token];
    if (dayNum === undefined) return null;
    days.add(dayNum);
  }

  return Array.from(days).sort((a, b) => a - b);
}

export function parseEveryNDays(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase();
  if (
    cleaned === 'every other day' ||
    cleaned === '2 hari sekali' ||
    cleaned === '2hari' ||
    cleaned === '2days' ||
    cleaned === '2d'
  ) {
    return 2;
  }
  const match =
    /^(?:every\s+)?(\d+)\s*(?:days?|hari)(?:\s+sekali)?$/.exec(cleaned);
  if (!match) return null;
  const n = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(n) && n >= 2 && n <= 30 ? n : null;
}

export function formatScheduleDays(days: number[]): string {
  const unique = Array.from(new Set(days)).sort((a, b) => a - b);
  if (unique.length === 7) return 'Setiap Hari';
  if (unique.length === 5 && unique.join(',') === '1,2,3,4,5') return 'Sen-Jum';
  if (unique.length === 2 && unique.join(',') === '0,6') return 'Akhir Pekan';
  return unique.map((d) => DAY_LABELS_ID[d] ?? String(d)).join(', ');
}

export function parseLeadMinutes(raw: string): number[] | null {
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return null;
  if (['none', 'off', '0', '-', 'tidak'].includes(cleaned)) {
    return [];
  }

  const parts = cleaned
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const values = new Set<number>();
  for (const part of parts) {
    const parsed = parseDurationMinutes(part, false);
    if (parsed === null || parsed > 1440) return null;
    values.add(parsed);
  }

  return Array.from(values).sort((a, b) => b - a);
}

/**
 * Resolves a "HH:mm" kill time string in the guild's timezone to epoch milliseconds.
 * If the clock time is later than the current time of day, assumes it happened yesterday.
 */
export function resolveRecentTimeInZone(
  timeStr: string,
  timezone: string,
  nowMs: number = Date.now(),
): number | null {
  const parsed = parseTimeOfDay(timeStr);
  if (!parsed) return null;

  const nowDt = DateTime.fromMillis(nowMs, { zone: timezone });
  if (!nowDt.isValid) return null;

  let candidate = nowDt.set({
    hour: parsed.hour,
    minute: parsed.minute,
    second: 0,
    millisecond: 0,
  });

  if (candidate.toMillis() > nowMs) {
    candidate = candidate.minus({ days: 1 });
  }

  return candidate.toMillis();
}

export function isValidTimezone(tz: string): boolean {
  return DateTime.now().setZone(tz).isValid;
}
