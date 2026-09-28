/** Calendar date without time zone, `YYYY-MM-DD`. */
export type IsoDate = string;

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(date: IsoDate): { y: number; m: number; d: number } {
  const match = ISO_DATE_RE.exec(date);
  if (!match) throw new Error(`Invalid ISO date: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function toIsoDate(y: number, m: number, d: number): IsoDate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const { y, m, d } = parseIsoDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return toIsoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function maxIsoDate(a: IsoDate | null, b: IsoDate | null): IsoDate | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

interface ZonedParts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  weekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Calendar parts of an instant, in `timeZone` (device zone when omitted). */
export function zonedParts(date: Date, timeZone?: string): ZonedParts {
  const key = timeZone ?? '';
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });
    formatters.set(key, fmt);
  }
  const parts: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) parts[part.type] = part.value;
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  return {
    y,
    m,
    d,
    hh: Number(parts.hour) % 24,
    mm: Number(parts.minute),
    weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay(),
  };
}

/** Today's calendar date in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  const p = zonedParts(now, timeZone);
  return toIsoDate(p.y, p.m, p.d);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "Sat 03 Oct" */
export function formatDayDate(date: Date | string, timeZone?: string): string {
  const p = zonedParts(new Date(date), timeZone);
  return `${WEEKDAYS_SHORT[p.weekday]} ${pad2(p.d)} ${MONTHS_SHORT[p.m - 1]}`;
}

/** "22:00" */
export function formatTime(date: Date | string, timeZone?: string): string {
  const p = zonedParts(new Date(date), timeZone);
  return `${pad2(p.hh)}:${pad2(p.mm)}`;
}

/** "Sat 03 Oct · 22:00" */
export function formatDayDateTime(date: Date | string, timeZone?: string): string {
  return `${formatDayDate(date, timeZone)} · ${formatTime(date, timeZone)}`;
}

/** "SAT" / "03" pieces for calendar tiles. */
export function calendarTile(date: Date | string, timeZone?: string): { weekday: string; day: string; month: string } {
  const p = zonedParts(new Date(date), timeZone);
  return {
    weekday: WEEKDAYS_SHORT[p.weekday]!.toUpperCase(),
    day: pad2(p.d),
    month: MONTHS_SHORT[p.m - 1]!.toUpperCase(),
  };
}

/** "31 Dec 2026" from a calendar date. */
export function formatIsoDate(date: IsoDate): string {
  const { y, m, d } = parseIsoDate(date);
  return `${pad2(d)} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** Compact relative time used in feeds: "now", "5m", "2h", "Yesterday", "3d", "12 Sep". */
export function formatRelative(date: Date | string, now: Date = new Date()): string {
  const then = new Date(date);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const a = zonedParts(then);
  const b = zonedParts(now);
  const dayDiff = Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
  if (dayDiff === 0) return `${hours}h`;
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return `${dayDiff}d`;
  return a.y === b.y ? `${pad2(a.d)} ${MONTHS_SHORT[a.m - 1]}` : `${pad2(a.d)} ${MONTHS_SHORT[a.m - 1]} ${a.y}`;
}
