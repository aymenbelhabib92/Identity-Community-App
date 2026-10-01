import { describe, expect, it } from 'vitest';
import { addDays, formatDayDateTime, formatIsoDate, formatRelative, todayIn } from './dates';
import { DEFAULT_CLUB_RULES } from './defaults';
import { approximateLocation, distanceMeters, LOCATION_PRECISION_METERS } from './geo';
import { pickLanguage, translate, translatePlural } from './i18n';
import { hasMemberAccess, membershipState } from './membership';
import { formatMoney, parseMoney } from './money';
import { formatPhone, initials, normalizePhone, shortName } from './people';
import { addPeriods, nextDuesPeriodStart, periodEnd, periodLabel, periodStartOf } from './periods';
import { can, isStaff } from './roles';
import { DEFAULT_CLUB_SETTINGS, resolveClubSettings } from './settings';

describe('periods', () => {
  it('aligns quarters on the calendar', () => {
    expect(periodStartOf('2026-09-28', 3)).toBe('2026-07-01');
    expect(periodStartOf('2026-10-01', 3)).toBe('2026-10-01');
    expect(periodEnd('2026-10-01', 3)).toBe('2026-12-31');
    expect(periodEnd('2026-10-01', 3, 4)).toBe('2027-09-30');
    expect(addPeriods('2026-10-01', 3, 1)).toBe('2027-01-01');
  });

  it('labels periods for every supported length', () => {
    expect(periodLabel('2026-10-01', 3)).toBe('Q4 2026');
    expect(periodLabel('2026-10-01', 3, 4)).toBe('Q4 2026 – Q3 2027');
    expect(periodLabel('2026-07-01', 6)).toBe('H2 2026');
    expect(periodLabel('2026-01-01', 12)).toBe('2026');
    expect(periodLabel('2026-10-01', 1)).toBe('Oct 2026');
    expect(periodLabel('2026-05-01', 4)).toBe('May–Aug 2026');
  });

  it('picks the next period to pay', () => {
    // Nothing paid yet → current quarter.
    expect(nextDuesPeriodStart(null, '2026-09-28', 3)).toBe('2026-07-01');
    // Q3 covered → Q4.
    expect(nextDuesPeriodStart('2026-09-30', '2026-09-28', 3)).toBe('2026-10-01');
    // Paid ahead through Q4 → Q1 next year.
    expect(nextDuesPeriodStart('2026-12-31', '2026-09-28', 3)).toBe('2027-01-01');
    // Lapsed since March → current quarter, missed ones are not charged.
    expect(nextDuesPeriodStart('2026-03-31', '2026-09-28', 3)).toBe('2026-07-01');
  });
});

describe('membership state', () => {
  const base = { status: 'active' as const, graceDays: 15, today: '2026-10-10' };

  it('is active while dues cover today', () => {
    expect(membershipState({ ...base, paidUntil: '2026-12-31' })).toBe('active');
  });

  it('is due during the grace period, then expired', () => {
    expect(membershipState({ ...base, paidUntil: '2026-09-30' })).toBe('due');
    expect(membershipState({ ...base, paidUntil: '2026-09-30', today: '2026-10-16' })).toBe('expired');
  });

  it('keeps stored statuses other than active', () => {
    expect(membershipState({ ...base, status: 'pending', paidUntil: null })).toBe('pending');
    expect(membershipState({ ...base, status: 'suspended', paidUntil: '2026-12-31' })).toBe('suspended');
  });

  it('grants access to paying members and staff, never to suspended accounts', () => {
    expect(hasMemberAccess('active', 'member')).toBe(true);
    expect(hasMemberAccess('due', 'member')).toBe(true);
    expect(hasMemberAccess('expired', 'member')).toBe(false);
    expect(hasMemberAccess('pending', 'member')).toBe(false);
    expect(hasMemberAccess('expired', 'organizer')).toBe(true);
    expect(hasMemberAccess('suspended', 'admin')).toBe(false);
  });
});

describe('roles', () => {
  it('checks permissions per role', () => {
    expect(can('treasurer', 'payments:review')).toBe(true);
    expect(can('organizer', 'payments:review')).toBe(false);
    expect(can('organizer', 'meetups:create')).toBe(true);
    expect(can('member', 'meetups:create')).toBe(false);
    expect(isStaff('member')).toBe(false);
    expect(isStaff('treasurer')).toBe(true);
  });
});

describe('people', () => {
  it('normalises Tunisian and international numbers', () => {
    expect(normalizePhone('20 123 456')).toBe('+21620123456');
    expect(normalizePhone('+216 20-123-456')).toBe('+21620123456');
    expect(normalizePhone('0021620123456')).toBe('+21620123456');
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('+33612345678');
    expect(normalizePhone('+216 20 123')).toBeNull();
    expect(normalizePhone('hello')).toBeNull();
    expect(formatPhone('+21620123456')).toBe('+216 20 123 456');
  });

  it('derives initials and short names', () => {
    expect(initials('Karim Ben Salah')).toBe('KB');
    expect(shortName('Karim Ben Salah')).toBe('Karim B.');
    expect(shortName('Karim')).toBe('Karim');
  });
});

