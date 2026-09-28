/**
 * Demo data matching the app mockups: Karim (#0042), Sami the organizer, a
 * secret night meet next Saturday, announcements, payments to review and
 * members on the map. Every demo account uses the password `demo1234`.
 *
 *   npm run db:seed            load the demo into an empty database
 *   npm run db:seed -- --reset wipe everything first (never in production)
 */
import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  addDays,
  approximateLocation,
  DEFAULT_CLUB_SETTINGS,
  parseIsoDate,
  todayIn,
  type MeetupVisibility,
  type Role,
} from '@identity/shared';
import { sql } from 'drizzle-orm';
import { loadConfig, loadEnvFile } from '../config';
import { hashPassword } from '../lib/password';
import { openDatabase } from './client';
import {
  announcements,
  meetupRsvps,
  meetups,
  memberLocations,
  notifications,
  payments,
  settings,
  users,
} from './schema';

loadEnvFile();
const config = loadConfig();
const reset = process.argv.includes('--reset');

if (config.env === 'production' && !process.argv.includes('--force')) {
  console.error('Refusing to load demo data in production (add --force if you really mean it).');
  process.exit(1);
}

const database = await openDatabase(config);
const { db } = database;

const [{ count } = { count: 0 }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
if (Number(count) > 0 && !reset) {
  console.log('The database already has data. Run `npm run db:seed -- --reset` to wipe it and load the demo.');
  await database.close();
  process.exit(0);
}

if (reset) {
  await db.execute(
    sql`truncate table notifications, meetup_rsvps, meetups, announcements, payments, member_locations, settings, users cascade`,
  );
  await rm(path.join(config.uploadDir, 'proofs'), { recursive: true, force: true });
}

// ─── Time helpers (Tunis, UTC+1 all year) ────────────────────────────────────

const now = new Date();
const today = todayIn(config.timezone, now);
const at = (date: string, time: string) => new Date(`${date}T${time}:00+01:00`);
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
const weekday = (date: string) => {
  const { y, m, d } = parseIsoDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const nextSaturday = addDays(today, ((6 - weekday(today) + 7) % 7) || 7);

// ─── Settings ────────────────────────────────────────────────────────────────

await db.insert(settings).values({
  key: 'club',
  value: {
    ...DEFAULT_CLUB_SETTINGS,
    paymentInstructions:
      'D17 or bank transfer to the club treasurer, then upload the receipt here.\n' +
      'Cash is fine too: hand it to Leila (treasurer) at any meetup.\n' +
      '(Demo text: edit it in Admin › Club settings.)',
  },
});

// ─── Members ─────────────────────────────────────────────────────────────────

const passwordHash = await hashPassword('demo1234');

interface DemoMember {
  key: string;
  fullName: string;
  phone: string;
  car: string;
  role?: Role;
  status?: 'active' | 'pending';
  badge?: number;
  paidUntil?: string;
  approvedAt?: string;
  at?: [number, number];
}

const people: DemoMember[] = [
  { key: 'mehdi', fullName: 'Mehdi Trabelsi', phone: '+21620000001', car: 'BMW M3 E46, 2004', role: 'admin', badge: 1, paidUntil: '2026-12-31', approvedAt: '2024-03-01' },
  { key: 'leila', fullName: 'Leila Tounsi', phone: '+21620000003', car: 'Mini Cooper S, 2019', role: 'treasurer', badge: 3, paidUntil: '2026-12-31', approvedAt: '2024-03-01', at: [36.853, 10.323] },
  { key: 'sami', fullName: 'Sami Kacem', phone: '+21620000007', car: 'VW Golf 7 R, 2017', role: 'organizer', badge: 7, paidUntil: '2026-12-31', approvedAt: '2024-04-12', at: [36.8785, 10.3245] },
  { key: 'karim', fullName: 'Karim Ben Salah', phone: '+21620000042', car: 'Seat Leon Cupra, 2018', badge: 42, paidUntil: '2026-09-30', approvedAt: '2025-11-15' },
  { key: 'yasmine', fullName: 'Yasmine Mansour', phone: '+21620000015', car: 'Audi S3, 2020', badge: 15, paidUntil: '2026-12-31', approvedAt: '2024-09-02', at: [36.8335, 10.2355] },
  { key: 'nour', fullName: 'Nour Riahi', phone: '+21620000023', car: 'Toyota GR86, 2023', badge: 23, paidUntil: '2026-12-31', approvedAt: '2025-01-20', at: [36.8425, 10.1805] },
  { key: 'ahmed', fullName: 'Ahmed Hammami', phone: '+21620000031', car: 'Honda Civic Type R, 2019', badge: 31, paidUntil: '2026-12-31', approvedAt: '2025-04-03', at: [36.8205, 10.2025] },
  { key: 'omar', fullName: 'Omar Jaziri', phone: '+21620000036', car: 'Peugeot 208 GTi, 2016', badge: 36, paidUntil: '2026-12-31', approvedAt: '2025-06-10', at: [36.8481, 10.2702] },
  { key: 'rania', fullName: 'Rania Ben Ali', phone: '+21620000037', car: 'Fiat 500 Abarth, 2018', badge: 37, paidUntil: '2026-12-31', approvedAt: '2025-06-10', at: [36.8492, 10.2731] },
  { key: 'fares', fullName: 'Fares Dridi', phone: '+21620000038', car: 'Renault Clio RS, 2015', badge: 38, paidUntil: '2026-12-31', approvedAt: '2025-07-01', at: [36.8468, 10.2688] },
  { key: 'ines', fullName: 'Ines Gharbi', phone: '+21620000039', car: 'Mercedes A45 AMG, 2021', badge: 39, paidUntil: '2026-12-31', approvedAt: '2025-07-01', at: [36.8503, 10.2749] },
  { key: 'youssef', fullName: 'Youssef Mejri', phone: '+21620000040', car: 'Subaru WRX STI, 2014', badge: 40, paidUntil: '2026-12-31', approvedAt: '2025-08-19', at: [36.8459, 10.2722] },
  { key: 'hedi', fullName: 'Hedi Karray', phone: '+21620000041', car: 'Ford Focus RS, 2017', badge: 41, paidUntil: '2026-12-31', approvedAt: '2025-09-05', at: [36.8475, 10.2758] },
  { key: 'bilel', fullName: 'Bilel Sassi', phone: '+21620000028', car: 'Opel Astra OPC, 2013', badge: 28, paidUntil: '2026-03-31', approvedAt: '2025-02-14' },
  { key: 'walid', fullName: 'Walid Zouari', phone: '+21620000099', car: 'Kia Stinger GT, 2020', status: 'pending' },
  { key: 'salma', fullName: 'Salma Ferchichi', phone: '+21620000098', car: 'Hyundai i30 N, 2022', status: 'pending' },
];

const inserted = await db
  .insert(users)
  .values(
    people.map((p) => ({
      fullName: p.fullName,
      phone: p.phone,
      passwordHash,
      car: p.car,
      role: p.role ?? 'member',
      status: p.status ?? 'active',
      badgeNumber: p.badge ?? null,
      paidUntil: p.paidUntil ?? null,
      approvedAt: p.approvedAt ? at(p.approvedAt, '19:00') : null,
      locationSharing: Boolean(p.at),
      createdAt: p.approvedAt ? at(addDays(p.approvedAt, -5), '12:00') : hoursAgo(p.key === 'walid' ? 30 : 5),
    })),
  )
  .returning({ id: users.id, phone: users.phone });

const id = Object.fromEntries(people.map((p) => [p.key, inserted.find((u) => u.phone === p.phone)!.id])) as Record<
  string,
  string
>;

await db.insert(memberLocations).values(
  people
    .filter((p) => p.at)
    .map((p, index) => ({
      userId: id[p.key]!,
      ...approximateLocation({ lat: p.at![0], lng: p.at![1] }),
      updatedAt: hoursAgo(0.1 + index * 0.4),
    })),
);

// ─── Payments ────────────────────────────────────────────────────────────────

const proofSource = path.resolve('src/db/seed-assets/demo-proof.png');
async function demoProof(): Promise<string> {
  const key = `proofs/${crypto.randomUUID()}`;
  await mkdir(path.join(config.uploadDir, 'proofs'), { recursive: true });
  await copyFile(proofSource, path.join(config.uploadDir, key));
  return key;
}

const verified = (reviewer: string, date: string) => ({
  status: 'verified' as const,
  reviewedById: id[reviewer]!,
  reviewedAt: at(date, '20:30'),
});

const entryFee = { kind: 'entry_fee' as const, amount: 20_000 };
const dues = (periodStart: string, periodCount = 1) => ({
  kind: 'dues' as const,
  amount: 5_000 * periodCount,
  periodStart,
  periodCount,
  periodMonths: 3,
});

await db.insert(payments).values([
  // Karim, as on the Membership screen.
  { userId: id.karim!, ...entryFee, method: 'proof', proofFile: await demoProof(), proofMime: 'image/png', ...verified('leila', '2025-11-15'), createdAt: at('2025-11-12', '21:10') },
  { userId: id.karim!, ...dues('2026-07-01'), method: 'in_person', note: 'Paid at Coffee & Cars', ...verified('leila', '2026-07-05'), createdAt: at('2026-07-05', '10:15') },
  { userId: id.karim!, ...dues('2026-10-01'), method: 'proof', proofFile: await demoProof(), proofMime: 'image/png', note: 'D17 transfer', status: 'pending', createdAt: hoursAgo(20) },
  // A membership request waiting for the treasurer.
  { userId: id.walid!, ...entryFee, method: 'proof', proofFile: await demoProof(), proofMime: 'image/png', status: 'pending', createdAt: hoursAgo(26) },
  // History for the others.
  ...['yasmine', 'nour', 'ahmed', 'omar', 'rania', 'fares', 'ines', 'youssef', 'hedi', 'bilel'].map((key) => ({
    userId: id[key]!,
    ...entryFee,
    method: 'in_person' as const,
    ...verified('leila', people.find((p) => p.key === key)!.approvedAt!),
    createdAt: at(people.find((p) => p.key === key)!.approvedAt!, '18:00'),
  })),
  ...['yasmine', 'nour', 'ahmed', 'omar', 'rania', 'fares', 'ines', 'youssef', 'hedi'].map((key) => ({
    userId: id[key]!,
    ...dues('2026-07-01', 2),
    method: 'in_person' as const,
    ...verified('leila', '2026-07-05'),
    createdAt: at('2026-07-05', '11:00'),
  })),
]);

// ─── Meetups ─────────────────────────────────────────────────────────────────

interface DemoMeetup {
  title: string;
  visibility: MeetupVisibility;
  startsAt: Date;
  host: string;
  locationName?: string;
  address?: string;
  point?: [number, number];
  description?: string;
  going: string[];
}

const demoMeetups: DemoMeetup[] = [
  {
    title: 'Secret Night Meet',
    visibility: 'secret',
    startsAt: at(nextSaturday, '22:00'),
    host: 'sami',
    locationName: 'Les Berges du Lac 2',
    address: 'Lac 2, Tunis',
    point: [36.8487, 10.2715],
    description: 'Night photo session, then a slow cruise along the lake. Clean cars, low revs, no show-off.',
    going: ['sami', 'yasmine', 'nour', 'ahmed', 'omar', 'rania', 'fares', 'ines', 'youssef', 'hedi', 'leila', 'mehdi'],
  },
  {
    title: 'Coffee & Cars',
    visibility: 'public',
    startsAt: at(addDays(nextSaturday, 8), '09:30'),
    host: 'sami',
    locationName: 'Sidi Bou Said, upper parking',
    address: 'Sidi Bou Said',
    point: [36.8687, 10.3417],
    description: 'Sunday coffee, cars lined up, newcomers welcome. Bring your badge for check-in.',
    going: ['yasmine', 'ahmed'],
  },
  {
    title: 'Organizer briefing',
    visibility: 'staff',
    startsAt: at(addDays(nextSaturday, 11), '20:00'),
    host: 'mehdi',
    locationName: 'Online call',
    going: ['sami', 'leila'],
  },
  {
    title: 'Summer Night Cruise',
    visibility: 'public',
    startsAt: at('2026-08-22', '21:30'),
    host: 'sami',
    locationName: 'Gammarth corniche',
    point: [36.9185, 10.2878],
    going: ['karim', 'yasmine', 'nour', 'ahmed', 'omar', 'rania', 'fares', 'hedi'],
  },
];

for (const m of demoMeetups) {
  const [row] = await db
    .insert(meetups)
    .values({
      title: m.title,
      visibility: m.visibility,
      startsAt: m.startsAt,
      revealHoursBefore: 2,
      hostId: id[m.host]!,
      locationName: m.locationName ?? null,
      address: m.address ?? null,
      lat: m.point?.[0] ?? null,
      lng: m.point?.[1] ?? null,
      description: m.description ?? null,
      rules: DEFAULT_CLUB_SETTINGS.meetRules,
      createdAt: hoursAgo(72),
    })
    .returning({ id: meetups.id });
  if (m.going.length) {
    await db.insert(meetupRsvps).values(m.going.map((key) => ({ meetupId: row!.id, userId: id[key]! })));
  }
}

// ─── Announcements & notifications ───────────────────────────────────────────

await db.insert(announcements).values([
  { authorId: id.leila!, body: 'Thanks to everyone who paid Q3 dues on time. You keep the club running!', createdAt: hoursAgo(24 * 9) },
  { authorId: id.mehdi!, body: 'Q4 dues are open: 5 DT, proof upload or in person.', createdAt: hoursAgo(26) },
  { authorId: id.sami!, body: "New members: bring your badge to Saturday's meet for check-in.", createdAt: hoursAgo(2) },
]);

await db.insert(notifications).values([
  { userId: id.karim!, kind: 'payment', title: 'Payment verified', body: 'Q3 2026 dues · valid until 30 Sep 2026', link: '/pass', readAt: hoursAgo(24 * 80), createdAt: at('2026-07-05', '20:30') },
  { userId: id.karim!, kind: 'meetup', title: 'New meetup: Secret Night Meet', body: 'Meeting point revealed 2h before the start', link: '/meetups', createdAt: hoursAgo(72) },
  { userId: id.karim!, kind: 'announcement', title: 'Announcement from the organizers', body: "New members: bring your badge to Saturday's meet for check-in.", link: '/home', createdAt: hoursAgo(2) },
  { userId: id.leila!, kind: 'payment_review', title: 'Payment proof to review', body: 'Karim B. · Q4 2026 dues · 5 DT', link: '/admin/payments', createdAt: hoursAgo(20) },
  { userId: id.leila!, kind: 'membership', title: 'New membership request', body: 'Walid Zouari · +216 20 000 099', link: `/admin/members/${id.walid}`, createdAt: hoursAgo(30) },
  { userId: id.mehdi!, kind: 'membership', title: 'New membership request', body: 'Walid Zouari · +216 20 000 099', link: `/admin/members/${id.walid}`, createdAt: hoursAgo(30) },
]);

await database.close();

console.log(`
Demo data loaded (${database.kind}). Password for every account: demo1234

  Member      Karim Ben Salah   20 000 042
  Organizer   Sami Kacem        20 000 007
  Treasurer   Leila Tounsi      20 000 003
  Admin       Mehdi Trabelsi    20 000 001
  Pending     Walid Zouari      20 000 099
`);
