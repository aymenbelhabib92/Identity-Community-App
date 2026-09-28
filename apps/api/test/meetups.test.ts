import type { Meetup, Notification } from '@identity/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activeMember, adminToken, bearer, createTestApp, register, type TestContext } from './helpers';

let t: TestContext;
let organizer: { token: string; id: string };
let going: { token: string; id: string };
let notGoing: { token: string; id: string };
let pending: string;
let secret: Meetup;

const NOW = new Date('2026-09-28T16:00:00Z');
const STARTS = '2026-10-03T22:00:00+01:00'; // Saturday 22:00 in Tunis = 21:00Z

beforeAll(async () => {
  t = await createTestApp(NOW);
  const admin = await adminToken(t.app);
  organizer = await activeMember(t.app, admin, 'Sami Kacem', 'organizer');
  going = await activeMember(t.app, admin, 'Karim Ben Salah');
  notGoing = await activeMember(t.app, admin, 'Yasmine M.');
  pending = (await register(t.app, 'New Comer')).token;
});
afterAll(() => t.close());

const get = (token: string, url: string) => t.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: bearer(token) });

describe('secret meetups', () => {
  it('can only be created by organizers', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/meetups',
      headers: bearer(going.token),
      payload: { title: 'My meet', visibility: 'public', startsAt: STARTS },
    });
    expect(res.statusCode).toBe(403);
  });

  it('is created with a hidden meeting point and notifies members', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/meetups',
      headers: bearer(organizer.token),
      payload: {
        title: 'Secret Night Meet',
        visibility: 'secret',
        startsAt: STARTS,
        locationName: 'Lac 2 parking',
        lat: 36.8455,
        lng: 10.2729,
      },
    });
    expect(res.statusCode).toBe(201);
    secret = res.json<Meetup>();
    // The host always sees the spot.
    expect(secret.locationStatus).toBe('visible');
    expect(secret.revealAt).toBe('2026-10-03T19:00:00.000Z');
    expect(secret.rules).toContain('No racing');

    const notifications = (await get(going.token, '/notifications')).json<{ items: Notification[] }>();
    expect(notifications.items[0]?.title).toBe('New meetup: Secret Night Meet');
    expect(notifications.items[0]?.body).toContain('Sat 03 Oct · 22:00');
    const pendingNotifications = (await get(pending, '/notifications')).json<{ items: Notification[] }>();
    expect(pendingNotifications.items).toHaveLength(0);
  });

  it('is invisible to members whose membership is not active', async () => {
    const list = (await get(pending, '/meetups')).json<{ items: Meetup[] }>();
    expect(list.items.map((m) => m.id)).not.toContain(secret.id);
    expect((await get(pending, `/meetups/${secret.id}`)).statusCode).toBe(404);
  });

  it('hides the meeting point from members until the reveal time', async () => {
    const meetup = (await get(going.token, `/meetups/${secret.id}`)).json<Meetup>();
    expect(meetup.locationStatus).toBe('locked');
    expect(meetup.location).toBeNull();
    expect(JSON.stringify(meetup)).not.toContain('Lac 2');
  });

  it('counts RSVPs', async () => {
    const res = await t.app.inject({ method: 'PUT', url: `/api/v1/meetups/${secret.id}/rsvp`, headers: bearer(going.token) });
    expect(res.json<Meetup>()).toMatchObject({ going: true, goingCount: 1, locationStatus: 'locked' });
  });

  it('reveals the spot at reveal time, to confirmed members only', async () => {
    t.clock.current = new Date('2026-10-03T19:30:00Z');
    const confirmed = (await get(going.token, `/meetups/${secret.id}`)).json<Meetup>();
    expect(confirmed.locationStatus).toBe('visible');
    expect(confirmed.location).toMatchObject({ name: 'Lac 2 parking', lat: 36.8455 });

    const other = (await get(notGoing.token, `/meetups/${secret.id}`)).json<Meetup>();
    expect(other.locationStatus).toBe('rsvp_required');
    expect(other.location).toBeNull();

    const onMap = (await get(going.token, '/map/meetups')).json<{ items: { id: string }[] }>();
    expect(onMap.items.map((m) => m.id)).toContain(secret.id);
    const notOnMap = (await get(notGoing.token, '/map/meetups')).json<{ items: { id: string }[] }>();
    expect(notOnMap.items.map((m) => m.id)).not.toContain(secret.id);
  });

  it('shows attendees to staff only', async () => {
    expect((await get(going.token, `/meetups/${secret.id}/attendees`)).statusCode).toBe(403);
    const attendees = (await get(organizer.token, `/meetups/${secret.id}/attendees`)).json<{ items: { id: string }[] }>();
    expect(attendees.items.map((a) => a.id)).toEqual([going.id]);
  });

  it('moves to the past once it is over', async () => {
    t.clock.current = new Date('2026-10-04T12:00:00Z');
    const upcoming = (await get(going.token, '/meetups')).json<{ items: Meetup[] }>();
    expect(upcoming.items.map((m) => m.id)).not.toContain(secret.id);
    const past = (await get(going.token, '/meetups?scope=past')).json<{ items: Meetup[] }>();
    expect(past.items[0]).toMatchObject({ id: secret.id, status: 'past' });

    const rsvp = await t.app.inject({ method: 'PUT', url: `/api/v1/meetups/${secret.id}/rsvp`, headers: bearer(notGoing.token) });
    expect(rsvp.statusCode).toBe(409);
    t.clock.current = NOW;
  });
});