describe('money', () => {
  it('formats and parses millimes', () => {
    expect(formatMoney(20_000)).toBe('20 DT');
    expect(formatMoney(7_500)).toBe('7.500 DT');
    expect(parseMoney('7,5')).toBe(7_500);
    expect(parseMoney('20')).toBe(20_000);
    expect(parseMoney('abc')).toBeNull();
  });
});

describe('dates', () => {
  it('formats in a given time zone', () => {
    const start = new Date('2026-10-03T21:00:00Z'); // 22:00 in Tunis (UTC+1)
    expect(formatDayDateTime(start, 'Africa/Tunis')).toBe('Sat 03 Oct · 22:00');
    expect(todayIn('Africa/Tunis', new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(formatIsoDate('2026-12-31')).toBe('31 Dec 2026');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('formats relative times', () => {
    const now = new Date('2026-09-28T18:00:00');
    expect(formatRelative(new Date('2026-09-28T16:00:00'), now)).toBe('2h');
    expect(formatRelative(new Date('2026-09-27T12:00:00'), now)).toBe('Yesterday');
    expect(formatRelative(new Date('2026-09-28T17:59:30'), now)).toBe('now');
  });
});

describe('geo', () => {
  it('snaps positions within the advertised precision and keeps them stable', () => {
    const home = { lat: 36.8412, lng: 10.2311 };
    const approx = approximateLocation(home);
    expect(distanceMeters(home, approx)).toBeLessThan(LOCATION_PRECISION_METERS);
    // Snapping is idempotent, and moving around inside the cell does not move the published point.
    expect(approximateLocation(approx)).toEqual(approx);
    expect(approximateLocation({ lat: approx.lat + 0.0003, lng: approx.lng - 0.0003 })).toEqual(approx);
    // The next cell is a different published point.
    expect(approximateLocation({ lat: approx.lat + 0.001, lng: approx.lng })).not.toEqual(approx);
  });
});

describe('translations', () => {
  it('falls back to English and fills placeholders', () => {
    expect(translate('en', 'Up to {max} periods can be paid at once.', { max: 4 })).toBe('Up to 4 periods can be paid at once.');
    expect(translate('fr', 'Up to {max} periods can be paid at once.', { max: 4 })).toBe(
      "Jusqu'à 4 périodes peuvent être payées en une fois.",
    );
    expect(translate('fr', 'A text nobody translated')).toBe('A text nobody translated');
  });

  it('counts the French way: zero is singular', () => {
    expect(translatePlural('en', 0, '{count} member', '{count} members')).toBe('0 members');
    expect(translatePlural('fr', 0, '{count} member', '{count} members')).toBe('0 member');
    expect(translatePlural('fr', 2, '{count} member', '{count} members')).toBe('2 members');
  });

  it('reads the language of a browser or an Accept-Language header', () => {
    expect(pickLanguage('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
    expect(pickLanguage('en-GB')).toBe('en');
    expect(pickLanguage('ar-TN')).toBeNull();
    expect(pickLanguage(undefined)).toBeNull();
  });

  it('formats dates and dues periods in French', () => {
    expect(formatIsoDate('2026-12-31', 'fr')).toBe('31 déc. 2026');
    expect(formatDayDateTime('2026-10-03T21:00:00Z', 'Africa/Tunis', 'fr')).toBe('sam. 03 oct. · 22:00');
    expect(periodLabel('2026-10-01', 3, 4, 'fr')).toBe('T4 2026 – T3 2027');
    expect(periodLabel('2026-07-01', 6, 1, 'fr')).toBe('S2 2026');
    expect(formatRelative(new Date('2026-09-28T17:55:00'), new Date('2026-09-28T18:00:00'), 'fr')).toBe('5 min');
  });

  it('translates the default club texts as a whole', () => {
    expect(translate('fr', DEFAULT_CLUB_RULES)).toContain('# Le respect avant tout');
    expect(translate('fr', DEFAULT_CLUB_RULES).split('\n')).toHaveLength(DEFAULT_CLUB_RULES.split('\n').length);
  });
});

describe('settings', () => {
  it('falls back to defaults for missing or invalid values', () => {
    const settings = resolveClubSettings({ entryFee: 25_000, duesPeriodMonths: 5, unknown: true });
    expect(settings.entryFee).toBe(25_000);
    expect(settings.duesPeriodMonths).toBe(DEFAULT_CLUB_SETTINGS.duesPeriodMonths);
    expect(settings).not.toHaveProperty('unknown');
  });
});
