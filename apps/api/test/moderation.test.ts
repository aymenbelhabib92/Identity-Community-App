import type { AdminMember, ClubPlace, MapMember, MyLocation, RedZone, User } from '@identity/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activeMember, adminToken, bearer, createTestApp, register, type TestContext } from './helpers';

let t: TestContext;
let admin: string;

const DAY = 86_400_000;
const deviceOf = (name: string) => `device-${name}-0123456789abcdef`;

const call = (
  token: string | null,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
  device?: string,
) =>
  t.app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...(token && bearer(token)), ...(device && { 'x-device-id': device }) },
    payload,
  });
const days = (n: number) => {
  t.clock.current = new Date(t.clock.current.getTime() + n * DAY);
};

beforeAll(async () => {
  t = await createTestApp();
  admin = await adminToken(t.app);
});
afterAll(() => t.close());

describe('bans', () => {
  let member: { token: string; id: string };
  beforeEach(async () => {
    member = await activeMember(t.app, admin, 'Rami Toumi');
  });

  const ban = (id: string, body: object = {}) => call(admin, 'POST', `/admin/members/${id}/ban`, body);
  const me = async (token: string) => (await call(token, 'GET', '/me')).json<User>();

  it('last 3 days, then 7, then 15 — and close the chat, the map and meetups meanwhile', async () => {
    const first = await ban(member.id, { reason: 'Burnout in the parking' });
    expect(first.statusCode).toBe(200);
    expect(first.json<AdminMember>()).toMatchObject({ state: 'banned', hasAccess: false, bans: 1 });

    const user = await me(member.token);
    expect(user.ban).toEqual({ until: new Date(t.clock.current.getTime() + 3 * DAY).toISOString(), reason: 'Burnout in the parking' });
    // Still signed in, with their pass and payments; no chat, no map.
    expect((await call(member.token, 'GET', '/membership')).statusCode).toBe(200);
    expect((await call(member.token, 'GET', '/chat/messages')).statusCode).toBe(403);
    expect((await call(member.token, 'GET', '/map/members')).statusCode).toBe(403);
    // Told why.
    const notifications = (await call(member.token, 'GET', '/notifications')).json<{ items: { title: string; body: string }[] }>();
    expect(notifications.items[0]).toMatchObject({ title: 'Banned for 3 days' });
    expect(notifications.items[0]!.body).toContain('Burnout in the parking');

    // A second ban while one runs is refused; it ends by itself.
    expect((await ban(member.id)).statusCode).toBe(409);
    days(3.1);
    const after = await me(member.token);
    expect(after).toMatchObject({ hasAccess: true, ban: null });
    expect(after.state).not.toBe('banned');

    const second = (await ban(member.id)).json<AdminMember>();
    expect(second.ban!.until).toBe(new Date(t.clock.current.getTime() + 7 * DAY).toISOString());
    days(7.1);
    const third = (await ban(member.id)).json<AdminMember>();
    expect(third.ban!.until).toBe(new Date(t.clock.current.getTime() + 15 * DAY).toISOString());
    days(15.1);
    const fourth = (await ban(member.id)).json<AdminMember>();
    expect(fourth).toMatchObject({ bans: 4 });
    expect(fourth.ban!.until).toBe(new Date(t.clock.current.getTime() + 15 * DAY).toISOString());
  });

  it('lifted early do not count in the tiers', async () => {
    await ban(member.id);
    const lifted = await call(admin, 'POST', `/admin/members/${member.id}/unban`);
    expect(lifted.json<AdminMember>()).toMatchObject({ state: 'active', ban: null, bans: 0 });
    expect((await me(member.token)).hasAccess).toBe(true);
    const again = (await ban(member.id)).json<AdminMember>();
    expect(again.ban!.until).toBe(new Date(t.clock.current.getTime() + 3 * DAY).toISOString());
  });

  it('are for admins, never on oneself', async () => {
    const organizer = await activeMember(t.app, admin, 'Org Anizer', 'organizer');
    expect((await call(organizer.token, 'POST', `/admin/members/${member.id}/ban`, {})).statusCode).toBe(403);
    const adminId = (await me(admin)).id;
    expect((await ban(adminId)).statusCode).toBe(400);
  });

  it('for life sign the member out and block the phones they used', async () => {
    const phone = '20555111';
    const { token, user } = await register(t.app, 'Lifelong Trouble', phone);
    await call(admin, 'PATCH', `/admin/members/${user.id}`, { status: 'active' });
    // Their phone, seen when they used the app.
    await call(null, 'POST', '/auth/login', { phone, password: 'password-123' }, deviceOf('banned'));

    const banned = (await ban(user.id, { permanent: true })).json<AdminMember>();
    expect(banned).toMatchObject({ state: 'banned', ban: { until: null }, devices: 1 });

    expect((await call(token, 'GET', '/me')).statusCode).toBe(401);
    const login = await call(null, 'POST', '/auth/login', { phone, password: 'password-123' });
    expect(login.statusCode).toBe(403);
    expect(login.json<{ error: { code: string } }>().error.code).toBe('BANNED');

    // Another number from the same phone: no new account, no other account either.
    const fresh = await call(null, 'POST', '/auth/register', { fullName: 'New Me', phone: '20555222', password: 'password-123' }, deviceOf('banned'));
    expect(fresh.statusCode).toBe(403);
    expect(fresh.json<{ error: { code: string } }>().error.code).toBe('DEVICE_BLOCKED');
    const other = await register(t.app, 'Cousin', '20555333');
    const otherLogin = await call(null, 'POST', '/auth/login', { phone: '20555333', password: 'password-123' }, deviceOf('banned'));
    expect(otherLogin.statusCode).toBe(403);
    expect(other.user.id).toBeTruthy();
    // Other phones are fine.
    const elsewhere = await call(null, 'POST', '/auth/register', { fullName: 'Someone Else', phone: '20555444', password: 'password-123' }, deviceOf('clean'));
    expect(elsewhere.statusCode).toBe(201);

    // Lifting the ban unblocks the account and its phones.
    await call(admin, 'POST', `/admin/members/${user.id}/unban`);
    expect((await call(null, 'POST', '/auth/login', { phone, password: 'password-123' }, deviceOf('banned'))).statusCode).toBe(200);
  });

  it('show in the overview and the members list', async () => {
    await ban(member.id);
    const overview = (await call(admin, 'GET', '/admin/overview')).json<{ bannedMembers: number }>();
    expect(overview.bannedMembers).toBeGreaterThanOrEqual(1);
    const list = (await call(admin, 'GET', '/admin/members?filter=banned')).json<{ items: AdminMember[] }>();
    expect(list.items.map((m) => m.id)).toContain(member.id);
  });
});