describe('other visibilities', () => {
  it('keeps organizer meetups among staff', async () => {
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/v1/meetups',
      headers: bearer(organizer.token),
      payload: { title: 'Organizer briefing', visibility: 'staff', startsAt: '2026-10-14T20:00:00+01:00' },
    });
    const briefing = created.json<Meetup>();
    expect((await get(going.token, `/meetups/${briefing.id}`)).statusCode).toBe(404);
    expect((await get(organizer.token, `/meetups/${briefing.id}`)).statusCode).toBe(200);
  });

  it('shows public meetups and their spot to everyone, pending members included', async () => {
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/v1/meetups',
      headers: bearer(organizer.token),
      payload: { title: 'Coffee & Cars', visibility: 'public', startsAt: '2026-10-11T09:30:00+01:00', locationName: 'Gammarth' },
    });
    const coffee = created.json<Meetup>();
    const seen = (await get(pending, `/meetups/${coffee.id}`)).json<Meetup>();
    expect(seen).toMatchObject({ locationStatus: 'visible', canRsvp: true, canEdit: false });
    expect(seen.location?.name).toBe('Gammarth');
  });

  it('notifies attendees when a meetup is cancelled', async () => {
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/v1/meetups',
      headers: bearer(organizer.token),
      payload: { title: 'Mountain cruise', visibility: 'public', startsAt: '2026-10-18T08:00:00+01:00' },
    });
    const cruise = created.json<Meetup>();
    await t.app.inject({ method: 'PUT', url: `/api/v1/meetups/${cruise.id}/rsvp`, headers: bearer(notGoing.token) });

    const cancelled = await t.app.inject({
      method: 'POST',
      url: `/api/v1/meetups/${cruise.id}/cancel`,
      headers: bearer(organizer.token),
    });
    expect(cancelled.json<Meetup>().status).toBe('cancelled');

    const notifications = (await get(notGoing.token, '/notifications')).json<{ items: Notification[] }>();
    expect(notifications.items[0]?.title).toBe('Cancelled: Mountain cruise');
  });

  it('refuses start times in the past', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/meetups',
      headers: bearer(organizer.token),
      payload: { title: 'Too late', visibility: 'public', startsAt: '2026-09-01T10:00:00+01:00' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details[0].path).toEqual(['startsAt']);
  });
});
