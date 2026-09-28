import type { Meetup } from '@identity/shared';

export type LocationSummary = { kind: 'locked' | 'place' | 'none'; text: string };

/** One-line summary of where a meetup happens, as far as this member may know. */
export function locationSummary(meetup: Meetup): LocationSummary {
  switch (meetup.locationStatus) {
    case 'locked':
      return { kind: 'locked', text: `Location revealed ${meetup.revealHoursBefore}h before` };
    case 'rsvp_required':
      return { kind: 'locked', text: 'Confirm you are going to see the spot' };
    case 'visible':
      return { kind: 'place', text: meetup.location?.name || meetup.location?.address || 'Meeting point on the map' };
    case 'not_set':
      return { kind: 'none', text: 'Meeting point to be announced' };
  }
}

/** Upcoming or ongoing, not cancelled. */
export const isActiveMeetup = (meetup: Meetup) => meetup.status === 'upcoming' || meetup.status === 'ongoing';
