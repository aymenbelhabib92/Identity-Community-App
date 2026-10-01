import { getLanguage, translate, type Language } from './i18n';

/** Calendar date without time zone, `YYYY-MM-DD`. */
export type IsoDate = string;

const MONTHS: Record<Language, readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
};
const WEEKDAYS: Record<Language, readonly string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  fr: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
};

/** "Oct" / "oct." for month 1–12. Like every formatter here, `lang` defaults to the app-wide language. */
export function monthShort(month: number, lang: Language = getLanguage()): string {
  return MONTHS[lang][month - 1]!;
}

function weekdayShort(weekday: number, lang: Language): string {
  return WEEKDAYS[lang][weekday]!;
}

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
export function formatDayDate(date: Date | string, timeZone?: string, lang: Language = getLanguage()): string {
  const p = zonedParts(new Date(date), timeZone);
  return `${weekdayShort(p.weekday, lang)} ${pad2(p.d)} ${monthShort(p.m, lang)}`;
}

/** "22:00" */
export function formatTime(date: Date | string, timeZone?: string): string {
  const p = zonedParts(new Date(date), timeZone);
  return `${pad2(p.hh)}:${pad2(p.mm)}`;
}

/** "Sat 03 Oct · 22:00" */
export function formatDayDateTime(date: Date | string, timeZone?: string, lang: Language = getLanguage()): string {
  return `${formatDayDate(date, timeZone, lang)} · ${formatTime(date, timeZone)}`;
}

/** "SAT" / "03" pieces for calendar tiles. */
export function calendarTile(
  date: Date | string,
  timeZone?: string,
  lang: Language = getLanguage(),
): { weekday: string; day: string; month: string } {
  const p = zonedParts(new Date(date), timeZone);
  const tile = (name: string) => name.replace('.', '').toUpperCase();
  return { weekday: tile(weekdayShort(p.weekday, lang)), day: pad2(p.d), month: tile(monthShort(p.m, lang)) };
}

/** "31 Dec 2026" from a calendar date. */
export function formatIsoDate(date: IsoDate, lang: Language = getLanguage()): string {
  const { y, m, d } = parseIsoDate(date);
  return `${pad2(d)} ${monthShort(m, lang)} ${y}`;
}

/** Compact relative time used in feeds: "now", "5m", "2h", "Yesterday", "3d", "12 Sep". */
export function formatRelative(date: Date | string, now: Date = new Date(), lang: Language = getLanguage()): string {
  const then = new Date(date);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return translate(lang, 'now');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return translate(lang, '{count}m', { count: minutes });
  const hours = Math.floor(minutes / 60);
  const a = zonedParts(then);
  const b = zonedParts(now);
  const dayDiff = Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
  if (dayDiff === 0) return translate(lang, '{count}h', { count: hours });
  if (dayDiff === 1) return translate(lang, 'Yesterday');
  if (dayDiff < 7) return translate(lang, '{count}d', { count: dayDiff });
  const dayMonth = `${pad2(a.d)} ${monthShort(a.m, lang)}`;
  return a.y === b.y ? dayMonth : `${dayMonth} ${a.y}`;
}

/** Whether `date` is within the last minute ("now" in feeds). */
export function isJustNow(date: Date | string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(date).getTime() < 60_000;
}
