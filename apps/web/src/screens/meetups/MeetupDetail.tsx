import {
  directionsUrl,
  formatBadgeNumber,
  formatDayDate,
  formatTime,
  isStaff,
  MEETUP_AUDIENCE_LABELS,
  ROLE_LABELS,
  shortName,
  type Meetup,
} from '@identity/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Check, CircleUser, Clock, Lock, MapPin, Pencil, Users } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useParams } from 'react-router';
import { Shards } from '../../components/brand/Shards';
import {
  Avatar,
  BackLink,
  Button,
  ButtonLink,
  Card,
  ErrorState,
  List,
  ListRow,
  Loading,
  Notice,
  Screen,
  SectionFooter,
  Sheet,
  Spinner,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useUser } from '../../lib/auth';
import { keys, useMeetup } from '../../lib/queries';
import s from './meetups.module.css';

const MiniMap = lazy(() => import('../../components/map/MiniMap'));

export default function MeetupDetail() {
  const { id = '' } = useParams();
  const { data: meetup, isPending, error, refetch } = useMeetup(id);

  return (
    <Screen>
      <BackLink to="/meetups">Meetups</BackLink>
      {isPending ? <Loading /> : error ? <ErrorState error={error} onRetry={() => void refetch()} /> : <Detail meetup={meetup} />}
    </Screen>
  );
}

function Detail({ meetup }: { meetup: Meetup }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showAttendees, setShowAttendees] = useState(false);
  const staff = user.hasAccess && isStaff(user.role);
  const canSeeAttendees = staff || meetup.host?.id === user.id;

  const rsvp = useMutation({
    mutationFn: (going: boolean) => (going ? api.meetups.rsvp(meetup.id) : api.meetups.cancelRsvp(meetup.id)),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.meetup(meetup.id), updated);
      void queryClient.invalidateQueries({ queryKey: keys.meetups });
      void queryClient.invalidateQueries({ queryKey: keys.mapMeetups });
      setConfirmCancel(false);
      toast(updated.going ? "You're going. See you there!" : 'RSVP cancelled', 'success');
    },
    onError: (err) => toast(err.message, 'error'),
  });

  const location = meetup.location;
  const hasCoordinates = location?.lat != null && location.lng != null;
  const pointValue = {
    visible: location?.name || location?.address || 'On the map',
    locked: 'Hidden',
    rsvp_required: 'Confirm to unlock',
    not_set: 'To be announced',
  }[meetup.locationStatus];

  return (
    <>
      <Hero meetup={meetup} />

      <h1 className={s.detailTitle}>{meetup.title}</h1>
      <p className={s.host}>
        {meetup.host ? `Hosted by ${shortName(meetup.host.fullName)} · ${ROLE_LABELS[meetup.host.role]}` : 'Identity meetup'}
      </p>

      <div className={s.blocks}>
        {meetup.status === 'cancelled' && (
          <Notice tone="red" icon={<Lock aria-hidden />}>
            This meetup was cancelled.
          </Notice>
        )}

        <div>
          <List separators={false}>
            <ListRow icon={<Calendar />} title="Date" value={formatDayDate(meetup.startsAt)} />
            <ListRow icon={<Clock />} title="Start" value={formatTime(meetup.startsAt)} />
            <ListRow
              icon={<MapPin />}
              title="Meeting point"
              value={pointValue}
              href={hasCoordinates ? directionsUrl({ lat: location.lat!, lng: location.lng! }) : undefined}
              chevron={hasCoordinates}
            />
            <ListRow icon={<CircleUser />} title="Who can join" value={MEETUP_AUDIENCE_LABELS[meetup.visibility]} />
            <ListRow
              icon={<Users />}
              title={meetup.status === 'past' ? 'Went' : 'Going'}
              value={meetup.goingCount}
              onClick={canSeeAttendees && meetup.goingCount > 0 ? () => setShowAttendees(true) : undefined}
              chevron={canSeeAttendees && meetup.goingCount > 0}
            />
          </List>
          {meetup.visibility === 'secret' && staff && (
            <SectionFooter>
              Members who confirmed see the meeting point from {formatDayDate(meetup.revealAt)} at{' '}
              {formatTime(meetup.revealAt)}.
            </SectionFooter>
          )}
        </div>

        {meetup.description && (
          <Card padded>
            <p className={s.label}>About</p>
            <p className={s.body}>{meetup.description}</p>
          </Card>
        )}

        {meetup.rules && (
          <Card padded>
            <p className={s.label}>Meet rules</p>
            <p className={s.body}>{meetup.rules}</p>
          </Card>
        )}

        <div className={s.actions}>
          {meetup.status === 'past' ? (
            <Button variant="secondary" disabled>
              This meetup has ended
            </Button>
          ) : meetup.going ? (
            <Button variant="success" icon={<Check aria-hidden strokeWidth={3} />} onClick={() => setConfirmCancel(true)}>
              You&apos;re going
            </Button>
          ) : (
            meetup.canRsvp && (
              <Button onClick={() => rsvp.mutate(true)} loading={rsvp.isPending}>
                I&apos;m going
              </Button>
            )
          )}
          {meetup.canEdit && meetup.status !== 'cancelled' && meetup.status !== 'past' && (
            <ButtonLink to={`/meetups/${meetup.id}/edit`} variant="secondary" icon={<Pencil aria-hidden />}>
              Edit meetup
            </ButtonLink>
          )}
        </div>
      </div>

      <Sheet open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Can't make it?">
        <div className={s.form}>
          <p className={s.body}>
            {meetup.visibility === 'secret'
              ? 'You will no longer see the meeting point once it is revealed.'
              : 'The organizers will see one person less.'}
          </p>
          <Button variant="danger" loading={rsvp.isPending} onClick={() => rsvp.mutate(false)}>
            Cancel my RSVP
          </Button>
        </div>
      </Sheet>

      {canSeeAttendees && (
        <Sheet open={showAttendees} onClose={() => setShowAttendees(false)} title="Going">
          <Attendees meetupId={meetup.id} />
        </Sheet>
      )}
    </>
  );
}

