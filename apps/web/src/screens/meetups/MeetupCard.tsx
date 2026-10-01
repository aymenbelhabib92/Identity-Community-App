import { formatDayDateTime, t, tn, type Meetup } from '@identity/shared';
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
  if (meetup.visibility === 'staff') return <p className={s.text}>{t('Visible to Organizer role and above')}</p>;
  if (meetup.locationStatus === 'visible') {
    return (
      <p className={s.place}>
        <MapPin aria-hidden />
        {meetup.location?.name || meetup.location?.address || t('Meeting point on the map')}
      </p>
    );
  }
  if (meetup.locationStatus === 'not_set') {
    return (
      <p className={s.place}>
        <MapPin aria-hidden />
        {t('Meeting point to be announced')}
      </p>
    );
  }
  return (
    <p className={s.text}>
      {tn(
        meetup.revealHoursBefore,
        'Meeting point revealed to confirmed members {count} hour before start.',
        'Meeting point revealed to confirmed members {count} hours before start.',
      )}
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
          {cancelled && <Badge tone="gray">{t('Cancelled')}</Badge>}
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
                {past ? t('{count} went', { count: meetup.goingCount }) : t('{count} going', { count: meetup.goingCount })}
              </>
            )}
          </span>
          {meetup.going ? (
            <span className={s.rsvpDone}>
              <Check aria-hidden strokeWidth={3} />
              {t("You're going")}
            </span>
          ) : (
            meetup.canRsvp && <span className={s.rsvp}>{t('RSVP')}</span>
          )}
        </div>
      )}
    </Link>
  );
}
