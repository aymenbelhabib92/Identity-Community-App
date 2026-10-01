import {
  distanceMeters,
  LOCATION_PRECISION_METERS,
  type MapMember,
  type MyLocation,
  type PassToken,
  type PassVerification,
} from '@identity/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activeMember, adminToken, bearer, createTestApp, register, type TestContext } from './helpers';

let t: TestContext;
let admin: string;
let karim: { token: string; id: string };
let yasmine: { token: string; id: string };
let organizer: { token: string; id: string };

const HOME = { lat: 36.8412, lng: 10.2311 };

beforeAll(async () => {
  t = await createTestApp();
  admin = await adminToken(t.app);
  karim = await activeMember(t.app, admin, 'Karim Ben Salah');
  yasmine = await activeMember(t.app, admin, 'Yasmine M.');
  organizer = await activeMember(t.app, admin, 'Sami Kacem', 'organizer');
});
afterAll(() => t.close());

const put = (token: string, url: string, payload: object) =>
  t.app.inject({ method: 'PUT', url: `/api/v1${url}`, headers: bearer(token), payload });
const get = (token: string, url: string) => t.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: bearer(token) });
const verify = (token: string, passToken: string) =>
  t.app.inject({ method: 'POST', url: '/api/v1/pass/verify', headers: bearer(token), payload: { token: passToken } });

describe('member map', () => {
  it('is closed to pending members', async () => {
    const { token } = await register(t.app, 'Pending Person');
    expect((await put(token, '/me/location-sharing', { enabled: true })).statusCode).toBe(403);
    expect((await get(token, '/map/members')).statusCode).toBe(403);
  });

  it('requires sharing to be on before accepting a position', async () => {
    const res = await put(karim.token, '/me/location', HOME);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('SHARING_OFF');
  });

  it('stores only an approximate position', async () => {
    await put(karim.token, '/me/location-sharing', { enabled: true });
    const res = await put(karim.token, '/me/location', { ...HOME, accuracy: 12 });
    const stored = res.json<MyLocation>();
    expect(stored.sharing).toBe(true);
    expect(stored.lat).not.toBe(HOME.lat);
    expect(distanceMeters(HOME, { lat: stored.lat!, lng: stored.lng! })).toBeLessThan(LOCATION_PRECISION_METERS);
  });

  it('shows sharing members to other members, not to themselves', async () => {
    const seen = (await get(yasmine.token, '/map/members')).json<{ items: MapMember[] }>();
    expect(seen.items.map((m) => m.fullName)).toEqual(['Karim Ben Salah']);
    const own = (await get(karim.token, '/map/members')).json<{ items: MapMember[] }>();
    expect(own.items).toHaveLength(0);
  });

  it('forgets stale positions', async () => {
    t.clock.current = new Date(t.clock.current.getTime() + 25 * 3_600_000);
    expect((await get(yasmine.token, '/map/members')).json<{ items: MapMember[] }>().items).toHaveLength(0);
    t.clock.current = new Date('2026-09-28T16:00:00Z');
  });

  it('deletes the position when sharing is turned off', async () => {
    const res = await put(karim.token, '/me/location-sharing', { enabled: false });
    expect(res.json<MyLocation>()).toMatchObject({ sharing: false, lat: null, lng: null });
    expect((await get(yasmine.token, '/map/members')).json<{ items: MapMember[] }>().items).toHaveLength(0);
  });
});

describe('member pass', () => {
  it('is issued to members with a badge only', async () => {
    const { token } = await register(t.app, 'No Badge Yet');
    const res = await get(token, '/pass/token');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('NO_BADGE');
  });

  it('is verified by organizers', async () => {
    const { token } = (await get(karim.token, '/pass/token')).json<PassToken>();

    expect((await verify(yasmine.token, token)).statusCode).toBe(403);

    const check = (await verify(organizer.token, token)).json<PassVerification>();
    expect(check.valid).toBe(true);
    expect(check.member).toMatchObject({ fullName: 'Karim Ben Salah', state: 'active' });
  });

  it('cannot be forged from an access token, and pass tokens cannot be used to sign in', async () => {
    const forged = (await verify(organizer.token, karim.token)).json<PassVerification>();
    expect(forged.valid).toBe(false);

    const { token } = (await get(karim.token, '/pass/token')).json<PassToken>();
    expect((await get(token, '/me')).statusCode).toBe(401);
  });

  it('reports suspended members as not valid', async () => {
    await t.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/members/${yasmine.id}`,
      headers: bearer(admin),
      payload: { status: 'suspended' },
    });
    // The pass still opens, but the check at the door shows the suspension.
    const { token } = (await get(yasmine.token, '/pass/token')).json<PassToken>();
    const check = (await verify(organizer.token, token)).json<PassVerification>();
    expect(check).toMatchObject({ valid: false, reason: 'Membership suspended.' });
    expect(check.member?.state).toBe('suspended');
  });
});