describe('places and red zones', () => {
  let karim: { token: string; id: string };
  let leila: { token: string; id: string };
  beforeAll(async () => {
    karim = await activeMember(t.app, admin, 'Karim Map');
    leila = await activeMember(t.app, admin, 'Leila Map');
  });

  const lake = { lat: 36.8487, lng: 10.2715 };
  const near = { lat: 36.8495, lng: 10.2722 }; // ~110 m from the lake point
  const far = { lat: 36.8687, lng: 10.3417 };

  it('places: admins add, change and remove them; every member sees them', async () => {
    const organizer = await activeMember(t.app, admin, 'Org Places', 'organizer');
    const body = { name: 'Lac 2 parking', category: 'spot', description: 'Night meets', ...lake };
    expect((await call(organizer.token, 'POST', '/admin/places', body)).statusCode).toBe(403);

    const created = await call(admin, 'POST', '/admin/places', body);
    expect(created.statusCode).toBe(201);
    const place = created.json<ClubPlace>();
    expect((await call(admin, 'PATCH', `/admin/places/${place.id}`, { name: 'Lac 2 — upper parking' })).json<ClubPlace>().name).toBe(
      'Lac 2 — upper parking',
    );

    const { token: pending } = await register(t.app, 'Pending Viewer');
    const seen = (await call(pending, 'GET', '/map/places')).json<{ items: ClubPlace[] }>().items;
    expect(seen).toEqual([expect.objectContaining({ name: 'Lac 2 — upper parking', category: 'spot', description: 'Night meets' })]);

    expect((await call(admin, 'DELETE', `/admin/places/${place.id}`)).statusCode).toBe(200);
    expect((await call(karim.token, 'GET', '/map/places')).json<{ items: ClubPlace[] }>().items).toEqual([]);
  });

  it('red zones hide the positions inside them, even those stored before', async () => {
    for (const member of [karim, leila]) {
      await call(member.token, 'PUT', '/me/location-sharing', { enabled: true });
    }
    await call(karim.token, 'PUT', '/me/location', near);
    await call(leila.token, 'PUT', '/me/location', far);
    const before = (await call(admin, 'GET', '/map/members')).json<{ items: MapMember[] }>().items.map((m) => m.id);
    expect(before).toEqual(expect.arrayContaining([karim.id, leila.id]));

    const created = await call(admin, 'POST', '/admin/zones', { name: 'Lac 2 residences', ...lake, radius: 300 });
    expect(created.statusCode).toBe(201);
    const zone = created.json<RedZone>();
    // Visible to every member.
    const { token: pending } = await register(t.app, 'Pending Zone Viewer');
    expect((await call(pending, 'GET', '/map/zones')).json<{ items: RedZone[] }>().items).toEqual([
      expect.objectContaining({ name: 'Lac 2 residences', radius: 300 }),
    ]);

    // Karim, already shared inside the zone, disappears at once.
    const after = (await call(admin, 'GET', '/map/members')).json<{ items: MapMember[] }>().items.map((m) => m.id);
    expect(after).toContain(leila.id);
    expect(after).not.toContain(karim.id);
    expect((await call(karim.token, 'GET', '/me/location')).json<MyLocation>().redZone).toEqual({ id: zone.id, name: 'Lac 2 residences' });

    // Inside the zone nothing is stored; sharing resumes by itself outside.
    const inside = (await call(leila.token, 'PUT', '/me/location', lake)).json<MyLocation>();
    expect(inside).toMatchObject({ sharing: true, lat: null, redZone: { name: 'Lac 2 residences' } });
    expect((await call(admin, 'GET', '/map/members')).json<{ items: MapMember[] }>().items.map((m) => m.id)).not.toContain(leila.id);
    const outside = (await call(leila.token, 'PUT', '/me/location', far)).json<MyLocation>();
    expect(outside).toMatchObject({ sharing: true, redZone: null });
    expect(outside.lat).not.toBeNull();

    // Shrinking the zone frees Karim's position.
    await call(admin, 'PATCH', `/admin/zones/${zone.id}`, { radius: 50 });
    expect((await call(admin, 'GET', '/map/members')).json<{ items: MapMember[] }>().items.map((m) => m.id)).toContain(karim.id);
    expect((await call(admin, 'DELETE', `/admin/zones/${zone.id}`)).statusCode).toBe(200);
  });

  it('refuse odd zones', async () => {
    const res = await call(admin, 'POST', '/admin/zones', { name: 'Too big', ...lake, radius: 50_000 });
    expect(res.statusCode).toBe(400);
  });
});