function Hero({ meetup }: { meetup: Meetup }) {
  const location = meetup.location;
  if (meetup.locationStatus === 'visible' && location?.lat != null && location.lng != null) {
    return (
      <div className={s.mapHero}>
        <Suspense fallback={<Loading />}>
          <MiniMap lat={location.lat} lng={location.lng} />
        </Suspense>
        <div className={s.mapChip}>
          <span>{location.name || location.address || 'Meeting point'}</span>
          <a href={directionsUrl({ lat: location.lat, lng: location.lng })} target="_blank" rel="noreferrer">
            Directions
          </a>
        </div>
      </div>
    );
  }

  const content = {
    locked: {
      icon: <Lock className={s.heroIcon} aria-hidden />,
      title: 'Location locked',
      text: `Unlocks ${formatDayDate(meetup.revealAt)} at ${formatTime(meetup.revealAt)}`,
    },
    rsvp_required: {
      icon: <Lock className={s.heroIcon} aria-hidden />,
      title: 'Location locked',
      text: "Tap “I'm going” to unlock the meeting point",
    },
    not_set: {
      icon: <MapPin className={s.heroIcon} aria-hidden />,
      title: 'Meeting point to be announced',
      text: 'You will see it here',
    },
    visible: {
      icon: <MapPin className={s.heroIcon} aria-hidden />,
      title: location?.name || 'Meeting point',
      text: location?.address ?? '',
    },
  }[meetup.locationStatus];

  return (
    <Shards className={s.hero}>
      {content.icon}
      <p className={s.heroTitle}>{content.title}</p>
      {content.text && <p className={s.heroText}>{content.text}</p>}
    </Shards>
  );
}

function Attendees({ meetupId }: { meetupId: string }) {
  const { data, isPending, error } = useQuery({
    queryKey: keys.attendees(meetupId),
    queryFn: () => api.meetups.attendees(meetupId),
  });
  if (isPending) return <Spinner />;
  if (error) return <ErrorState error={error} />;
  return (
    <List>
      {data.items.map((attendee) => (
        <ListRow
          key={attendee.id}
          leading={<Avatar name={attendee.fullName} size={36} />}
          title={attendee.fullName}
          subtitle={[formatBadgeNumber(attendee.badgeNumber), attendee.car].filter(Boolean).join(' · ')}
        />
      ))}
    </List>
  );
}
