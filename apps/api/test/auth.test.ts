import type { AuthResponse, User } from '@identity/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminToken, bearer, createTestApp, register, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

describe('auth', () => {
  it('registers a pending member who has no member access yet', async () => {
    const { token, user } = await register(t.app, 'Karim Ben Salah', '20 555 042');
    expect(user).toMatchObject({ fullName: 'Karim Ben Salah', phone: '+21620555042', status: 'pending', state: 'pending' });
    expect(user.hasAccess).toBe(false);
    expect(user.badgeNumber).toBeNull();
    expect(user).not.toHaveProperty('passwordHash');

    const me = await t.app.inject({ method: 'GET', url: '/api/v1/me', headers: bearer(token) });
    expect(me.statusCode).toBe(200);
    expect(me.json<User>().id).toBe(user.id);
  });

  it('rejects a phone number already registered, whatever its formatting', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { fullName: 'Someone Else', phone: '+216 20-555-042', password: 'password-123' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('PHONE_TAKEN');
  });

  it('reports invalid fields', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { fullName: 'Nour', phone: '123', password: 'short' },
    });
    expect(res.statusCode).toBe(400);
    const { error } = res.json();
    expect(error.code).toBe('VALIDATION');
    expect(error.details.map((d: { path: string[] }) => d.path[0])).toEqual(expect.arrayContaining(['phone', 'password']));
  });

  it('signs in with the right password only', async () => {
    const wrong = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { phone: '20555042', password: 'nope-nope' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe('INVALID_CREDENTIALS');

    const unknown = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { phone: '20999999', password: 'password-123' },
    });
    expect(unknown.statusCode).toBe(401);

    const ok = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { phone: '20555042', password: 'password-123' },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('requires a token for member routes', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('revokes other sessions when the password changes', async () => {
    const { token } = await register(t.app, 'Yasmine M.');
    const changed = await t.app.inject({
      method: 'POST',
      url: '/api/v1/me/password',
      headers: bearer(token),
      payload: { currentPassword: 'password-123', newPassword: 'new-password-456' },
    });
    expect(changed.statusCode).toBe(200);
    const fresh = changed.json<AuthResponse>().token;

    expect((await t.app.inject({ method: 'GET', url: '/api/v1/me', headers: bearer(token) })).statusCode).toBe(401);
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/me', headers: bearer(fresh) })).statusCode).toBe(200);
  });

  it('creates the bootstrap admin as an active member with badge #1', async () => {
    const token = await adminToken(t.app);
    const me = (await t.app.inject({ method: 'GET', url: '/api/v1/me', headers: bearer(token) })).json<User>();
    expect(me).toMatchObject({ role: 'admin', status: 'active', badgeNumber: 1, hasAccess: true });
    expect(me.permissions).toContain('settings:manage');
  });

  it('serves public club info and OpenAPI docs', async () => {
    const info = await t.app.inject({ method: 'GET', url: '/api/v1/club/info' });
    expect(info.json()).toEqual({ currency: 'DT', entryFee: 20_000, duesAmount: 5_000, duesPeriodMonths: 3 });

    const docs = await t.app.inject({ method: 'GET', url: '/api/docs/json' });
    expect(docs.statusCode).toBe(200);
    expect(Object.keys(docs.json().paths)).toContain('/api/v1/meetups/{id}');
  });
});
