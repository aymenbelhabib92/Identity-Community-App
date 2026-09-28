import type { AdminPayment, ClubInfo, Membership, Notification, Payment, User } from '@identity/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activeMember,
  adminToken,
  bearer,
  createTestApp,
  multipart,
  PNG,
  register,
  type TestContext,
} from './helpers';

let t: TestContext;
let admin: string;

beforeAll(async () => {
  t = await createTestApp(); // Monday 28 Sep 2026, Q3
  admin = await adminToken(t.app);
});
afterAll(() => t.close());

const getMembership = async (token: string) =>
  (await t.app.inject({ method: 'GET', url: '/api/v1/membership', headers: bearer(token) })).json<Membership>();

const submit = (token: string, fields: Record<string, string>, file?: Parameters<typeof multipart>[1]) => {
  const form = multipart(fields, file);
  return t.app.inject({
    method: 'POST',
    url: '/api/v1/payments',
    headers: { ...bearer(token), ...form.headers },
    payload: form.payload,
  });
};

const review = (paymentId: string, decision: 'verify' | 'reject', note?: string) =>
  t.app.inject({
    method: 'POST',
    url: `/api/v1/admin/payments/${paymentId}/review`,
    headers: bearer(admin),
    payload: { decision, note },
  });

describe('entry fee', () => {
  let member: string;
  let paymentId: string;

  beforeAll(async () => {
    member = (await register(t.app, 'Karim Ben Salah')).token;
  });

  it('starts unpaid, without dues to pay', async () => {
    const membership = await getMembership(member);
    expect(membership.entryFeeStatus).toBe('unpaid');
    expect(membership.duesOptions).toEqual([]);
    expect(membership.fees).toMatchObject({ entryFee: 20_000, duesAmount: 5_000, duesPeriodMonths: 3, yearlyDues: 20_000 });
  });

  it('rejects files that are not images or PDFs', async () => {
    const res = await submit(
      member,
      { kind: 'entry_fee', method: 'proof' },
      { name: 'proof.png', type: 'image/png', data: Buffer.from('definitely not an image') },
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details[0].path).toEqual(['file']);
  });

  it('accepts a proof upload, once', async () => {
    const res = await submit(
      member,
      { kind: 'entry_fee', method: 'proof', note: 'D17 transfer' },
      { name: 'receipt.png', type: 'image/png', data: PNG },
    );
    expect(res.statusCode).toBe(201);
    const payment = res.json<Payment>();
    expect(payment).toMatchObject({ kind: 'entry_fee', label: 'Entry fee & badge', amount: 20_000, status: 'pending', hasProof: true });
    paymentId = payment.id;

    const again = await submit(member, { kind: 'entry_fee', method: 'in_person' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('ENTRY_FEE_PENDING');
  });

  it('notifies reviewers and shows the proof to them only', async () => {
    const notifications = await t.app.inject({ method: 'GET', url: '/api/v1/notifications', headers: bearer(admin) });
    expect(notifications.json<{ items: Notification[] }>().items.map((n) => n.title)).toContain('Payment proof to review');

    const queue = await t.app.inject({ method: 'GET', url: '/api/v1/admin/payments', headers: bearer(admin) });
    expect(queue.json<{ items: AdminPayment[] }>().items.map((p) => p.id)).toContain(paymentId);

    const proof = await t.app.inject({ method: 'GET', url: `/api/v1/payments/${paymentId}/proof`, headers: bearer(admin) });
    expect(proof.statusCode).toBe(200);
    expect(proof.headers['content-type']).toBe('image/png');

    const stranger = (await register(t.app, 'Curious Member')).token;
    const denied = await t.app.inject({ method: 'GET', url: `/api/v1/payments/${paymentId}/proof`, headers: bearer(stranger) });
    expect(denied.statusCode).toBe(404);
    const noQueue = await t.app.inject({ method: 'GET', url: '/api/v1/admin/payments', headers: bearer(stranger) });
    expect(noQueue.statusCode).toBe(403);
  });

  it('activates the membership when verified: badge and first quarter covered', async () => {
    const res = await review(paymentId, 'verify');
    expect(res.statusCode).toBe(200);
    expect(res.json<AdminPayment>().member.state).toBe('active');

    const membership = await getMembership(member);
    expect(membership.member).toMatchObject({ status: 'active', state: 'active', badgeNumber: 2, paidUntil: '2026-09-30' });
    expect(membership.entryFeeStatus).toBe('paid');
    expect(membership.duesOptions[0]).toMatchObject({ periods: 1, label: 'Q4 2026', amount: 5_000 });
    expect(membership.duesOptions).toHaveLength(4);
    expect(membership.duesOptions[3]).toMatchObject({ label: 'Q4 2026 – Q3 2027', amount: 20_000, periodEnd: '2027-09-30' });

    const again = await review(paymentId, 'verify');
    expect(again.statusCode).toBe(409);
  });

  it('extends coverage with dues, counting payments still under review', async () => {
    const res = await submit(member, { kind: 'dues', method: 'in_person', periods: '2' });
    expect(res.statusCode).toBe(201);
    const payment = res.json<Payment>();
    expect(payment).toMatchObject({ label: 'Q4 2026 – Q1 2027 dues', amount: 10_000, status: 'pending' });

    // The next option starts after what is pending.
    expect((await getMembership(member)).duesOptions[0]?.label).toBe('Q2 2027');

    await review(payment.id, 'verify');
    expect((await getMembership(member)).member.paidUntil).toBe('2027-03-31');
  });

  it('expires after the grace period and loses member access', async () => {
    t.clock.current = new Date('2027-04-10T12:00:00Z');
    let me = (await t.app.inject({ method: 'GET', url: '/api/v1/me', headers: bearer(member) })).json<User>();
    expect(me.state).toBe('due');
    expect(me.hasAccess).toBe(true);

    t.clock.current = new Date('2027-04-20T12:00:00Z');
    me = (await t.app.inject({ method: 'GET', url: '/api/v1/me', headers: bearer(member) })).json<User>();
    expect(me.state).toBe('expired');
    expect(me.hasAccess).toBe(false);
    const map = await t.app.inject({ method: 'GET', url: '/api/v1/map/members', headers: bearer(member) });
    expect(map.statusCode).toBe(403);

    // Coming back later restarts from the current quarter: missed quarters are not charged.
    t.clock.current = new Date('2027-08-01T12:00:00Z');
    expect((await getMembership(member)).duesOptions[0]?.label).toBe('Q3 2027');
    t.clock.current = new Date('2026-09-28T16:00:00Z');
  });
});

describe('rejections and in-person payments', () => {
  it('lets the member try again after a rejected proof', async () => {
    const { token } = await register(t.app, 'Walid Z.');
    const first = await submit(token, { kind: 'entry_fee', method: 'proof' }, { name: 'r.png', type: 'image/png', data: PNG });
    await review(first.json<Payment>().id, 'reject', 'Amount does not match');

    const membership = await getMembership(token);
    expect(membership.entryFeeStatus).toBe('unpaid');
    expect(membership.payments[0]).toMatchObject({ status: 'rejected', reviewNote: 'Amount does not match' });
    expect(membership.payments[0]?.reviewedBy?.role).toBe('admin');

    const retry = await submit(token, { kind: 'entry_fee', method: 'in_person' });
    expect(retry.statusCode).toBe(201);
  });

  it('records a payment received in person as verified', async () => {
    const { user } = await register(t.app, 'Nour R.');
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/v1/admin/members/${user.id}/payments`,
      headers: bearer(admin),
      payload: { kind: 'entry_fee', note: 'Cash at Coffee & Cars' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<Payment>()).toMatchObject({ status: 'verified', method: 'in_person' });

    const member = await t.app.inject({ method: 'GET', url: `/api/v1/admin/members/${user.id}`, headers: bearer(admin) });
    expect(member.json<Membership>().member.state).toBe('active');
  });

  it('refuses dues before the membership is active', async () => {
    const { token } = await register(t.app, 'Early Bird');
    const res = await submit(token, { kind: 'dues', method: 'in_person' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ENTRY_FEE_FIRST');
  });
});

describe('admin', () => {
  it('only lets admins change roles, and not their own', async () => {
    const organizer = await activeMember(t.app, admin, 'Sami Kacem', 'organizer');
    const target = await activeMember(t.app, admin, 'Ahmed H.');

    const denied = await t.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/members/${target.id}`,
      headers: bearer(organizer.token),
      payload: { role: 'admin' },
    });
    expect(denied.statusCode).toBe(403);

    const me = (await t.app.inject({ method: 'GET', url: '/api/v1/me', headers: bearer(admin) })).json<User>();
    const self = await t.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/members/${me.id}`,
      headers: bearer(admin),
      payload: { role: 'member' },
    });
    expect(self.statusCode).toBe(400);
  });

  it('suspends a member, which removes their access', async () => {
    const member = await activeMember(t.app, admin, 'Rule Breaker');
    const res = await t.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/members/${member.id}`,
      headers: bearer(admin),
      payload: { status: 'suspended' },
    });
    expect(res.statusCode).toBe(200);
    const me = (await t.app.inject({ method: 'GET', url: '/api/v1/me', headers: bearer(member.token) })).json<User>();
    expect(me).toMatchObject({ state: 'suspended', hasAccess: false });
  });

  it('updates fees, which apply to new payments', async () => {
    const res = await t.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      headers: bearer(admin),
      payload: { entryFee: 25_000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ entryFee: 25_000, duesAmount: 5_000 });

    const info = await t.app.inject({ method: 'GET', url: '/api/v1/club/info' });
    expect(info.json<ClubInfo>().entryFee).toBe(25_000);
  });

  it('resets a forgotten password and signs the member out', async () => {
    const member = await activeMember(t.app, admin, 'Forgetful Member');
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/v1/admin/members/${member.id}/reset-password`,
      headers: bearer(admin),
    });
    expect(res.statusCode).toBe(200);
    const { temporaryPassword } = res.json<{ temporaryPassword: string }>();
    expect(temporaryPassword).toHaveLength(10);

    expect((await t.app.inject({ method: 'GET', url: '/api/v1/me', headers: bearer(member.token) })).statusCode).toBe(401);
    const me = (await t.app.inject({ method: 'GET', url: `/api/v1/admin/members/${member.id}`, headers: bearer(admin) })).json<Membership>();
    const signIn = await t.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { phone: me.member.phone, password: temporaryPassword },
    });
    expect(signIn.statusCode).toBe(200);
  });

  it('counts members by state', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/admin/overview', headers: bearer(admin) });
    const overview = res.json();
    expect(overview.pendingPayments).toBeGreaterThanOrEqual(1);
    expect(overview.suspendedMembers).toBe(1);
    expect(overview.totalMembers).toBeGreaterThan(5);
  });
});
