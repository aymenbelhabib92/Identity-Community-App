import type { LatLng, Meetup, MeetupVisibility, Place } from '@identity/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import {
  BackLink,
  Button,
  ErrorState,
  FieldErrors,
  FormList,
  FormRow,
  Input,
  LargeTitle,
  Loading,
  Screen,
  Segmented,
  Select,
  Sheet,
  TextArea,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useCan } from '../../lib/auth';
import { fieldErrors } from '../../lib/errors';
import { keys, useClubSettings } from '../../lib/queries';
import s from './meetups.module.css';

const MapPicker = lazy(() => import('../../components/map/MapPicker'));

const REVEAL_OPTIONS = [1, 2, 3, 4, 6, 12, 24];

interface FormState {
  title: string;
  visibility: MeetupVisibility;
  date: string;
  time: string;
  revealHoursBefore: number;
  locationName: string;
  address: string;
  point: LatLng | null;
  description: string;
  rules: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function fromMeetup(meetup: Meetup): FormState {
  const start = new Date(meetup.startsAt);
  const location = meetup.location;
  return {
    title: meetup.title,
    visibility: meetup.visibility,
    date: localDate(start),
    time: localTime(start),
    revealHoursBefore: meetup.revealHoursBefore,
    locationName: location?.name ?? '',
    address: location?.address ?? '',
    point: location?.lat != null && location.lng != null ? { lat: location.lat, lng: location.lng } : null,
    description: meetup.description ?? '',
    rules: meetup.rules ?? '',
  };
}

export default function MeetupForm() {
  const { id } = useParams();
  const canCreate = useCan('meetups:create');
  const settings = useClubSettings();
  const existing = useQuery({
    queryKey: keys.meetup(id ?? ''),
    queryFn: () => api.meetups.get(id!),
    enabled: Boolean(id),
  });

  if (!id && !canCreate) return <Navigate to="/meetups" replace />;
  if ((id && existing.isPending) || settings.isPending) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  if (id && existing.error) {
    return (
      <Screen>
        <BackLink to="/meetups">Meetups</BackLink>
        <ErrorState error={existing.error} />
      </Screen>
    );
  }
  if (existing.data && !existing.data.canEdit) return <Navigate to={`/meetups/${id}`} replace />;

  const tomorrow = new Date(Date.now() + 86_400_000);
  const initial: FormState = existing.data
    ? fromMeetup(existing.data)
    : {
        title: '',
        visibility: 'public',
        date: localDate(tomorrow),
        time: '21:00',
        revealHoursBefore: settings.data?.revealHoursBefore ?? 2,
        locationName: '',
        address: '',
        point: null,
        description: '',
        rules: settings.data?.meetRules ?? '',
      };

  return <Form meetupId={id} initial={initial} />;
}

function Form({ meetupId, initial }: { meetupId?: string; initial: FormState }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: form.title,
        visibility: form.visibility,
        startsAt: new Date(`${form.date}T${form.time}`).toISOString(),
        revealHoursBefore: form.revealHoursBefore,
        locationName: form.locationName || null,
        address: form.address || null,
        lat: form.point?.lat ?? null,
        lng: form.point?.lng ?? null,
        description: form.description || null,
        rules: form.rules || null,
      };
      return meetupId ? api.meetups.update(meetupId, body) : api.meetups.create(body);
    },
    onSuccess: (meetup) => {
      queryClient.setQueryData(keys.meetup(meetup.id), meetup);
      void queryClient.invalidateQueries({ queryKey: keys.meetups });
      void queryClient.invalidateQueries({ queryKey: keys.mapMeetups });
      toast(meetupId ? 'Meetup updated' : 'Meetup created. Members are notified.', 'success');
      navigate(`/meetups/${meetup.id}`, { replace: true });
    },
  });

  const cancel = useMutation({
    mutationFn: () => api.meetups.cancel(meetupId!),
    onSuccess: (meetup) => {
      queryClient.setQueryData(keys.meetup(meetup.id), meetup);
      void queryClient.invalidateQueries({ queryKey: keys.meetups });
      toast('Meetup cancelled. Attendees are notified.', 'success');
      navigate(`/meetups/${meetup.id}`, { replace: true });
    },
  });

  const errors = fieldErrors(save.error);
  const hasFieldErrors = Object.keys(errors).length > 0;

  const onPlaceFound = (place: Place) =>
    setForm((f) => ({ ...f, locationName: f.locationName || place.name, address: place.address }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  const visibilityHelp = {
    public: 'Everyone in the club, pending members included. The meeting point is visible to all.',
    secret: `Active members only. The meeting point stays hidden until ${form.revealHoursBefore} h before the start, and only members who confirmed see it.`,
    staff: 'Organizers, treasurer and admins only.',
  }[form.visibility];

  return (
    <Screen>
      <BackLink to={meetupId ? `/meetups/${meetupId}` : '/meetups'}>{meetupId ? 'Meetup' : 'Meetups'}</BackLink>
      <LargeTitle>{meetupId ? 'Edit meetup' : 'New meetup'}</LargeTitle>

      <form className={s.form} onSubmit={submit} noValidate>
        <FormList>
          <FormRow label="Title" htmlFor="title" invalid={Boolean(errors.title)}>
            <Input
              id="title"
              placeholder="Secret Night Meet"
              value={form.title}
              maxLength={80}
              onChange={(event) => update('title', event.target.value)}
            />
          </FormRow>
        </FormList>

        <Segmented
          label="Visibility"
          value={form.visibility}
          onChange={(value) => update('visibility', value)}
          options={[
            { value: 'public', label: 'Public' },
            { value: 'secret', label: 'Secret' },
            { value: 'staff', label: 'Organizers' },
          ]}
        />
        <p className={s.help}>{visibilityHelp}</p>

        <FormList>
          <FormRow label="Date" htmlFor="date" invalid={Boolean(errors.startsAt)}>
            <Input id="date" type="date" value={form.date} onChange={(event) => update('date', event.target.value)} />
          </FormRow>
          <FormRow label="Start" htmlFor="time" invalid={Boolean(errors.startsAt)}>
            <Input id="time" type="time" value={form.time} onChange={(event) => update('time', event.target.value)} />
          </FormRow>
          {form.visibility === 'secret' && (
            <FormRow label="Reveal spot" htmlFor="reveal">
              <Select
                id="reveal"
                value={form.revealHoursBefore}
                onChange={(event) => update('revealHoursBefore', Number(event.target.value))}
              >
                {REVEAL_OPTIONS.map((hours) => (
                  <option key={hours} value={hours}>
                    {hours} h before
                  </option>
                ))}
              </Select>
            </FormRow>
          )}
        </FormList>

        <h2 className={s.formSection}>Meeting point</h2>
        <FormList>
          <FormRow label="Spot" htmlFor="locationName">
            <Input
              id="locationName"
              placeholder="e.g. Lac 2 parking"
              value={form.locationName}
              maxLength={120}
              onChange={(event) => update('locationName', event.target.value)}
            />
          </FormRow>
          <FormRow label="Address" htmlFor="address">
            <Input
              id="address"
              placeholder="Optional"
              value={form.address}
              maxLength={200}
              onChange={(event) => update('address', event.target.value)}
            />
          </FormRow>
        </FormList>
        <Suspense fallback={<Loading />}>
          <MapPicker value={form.point} onChange={(point) => update('point', point)} onPlaceFound={onPlaceFound} />
        </Suspense>

        <h2 className={s.formSection}>Details</h2>
        <TextArea
          aria-label="Description"
          placeholder="The plan: route, dress code, what to bring…"
          value={form.description}
          maxLength={2000}
          onChange={(event) => update('description', event.target.value)}
        />

        <h2 className={s.formSection}>Meet rules</h2>
        <TextArea
          aria-label="Meet rules"
          value={form.rules}
          maxLength={2000}
          onChange={(event) => update('rules', event.target.value)}
        />

        <FieldErrors errors={[errors.title, errors.startsAt, errors.lat]} />
        {save.error && !hasFieldErrors && <ErrorState error={save.error} />}

        <Button type="submit" loading={save.isPending} disabled={form.title.trim().length < 3}>
          {meetupId ? 'Save changes' : 'Create meetup'}
        </Button>
        {meetupId && (
          <Button variant="danger" onClick={() => setConfirmCancel(true)}>
            Cancel meetup
          </Button>
        )}
      </form>

      <Sheet open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel this meetup?">
        <div className={s.form}>
          <p className={s.body}>Members who are going will be notified. This cannot be undone.</p>
          {cancel.error && <ErrorState error={cancel.error} />}
          <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
            Cancel meetup
          </Button>
        </div>
      </Sheet>
    </Screen>
  );
}
