import type { PushKey, PushTestResult } from '@identity/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PushMessage, PushTransport } from '../src/services/push';
import { activeMember, adminToken, bearer, createTestApp, type TestContext } from './helpers';

let t: TestContext;
let admin: string;
let karim: { token: string; id: string };
let yasmine: { token: string; id: string };

/** Push services seen by the fake transport; endpoints in `gone` answer 410. */
const sent: { endpoint: string; message: PushMessage }[] = [];
const gone = new Set<string>();
const transport: PushTransport = async (target, payload) => {
  if (gone.has(target.endpoint)) throw Object.assign(new Error('Gone'), { statusCode: 410 });
  sent.push({ endpoint: target.endpoint, message: JSON.parse(payload) as PushMessage });
};

const PHONE = 'https://fcm.googleapis.com/fcm/send/karim-phone';
const LAPTOP = 'https://updates.push.services.mozilla.com/wpush/v2/karim-laptop';
const keys = { p256dh: 'BOr8gQp3UyB2eXmDk7xY0N4bJ1aFVd6Lq9sZtR3wHc0', auth: 'c2VjcmV0LWF1dGg' };

beforeAll(async () => {
  t = await createTestApp(undefined, { pushTransport: transport });
  admin = await adminToken(t.app);
  karim = await activeMember(t.app, admin, 'Karim Ben Salah');
  yasmine = await activeMember(t.app, admin, 'Yasmine M.');
});
afterAll(() => t.close());
beforeEach(() => {
  sent.length = 0;
});

const call = (token: string, method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, payload?: object) =>
  t.app.inject({ method, url: `/api/v1${url}`, headers: bearer(token), payload });
const subscribe = (token: string, endpoint: string) => call(token, 'PUT', '/push/subscription', { endpoint, keys });

/** The admin records dues paid in person by `memberId`: the member is notified. */
async function notifyMember(memberId: string) {
  const res = await call(admin, 'POST', `/admin/members/${memberId}/payments`, { kind: 'dues', periods: 1 });
  expect(res.statusCode).toBe(201);
  await t.app.push.flush();
}

describe('push notifications', () => {
  it('give out the public key to subscribe with', async () => {
    const { publicKey } = (await call(karim.token, 'GET', '/push/key')).json<PushKey>();
    expect(publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
  });

  it('only accept the push services of the browsers', async () => {
    for (const endpoint of ['https://evil.example/collect', 'https://192.168.1.10/push', 'http://fcm.googleapis.com/fcm/send/x']) {
      expect((await subscribe(karim.token, endpoint)).statusCode).toBe(400);
    }
  });

  it('reach every device of the member, in the member’s language', async () => {
    expect((await subscribe(karim.token, PHONE)).statusCode).toBe(200);
    expect((await subscribe(karim.token, LAPTOP)).statusCode).toBe(200);
    await t.app.inject({ method: 'PATCH', url: '/api/v1/me', headers: bearer(karim.token), payload: { language: 'fr' } });

    await notifyMember(karim.id);
    expect(sent.map((s) => s.endpoint).sort()).toEqual([LAPTOP, PHONE].sort());
    expect(sent[0]!.message).toMatchObject({ kind: 'payment', title: 'Paiement enregistré', link: '/pass' });
  });

  it('move a device to the account that signs in on it', async () => {
    await subscribe(yasmine.token, PHONE);
    await notifyMember(karim.id);
    expect(sent.map((s) => s.endpoint)).toEqual([LAPTOP]);
    await notifyMember(yasmine.id);
    expect(sent.map((s) => s.endpoint)).toEqual([LAPTOP, PHONE]);
  });

  it('forget devices the push service no longer knows', async () => {
    gone.add(LAPTOP);
    await notifyMember(karim.id);
    expect(sent).toHaveLength(0);
    gone.delete(LAPTOP);
    await notifyMember(karim.id);
    expect(sent).toHaveLength(0); // the subscription was deleted
  });

  it('send a test notification on request', async () => {
    const res = await call(yasmine.token, 'POST', '/push/test');
    expect(res.json<PushTestResult>()).toEqual({ devices: 1 });
    expect(sent[0]).toMatchObject({ endpoint: PHONE, message: { kind: 'test', title: 'Notifications are on' } });
  });

  it('stop when the member turns them off or signs out everywhere', async () => {
    await subscribe(karim.token, LAPTOP);
    expect((await call(karim.token, 'DELETE', '/push/subscription', { endpoint: LAPTOP })).statusCode).toBe(200);
    await notifyMember(karim.id);
    expect(sent).toHaveLength(0);

    await call(yasmine.token, 'POST', '/auth/logout-all');
    await notifyMember(yasmine.id);
    expect(sent).toHaveLength(0);
  });
});
