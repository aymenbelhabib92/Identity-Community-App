import { calendarTile, formatTime, type Meetup } from '@identity/shared';
import { ChevronRight, Clock, Lock, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { locationSummary } from '../../lib/meetups';
import { Card } from '../../components/ui';
import s from './home.module.css';

const ICON = { locked: Lock, place: MapPin, none: Clock };

export function NextMeetupCard({ meetup }: { meetup: Meetup }) {
  const tile = calendarTile(meetup.startsAt);
  const where = locationSummary(meetup);
  const Icon = ICON[where.kind];
  return (
    <Card>
      <Link to={`/meetups/${meetup.id}`} className={s.meetupCard}>
        <div className={s.dateTile} aria-hidden>
          <span className={s.weekday}>{tile.weekday}</span>
          <span className={s.day}>{tile.day}</span>
        </div>
        <div className={s.meetupBody}>
          <p className={s.meetupTitle}>{meetup.title}</p>
          <p className={s.meetupMeta}>
            <Icon aria-hidden />
            <span>
              {where.text} · {formatTime(meetup.startsAt)}
            </span>
          </p>
        </div>
        <ChevronRight className={s.chevron} aria-hidden />
      </Link>
    </Card>
  );
}
