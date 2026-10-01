import { t, type Meetup } from '@identity/shared';

export type LocationSummary = { kind: 'locked' | 'place' | 'none'; text: string };

/** One-line summary of where a meetup happens, as far as this member may know. */
export function locationSummary(meetup: Meetup): LocationSummary {
  switch (meetup.locationStatus) {
    case 'locked':
      return { kind: 'locked', text: t('Location revealed {hours}h before', { hours: meetup.revealHoursBefore }) };
    case 'rsvp_required':
      return { kind: 'locked', text: t('Confirm you are going to see the spot') };
    case 'visible':
      return { kind: 'place', text: meetup.location?.name || meetup.location?.address || t('Meeting point on the map') };
    case 'not_set':
      return { kind: 'none', text: t('Meeting point to be announced') };
  }
}

/** Upcoming or ongoing, not cancelled. */
export const isActiveMeetup = (meetup: Meetup) => meetup.status === 'upcoming' || meetup.status === 'ongoing';
