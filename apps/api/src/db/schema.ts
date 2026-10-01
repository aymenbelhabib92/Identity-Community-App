import type {
  AnnouncementAudience,
  Language,
  MeetupVisibility,
  MemberStatus,
  PaymentKind,
  PaymentMethod,
  PaymentStatus,
  Role,
} from '@identity/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => timestamptz('created_at').notNull().defaultNow();
const updatedAt = () =>
  timestamptz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: text('full_name').notNull(),
  /** E.164, e.g. +21620123456. Used to sign in. */
  phone: text('phone').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  car: text('car'),
  /** Ids in `member_photos`, kept here so a member row is enough to describe them. */
  avatarPhotoId: uuid('avatar_photo_id'),
  carPhotoIds: jsonb('car_photo_ids').$type<string[]>().notNull().default([]),
  /** Preferred language (notifications are written in it); null until the app sets it. */
  language: text('language').$type<Language>(),
  /** Last authenticated request, refreshed at most once a minute. */
  lastSeenAt: timestamptz('last_seen_at'),
  role: text('role').$type<Role>().notNull().default('member'),
  status: text('status').$type<MemberStatus>().notNull().default('pending'),
  /** Assigned when the membership is first activated. */
  badgeNumber: integer('badge_number').unique(),
  /** Last day covered by verified dues. */
  paidUntil: date('paid_until', { mode: 'string' }),
  approvedAt: timestamptz('approved_at'),
  locationSharing: boolean('location_sharing').notNull().default(false),
  /** Incremented to revoke every token issued before. */
  tokenVersion: integer('token_version').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Profile photos (one per member) and car photos, stored through `Storage`. */
export const memberPhotos = pgTable(
  'member_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'avatar' | 'car'>().notNull(),
    file: text('file').notNull(),
    mime: text('mime').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('member_photos_user_idx').on(t.userId)],
);

/** Latest shared position per member, already snapped to the grid (LOCATION_PRECISION_METERS). */
export const memberLocations = pgTable('member_locations', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<PaymentKind>().notNull(),
    /** Millimes, fixed when the payment is submitted. */
    amount: integer('amount').notNull(),
    method: text('method').$type<PaymentMethod>().notNull(),
    status: text('status').$type<PaymentStatus>().notNull().default('pending'),
    /** Dues only: first period paid, how many periods, and the period length at the time. */
    periodStart: date('period_start', { mode: 'string' }),
    periodCount: integer('period_count'),
    periodMonths: integer('period_months'),
    proofFile: text('proof_file'),
    proofMime: text('proof_mime'),
    note: text('note'),
    reviewNote: text('review_note'),
    reviewedById: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamptz('reviewed_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('payments_user_idx').on(t.userId),
    index('payments_status_idx').on(t.status),
    // A member has at most one entry fee that is pending or verified.
    uniqueIndex('payments_entry_fee_once')
      .on(t.userId)
      .where(sql`${t.kind} = 'entry_fee' and ${t.status} <> 'rejected'`),
  ],
);

export const meetups = pgTable(
  'meetups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description'),
    visibility: text('visibility').$type<MeetupVisibility>().notNull(),
    startsAt: timestamptz('starts_at').notNull(),
    /** Secret meetups: hours before start when confirmed members see the meeting point. */
    revealHoursBefore: integer('reveal_hours_before').notNull().default(2),
    locationName: text('location_name'),
    address: text('address'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    rules: text('rules'),
    hostId: uuid('host_id').references(() => users.id, { onDelete: 'set null' }),
    cancelledAt: timestamptz('cancelled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('meetups_starts_at_idx').on(t.startsAt)],
);

export const meetupRsvps = pgTable(
  'meetup_rsvps',
  {
    meetupId: uuid('meetup_id')
      .notNull()
      .references(() => meetups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.meetupId, t.userId] }), index('meetup_rsvps_user_idx').on(t.userId)],
);

export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    audience: text('audience').$type<AnnouncementAudience>().notNull().default('all'),
    createdAt: createdAt(),
  },
  (t) => [index('announcements_created_at_idx').on(t.createdAt)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    link: text('link'),
    readAt: timestamptz('read_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

/** Key/value store for club settings (see `clubSettingsSchema`). */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: updatedAt(),
});

export type UserRow = typeof users.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type MeetupRow = typeof meetups.$inferSelect;
export type AnnouncementRow = typeof announcements.$inferSelect;
