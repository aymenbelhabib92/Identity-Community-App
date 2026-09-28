import { formatDayDateTime, type Meetup } from '@identity/shared';
import { Check, Lock, MapPin, Users } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '../../components/ui';
import { cx } from '../../lib/cx';
import { VISIBILITY_TONE, visibilityLabel } from '../../lib/format';
import s from './meetups.module.css';

export function VisibilityBadge({ meetup }: { meetup: Pick<Meetup, 'visibility'> }) {
  return (
    <Badge
      tone={VISIBILITY_TONE[meetup.visibility]}
      icon={meetup.visibility === 'secret' ? <Lock aria-hidden strokeWidth={2.6} /> : undefined}
    >
      {visibilityLabel(meetup.visibility)}
    </Badge>
  );
}

function Summary({ meetup }: { meetup: Meetup }) {
  if (meetup.visibility === 'staff') return <p className={s.text}>Visible to Organizer role and above</p>;
  if (meetup.locationStatus === 'visible') {
    return (
      <p className={s.place}>
        <MapPin aria-hidden />
        {meetup.location?.name || meetup.location?.address || 'Meeting point on the map'}
      </p>
    );
  }
  if (meetup.locationStatus === 'not_set') {
    return (
      <p className={s.place}>
        <MapPin aria-hidden />
        Meeting point to be announced
      </p>
    );
  }
  const hours = meetup.revealHoursBefore;
  return (
    <p className={s.text}>
      Meeting point revealed to confirmed members {hours} hour{hours === 1 ? '' : 's'} before start.
    </p>
  );
}

export function MeetupCard({ meetup }: { meetup: Meetup }) {
  const cancelled = meetup.status === 'cancelled';
  const past = meetup.status === 'past';
  const showFooter = !cancelled && (meetup.goingCount > 0 || meetup.going || meetup.canRsvp);

  return (
    <Link to={`/meetups/${meetup.id}`} className={cx(s.card, cancelled && s.cancelled)}>
      <div className={s.cardHead}>
        <div className={s.badges}>
          <VisibilityBadge meetup={meetup} />
          {cancelled && <Badge tone="gray">Cancelled</Badge>}
        </div>
        <span className={s.when}>{formatDayDateTime(meetup.startsAt)}</span>
      </div>
      <h2 className={s.title}>{meetup.title}</h2>
      <Summary meetup={meetup} />
      {showFooter && (
        <div className={s.footer}>
          <span className={s.going}>
            {meetup.goingCount > 0 && (
              <>
                <Users aria-hidden />
                {meetup.goingCount} {past ? 'went' : 'going'}
              </>
            )}
          </span>
          {meetup.going ? (
            <span className={s.rsvpDone}>
              <Check aria-hidden strokeWidth={3} />
              Going
            </span>
          ) : (
            meetup.canRsvp && <span className={s.rsvp}>RSVP</span>
          )}
        </div>
      )}
    </Link>
  );
}
