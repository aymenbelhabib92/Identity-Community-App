import { CAR_PHOTOS_MAX, type MapMember, type NotificationList, type User } from '@identity/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activeMember, adminToken, bearer, createTestApp, multipart, PNG, register, type TestContext } from './helpers';

let t: TestContext;
let admin: string;
let karim: { token: string; id: string };
let yasmine: { token: string; id: string };

beforeAll(async () => {
  t = await createTestApp();
  admin = await adminToken(t.app);
  karim = await activeMember(t.app, admin, 'Karim Ben Salah');
  yasmine = await activeMember(t.app, admin, 'Yasmine M.');
});
afterAll(() => t.close());

const photo = (name = 'photo.png', data = PNG) => multipart({}, { name, type: 'image/png', data });
const upload = (token: string, method: 'PUT' | 'POST', url: string, body = photo()) =>
  t.app.inject({ method, url: `/api/v1${url}`, headers: { ...bearer(token), ...body.headers }, payload: body.payload });
const get = (token: string, url: string, headers: Record<string, string> = {}) =>
  t.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { ...bearer(token), ...headers } });
const del = (token: string, url: string) => t.app.inject({ method: 'DELETE', url: `/api/v1${url}`, headers: bearer(token) });

describe('profile photo', () => {
  it('is uploaded, served to members, and replaced by the next one', async () => {
    const first = (await upload(karim.token, 'PUT', '/me/avatar')).json<User>();
    expect(first.avatar).toEqual(expect.any(String));

    const seen = await get(yasmine.token, `/photos/${first.avatar}`);
    expect(seen.statusCode).toBe(200);
    expect(seen.headers['content-type']).toBe('image/png');
    expect(seen.rawPayload.equals(PNG)).toBe(true);

    const second = (await upload(karim.token, 'PUT', '/me/avatar')).json<User>();
    expect(second.avatar).not.toBe(first.avatar);
    expect((await get(yasmine.token, `/photos/${first.avatar}`)).statusCode).toBe(404);
  });

  it('refuses files that are not photos', async () => {
    const res = await upload(karim.token, 'PUT', '/me/avatar', photo('notes.png', Buffer.from('just some text')));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details[0].path).toEqual(['file']);
  });

  it('requires an account', async () => {
    const { avatar } = (await get(karim.token, '/me')).json<User>();
    expect((await t.app.inject({ method: 'GET', url: `/api/v1/photos/${avatar}` })).statusCode).toBe(401);
  });

  it('can be removed', async () => {
    const { avatar } = (await get(karim.token, '/me')).json<User>();
    expect((await del(karim.token, '/me/avatar')).json<User>().avatar).toBeNull();
    expect((await get(karim.token, `/photos/${avatar}`)).statusCode).toBe(404);
  });
});

describe('car photos', () => {
  it(`are limited to ${CAR_PHOTOS_MAX}, the first one being the main photo`, async () => {
    let user!: User;
    for (let i = 0; i < CAR_PHOTOS_MAX; i++) {
      const res = await upload(karim.token, 'POST', '/me/car-photos');
      expect(res.statusCode).toBe(201);
      user = res.json<User>();
    }
    expect(user.carPhotos).toHaveLength(CAR_PHOTOS_MAX);

    const extra = await upload(karim.token, 'POST', '/me/car-photos');
    expect(extra.statusCode).toBe(409);
    expect(extra.json().error.code).toBe('TOO_MANY_PHOTOS');

    const [main, ...others] = user.carPhotos;
    const after = (await del(karim.token, `/me/car-photos/${main}`)).json<User>();
    expect(after.carPhotos).toEqual(others);
  });

  it('are shown to active members only, and removed by their owner only', async () => {
    const { carPhotos } = (await get(karim.token, '/me')).json<User>();
    expect((await get(yasmine.token, `/photos/${carPhotos[0]}`)).statusCode).toBe(200);
    const pending = await register(t.app, 'Pending Person');
    expect((await get(pending.token, `/photos/${carPhotos[0]}`)).statusCode).toBe(404);
    expect((await del(yasmine.token, `/me/car-photos/${carPhotos[0]}`)).statusCode).toBe(404);
  });

  it('appear on the member map with the profile photo', async () => {
    await upload(karim.token, 'PUT', '/me/avatar');
    const put = (url: string, payload: object) =>
      t.app.inject({ method: 'PUT', url: `/api/v1${url}`, headers: bearer(karim.token), payload });
    await put('/me/location-sharing', { enabled: true });
    await put('/me/location', { lat: 36.8412, lng: 10.2311 });

    const [member] = (await get(yasmine.token, '/map/members')).json<{ items: MapMember[] }>().items;
    expect(member).toMatchObject({ fullName: 'Karim Ben Salah', online: true });
    expect(member!.avatar).toEqual(expect.any(String));
    expect(member!.carPhotos).toHaveLength(CAR_PHOTOS_MAX - 1);
  });
});

describe('presence', () => {
  it('shows a member online for a few minutes after their last request', async () => {
    const member = async () =>
      (await get(yasmine.token, '/map/members')).json<{ items: MapMember[] }>().items.find((m) => m.id === karim.id)!;

    await get(karim.token, '/me');
    expect((await member()).online).toBe(true);

    t.clock.current = new Date(t.clock.current.getTime() + 6 * 60_000);
    expect((await member()).online).toBe(false);

    await get(karim.token, '/me');
    expect((await member()).online).toBe(true);
    t.clock.current = new Date('2026-09-28T16:00:00Z');
  });
});

describe('language', () => {
  const french = { 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' };

  it('answers errors in the language of the request', async () => {
    const login = (headers: Record<string, string>) =>
      t.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers, payload: { phone: '20999999', password: 'wrong-pass' } });
    expect((await login({})).json().error.message).toBe('Wrong phone number or password.');
    expect((await login(french)).json().error.message).toBe('Numéro ou mot de passe incorrect.');

    const invalid = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: french,
      payload: { fullName: 'Nour Test', phone: '20777001', password: 'short' },
    });
    expect(invalid.json().error.details[0].message).toBe('Utilisez au moins 8 caractères');
  });

  it('is saved on the account and used for labels and notifications', async () => {
    const patch = await t.app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: bearer(yasmine.token),
      payload: { language: 'fr' },
    });
    expect(patch.json<User>().language).toBe('fr');

    // The treasurer (the admin here) records dues paid in person: the member is told in French.
    const pay = await t.app.inject({
      method: 'POST',
      url: `/api/v1/admin/members/${yasmine.id}/payments`,
      headers: bearer(admin),
      payload: { kind: 'dues', periods: 1 },
    });
    expect(pay.statusCode).toBe(201);
    expect(pay.json().label).toBe('Q4 2026 dues');

    const { items } = (await get(yasmine.token, '/notifications')).json<NotificationList>();
    expect(items[0]).toMatchObject({ title: 'Paiement enregistré', body: 'Cotisation T4 2026 · 5 DT payés en main propre' });

    const membership = (await get(yasmine.token, '/membership', french)).json<{ payments: { label: string }[] }>();
    expect(membership.payments[0]!.label).toBe('Cotisation T4 2026');
  });
});
