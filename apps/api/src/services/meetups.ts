import {
  can,
  isStaff,
  MEETUP_ONGOING_HOURS,
  type LocationStatus,
  type Meetup,
  type MeetupStatus,
  type MeetupVisibility,
} from '@identity/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { meetupRsvps, meetups, users, type MeetupRow } from '../db/schema';
import type { Viewer } from '../types';
import { memberRefColumns, toMemberRef, type AudienceMember } from './users';

const HOUR = 3_600_000;

/**
 * - public:  every signed-in member, including pending requests
 * - secret:  members with access (active, or dues within the grace period)
 * - staff:   organizer role and above
 */
export function visibleVisibilities(viewer: Pick<Viewer, 'hasAccess' | 'role'>): MeetupVisibility[] {
  const visibilities: MeetupVisibility[] = ['public'];
  if (viewer.hasAccess) visibilities.push('secret');
  if (viewer.hasAccess && isStaff(viewer.role)) visibilities.push('staff');
  return visibilities;
}

/** Who gets notified about a meetup with this visibility. */
export function audienceFor(visibility: MeetupVisibility): (member: AudienceMember) => boolean {
  switch (visibility) {
    case 'public':
      return () => true;
    case 'secret':
      return (member) => member.hasAccess;
    case 'staff':
      return (member) => member.hasAccess && isStaff(member.role);
  }
}

export function meetupStatus(row: Pick<MeetupRow, 'cancelledAt' | 'startsAt'>, now: Date): MeetupStatus {
  if (row.cancelledAt) return 'cancelled';
  const start = row.startsAt.getTime();
  if (now.getTime() < start) return 'upcoming';
  if (now.getTime() < start + MEETUP_ONGOING_HOURS * HOUR) return 'ongoing';
  return 'past';
}

export function revealAt(row: Pick<MeetupRow, 'startsAt' | 'revealHoursBefore'>): Date {
  return new Date(row.startsAt.getTime() - row.revealHoursBefore * HOUR);
}

/**
 * The meeting point of a secret meetup is only sent to staff, the host, and —
 * from the reveal time — members who confirmed they are going.
 */
export function locationStatus(row: MeetupRow, viewer: Viewer, going: boolean): LocationStatus {
  const hasLocation = row.lat !== null || !!row.locationName || !!row.address;
  if (!hasLocation) return 'not_set';
  if (row.visibility !== 'secret') return 'visible';
  if (isStaff(viewer.role) || row.hostId === viewer.id) return 'visible';
  if (viewer.now < revealAt(row)) return 'locked';
  return going ? 'visible' : 'rsvp_required';
}

export function canEditMeetup(row: MeetupRow, viewer: Viewer): boolean {
  if (!viewer.hasAccess) return false;
  if (row.hostId === viewer.id && can(viewer.role, 'meetups:create')) return true;
  return can(viewer.role, 'meetups:manage-any');
}

export function canSeeMeetup(row: MeetupRow, viewer: Viewer): boolean {
  return visibleVisibilities(viewer).includes(row.visibility);
}

/** Visibility filter for queries. */
export function visibleToViewer(viewer: Viewer) {
  return inArray(meetups.visibility, visibleVisibilities(viewer));
}

export async function toMeetupDtos(db: DbOrTx, viewer: Viewer, rows: MeetupRow[]): Promise<Meetup[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const hostIds = [...new Set(rows.map((row) => row.hostId).filter((id): id is string => id !== null))];

  const [counts, mine, hosts] = await Promise.all([
    db
      .select({ meetupId: meetupRsvps.meetupId, count: sql<number>`count(*)::int` })
      .from(meetupRsvps)
      .where(inArray(meetupRsvps.meetupId, ids))
      .groupBy(meetupRsvps.meetupId),
    db
      .select({ meetupId: meetupRsvps.meetupId })
      .from(meetupRsvps)
      .where(and(eq(meetupRsvps.userId, viewer.id), inArray(meetupRsvps.meetupId, ids))),
    hostIds.length
      ? db.select(memberRefColumns(users)).from(users).where(inArray(users.id, hostIds))
      : Promise.resolve([]),
  ]);

  const countBy = new Map(counts.map((row) => [row.meetupId, Number(row.count)]));
  const going = new Set(mine.map((row) => row.meetupId));
  const hostBy = new Map(hosts.map((host) => [host.id, host]));

  return rows.map((row) => {
    const isGoing = going.has(row.id);
    const status = meetupStatus(row, viewer.now);
    const location = locationStatus(row, viewer, isGoing);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      visibility: row.visibility,
      status,
      startsAt: row.startsAt.toISOString(),
      revealAt: revealAt(row).toISOString(),
      revealHoursBefore: row.revealHoursBefore,
      location:
        location === 'visible' ? { name: row.locationName, address: row.address, lat: row.lat, lng: row.lng } : null,
      locationStatus: location,
      rules: row.rules,
      host: toMemberRef(row.hostId ? hostBy.get(row.hostId) : null, viewer.now),
      goingCount: countBy.get(row.id) ?? 0,
      going: isGoing,
      canEdit: canEditMeetup(row, viewer),
      canRsvp: (status === 'upcoming' || status === 'ongoing') && (row.visibility === 'public' || viewer.hasAccess),
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function toMeetupDto(db: DbOrTx, viewer: Viewer, row: MeetupRow): Promise<Meetup> {
  const [dto] = await toMeetupDtos(db, viewer, [row]);
  return dto!;
}
