import {
  adminMemberListSchema,
  adminMemberSchema,
  adminMembersQuerySchema,
  adminOverviewSchema,
  adminPaymentListSchema,
  adminPaymentSchema,
  adminPaymentsQuerySchema,
  clubSettingsSchema,
  clubSettingsUpdateSchema,
  formatBadgeNumber,
  formatIsoDate,
  formatMoney,
  idParamsSchema,
  isStaff,
  membershipSchema,
  passwordResetSchema,
  paymentSchema,
  recordPaymentBodySchema,
  reviewPaymentBodySchema,
  ROLE_LABELS,
  updateMemberBodySchema,
  type AdminMember,
  type AdminPayment,
  type ClubSettings,
  type IsoDate,
  type MemberFilter,
  type MemberRef,
} from '@identity/shared';
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { DbOrTx } from '../db/client';
import { memberLocations, payments, users, type PaymentRow, type UserRow } from '../db/schema';
import { badRequest, conflict, notFound } from '../errors';
import { generateTemporaryPassword, hashPassword } from '../lib/password';
import { requirePermission } from '../plugins/auth';
import {
  activateMember,
  applyVerifiedPayment,
  buildMembership,
  paymentLabel,
  preparePayment,
  reviewers,
  toPaymentDto,
} from '../services/membership';
import { notify } from '../services/notifications';
import { findUser, stateOf, toMemberRef, toUserDto } from '../services/users';

function matchesFilter(member: AdminMember, filter: MemberFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'staff':
      return isStaff(member.role);
    default:
      return member.state === filter;
  }
}

async function pendingPaymentCounts(db: DbOrTx, userId?: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ userId: payments.userId, count: sql<number>`count(*)::int` })
    .from(payments)
    .where(userId ? and(eq(payments.status, 'pending'), eq(payments.userId, userId)) : eq(payments.status, 'pending'))
    .groupBy(payments.userId);
  return new Map(rows.map((row) => [row.userId, Number(row.count)]));
}

async function toAdminMember(db: DbOrTx, user: UserRow, settings: ClubSettings, today: IsoDate): Promise<AdminMember> {
  const counts = await pendingPaymentCounts(db, user.id);
  return { ...toUserDto(user, settings, today), pendingPayments: counts.get(user.id) ?? 0 };
}

async function loadAdminPayment(
  db: DbOrTx,
  paymentId: string,
  settings: ClubSettings,
  today: IsoDate,
): Promise<AdminPayment | null> {
  const [row] = await db
    .select({
      payment: payments,
      member: users,
      reviewer: { id: reviewers.id, fullName: reviewers.fullName, role: reviewers.role },
    })
    .from(payments)
    .innerJoin(users, eq(payments.userId, users.id))
    .leftJoin(reviewers, eq(payments.reviewedById, reviewers.id))
    .where(eq(payments.id, paymentId))
    .limit(1);
  if (!row) return null;
  return toAdminPayment(row.payment, row.member, row.reviewer, settings, today);
}

function toAdminPayment(
  payment: PaymentRow,
  member: UserRow,
  reviewer: MemberRef | null,
  settings: ClubSettings,
  today: IsoDate,
): AdminPayment {
  return {
    ...toPaymentDto(payment, reviewer),
    member: {
      id: member.id,
      fullName: member.fullName,
      phone: member.phone,
      badgeNumber: member.badgeNumber,
      state: stateOf(member, settings, today).state,
    },
  };
}

/** Club administration: treasurer (payments), organizers (members overview), admins (roles, settings). */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/overview',
    {
      preHandler: requirePermission('members:view'),
      schema: { tags: ['admin'], summary: 'Membership counters', response: { 200: adminOverviewSchema } },
    },
    async (request) => {
      const { viewer } = request;
      const rows = await app.db.select({ status: users.status, role: users.role, paidUntil: users.paidUntil }).from(users);
      const overview = {
        totalMembers: 0,
        pendingMembers: 0,
        activeMembers: 0,
        dueMembers: 0,
        expiredMembers: 0,
        suspendedMembers: 0,
        pendingPayments: 0,
      };
      for (const row of rows) {
        const { state } = stateOf(row, viewer.settings, viewer.today);
        if (state === 'rejected') continue;
        overview.totalMembers++;
        if (state === 'pending') overview.pendingMembers++;
        else if (state === 'active') overview.activeMembers++;
        else if (state === 'due') overview.dueMembers++;
        else if (state === 'expired') overview.expiredMembers++;
        else if (state === 'suspended') overview.suspendedMembers++;
      }
      const [pending] = await app.db
        .select({ count: sql<number>`count(*)::int` })
        .from(payments)
        .where(eq(payments.status, 'pending'));
      overview.pendingPayments = Number(pending?.count ?? 0);
      return overview;
    },
  );

  // ─── Payments ────────────────────────────────────────────────────────────

  app.get(
    '/payments',
    {
      preHandler: requirePermission('payments:review'),
      schema: {
        tags: ['admin'],
        summary: 'Payments to review (oldest first) or history',
        querystring: adminPaymentsQuerySchema,
        response: { 200: adminPaymentListSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const { status, limit } = request.query;
      const rows = await app.db
        .select({
          payment: payments,
          member: users,
          reviewer: { id: reviewers.id, fullName: reviewers.fullName, role: reviewers.role },
        })
        .from(payments)
        .innerJoin(users, eq(payments.userId, users.id))
        .leftJoin(reviewers, eq(payments.reviewedById, reviewers.id))
        .where(status === 'all' ? undefined : eq(payments.status, status))
        .orderBy(status === 'pending' ? asc(payments.createdAt) : desc(payments.createdAt))
        .limit(limit);
      return {
        items: rows.map((row) =>
          toAdminPayment(row.payment, row.member, row.reviewer as MemberRef | null, viewer.settings, viewer.today),
        ),
      };
    },
  );

  app.post(
    '/payments/:id/review',
    {
      preHandler: requirePermission('payments:review'),
      schema: {
        tags: ['admin'],
        summary: 'Verify or reject a pending payment',
        description: 'Verifying the entry fee activates the membership and assigns a badge; verifying dues extends it.',
        params: idParamsSchema,
        body: reviewPaymentBodySchema,
        response: { 200: adminPaymentSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const { decision, note } = request.body;

      const payment = await app.db.transaction(async (tx) => {
        const [row] = await tx
          .update(payments)
          .set({
            status: decision === 'verify' ? 'verified' : 'rejected',
            reviewNote: note || null,
            reviewedById: viewer.id,
            reviewedAt: viewer.now,
          })
          .where(and(eq(payments.id, request.params.id), eq(payments.status, 'pending')))
          .returning();
        if (!row) {
          const [existing] = await tx
            .select({ id: payments.id })
            .from(payments)
            .where(eq(payments.id, request.params.id))
            .limit(1);
          throw existing ? conflict('ALREADY_REVIEWED', 'This payment has already been reviewed.') : notFound('Payment');
        }
        if (decision === 'verify') await applyVerifiedPayment(tx, row, viewer.settings, viewer.today, viewer.now);
        return row;
      });

      const member = await findUser(app.db, payment.userId);
      const label = paymentLabel(payment);
      if (decision === 'reject') {
        await notify(app.db, [payment.userId], {
          kind: 'payment',
          title: 'Payment not accepted',
          body: note ? `${label} · ${note}` : `${label} · Contact the treasurer for details.`,
          link: '/pass',
        });
      } else if (payment.kind === 'entry_fee') {
        await notify(app.db, [payment.userId], {
          kind: 'membership',
          title: 'Welcome to Identity',
          body: `Your membership is active. Badge ${formatBadgeNumber(member?.badgeNumber)}.`,
          link: '/pass',
        });
      } else {
        await notify(app.db, [payment.userId], {
          kind: 'payment',
          title: 'Payment verified',
          body: member?.paidUntil ? `${label} · valid until ${formatIsoDate(member.paidUntil)}` : label,
          link: '/pass',
        });
      }

      return (await loadAdminPayment(app.db, payment.id, viewer.settings, viewer.today))!;
    },
  );

  // ─── Members ─────────────────────────────────────────────────────────────

  app.get(
    '/members',
    {
      preHandler: requirePermission('members:view'),
      schema: {
        tags: ['admin'],
        summary: 'Members, pending requests first',
        querystring: adminMembersQuerySchema,
        response: { 200: adminMemberListSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const { q, filter } = request.query;
      let where: SQL | undefined;
      if (q) {
        const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        const digits = q.replace(/\D/g, '');
        where = digits.length >= 2 ? or(ilike(users.fullName, pattern), ilike(users.phone, `%${digits}%`)) : ilike(users.fullName, pattern);
      }
      const rows = await app.db.select().from(users).where(where).orderBy(asc(users.fullName));
      const counts = await pendingPaymentCounts(app.db);
      const items = rows
        .map((user) => ({ ...toUserDto(user, viewer.settings, viewer.today), pendingPayments: counts.get(user.id) ?? 0 }))
        .filter((member) => matchesFilter(member, filter))
        .sort((a, b) => Number(b.state === 'pending') - Number(a.state === 'pending'));
      return { items };
    },
  );

  app.get(
    '/members/:id',
    {
      preHandler: requirePermission('members:view'),
      schema: {
        tags: ['admin'],
        summary: "A member's membership and payments",
        params: idParamsSchema,
        response: { 200: membershipSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const member = await findUser(app.db, request.params.id);
      if (!member) throw notFound('Member');
      return buildMembership(app.db, member, viewer.settings, viewer.today);
    },
  );

  app.patch(
    '/members/:id',
    {
      preHandler: requirePermission('members:manage'),
      schema: {
        tags: ['admin'],
        summary: 'Change role or status',
        description:
          'status=active approves a pending request without payment (e.g. founding members) or lifts a suspension; ' +
          'suspended hides the member and removes their shared position; rejected declines a pending request.',
        params: idParamsSchema,
        body: updateMemberBodySchema,
        response: { 200: adminMemberSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const { role, status } = request.body;
      const target = await findUser(app.db, request.params.id);
      if (!target) throw notFound('Member');
      if (target.id === viewer.id) {
        throw badRequest('CANNOT_CHANGE_SELF', 'Ask another admin to change your own role or status.');
      }

      const roleChanged = role !== undefined && role !== target.role;
      const statusChanged = status !== undefined && status !== target.status;

      await app.db.transaction(async (tx) => {
        if (roleChanged) await tx.update(users).set({ role }).where(eq(users.id, target.id));
        if (!statusChanged) return;
        switch (status) {
          case 'active':
            if (target.approvedAt) await tx.update(users).set({ status: 'active' }).where(eq(users.id, target.id));
            else await activateMember(tx, target, viewer.settings, viewer.today, viewer.now);
            break;
          case 'suspended':
            if (target.status !== 'active') throw conflict('INVALID_STATUS', 'Only active members can be suspended.');
            await tx.update(users).set({ status: 'suspended', locationSharing: false }).where(eq(users.id, target.id));
            await tx.delete(memberLocations).where(eq(memberLocations.userId, target.id));
            break;
          case 'rejected':
            if (target.status !== 'pending') throw conflict('INVALID_STATUS', 'Only pending requests can be declined.');
            await tx.update(users).set({ status: 'rejected' }).where(eq(users.id, target.id));
            await tx
              .update(payments)
              .set({ status: 'rejected', reviewNote: 'Membership request declined', reviewedById: viewer.id, reviewedAt: viewer.now })
              .where(and(eq(payments.userId, target.id), eq(payments.status, 'pending')));
            break;
          case 'pending':
            throw badRequest('INVALID_STATUS', 'A member cannot be moved back to pending.');
        }
      });

      const updated = (await findUser(app.db, target.id))!;
      if (roleChanged) {
        await notify(app.db, [target.id], {
          kind: 'role',
          title: `You are now ${ROLE_LABELS[updated.role]}`,
          body: isStaff(updated.role) ? 'New tools are available in the Admin section of your profile.' : null,
          link: '/profile',
        });
      }
      if (statusChanged) {
        const messages = {
          active: target.approvedAt
            ? { title: 'Membership reactivated', body: null }
            : { title: 'Welcome to Identity', body: `Your membership is active. Badge ${formatBadgeNumber(updated.badgeNumber)}.` },
          suspended: { title: 'Membership suspended', body: 'Contact an admin for details.' },
          rejected: { title: 'Membership request declined', body: 'Contact the club for details.' },
          pending: null,
        } as const;
        const message = messages[updated.status];
        if (message) await notify(app.db, [target.id], { kind: 'membership', ...message, link: '/pass' });
      }

      return toAdminMember(app.db, updated, viewer.settings, viewer.today);
    },
  );

  app.post(
    '/members/:id/payments',
    {
      preHandler: requirePermission('payments:review'),
      schema: {
        tags: ['admin'],
        summary: 'Record a payment received in person (verified immediately)',
        params: idParamsSchema,
        body: recordPaymentBodySchema,
        response: { 201: paymentSchema },
      },
    },
    async (request, reply) => {
      const { viewer } = request;
      const target = await findUser(app.db, request.params.id);
      if (!target) throw notFound('Member');

      const payment = await app.db.transaction(async (tx) => {
        const prepared = await preparePayment(tx, target, viewer.settings, viewer.today, request.body);
        const [row] = await tx
          .insert(payments)
          .values({
            userId: target.id,
            ...prepared,
            method: 'in_person',
            status: 'verified',
            note: request.body.note || null,
            reviewedById: viewer.id,
            reviewedAt: viewer.now,
          })
          .returning();
        await applyVerifiedPayment(tx, row!, viewer.settings, viewer.today, viewer.now);
        return row!;
      });

      const member = await findUser(app.db, target.id);
      await notify(app.db, [target.id], {
        kind: payment.kind === 'entry_fee' ? 'membership' : 'payment',
        title: payment.kind === 'entry_fee' ? 'Welcome to Identity' : 'Payment recorded',
        body:
          payment.kind === 'entry_fee'
            ? `Your membership is active. Badge ${formatBadgeNumber(member?.badgeNumber)}.`
            : `${paymentLabel(payment)} · ${formatMoney(payment.amount, viewer.settings.currency)} paid in person`,
        link: '/pass',
      });

      reply.code(201);
      return toPaymentDto(payment, toMemberRef(viewer.user));
    },
  );

  app.post(
    '/members/:id/reset-password',
    {
      preHandler: requirePermission('members:manage'),
      schema: {
        tags: ['admin'],
        summary: 'Give a member a temporary password',
        description: 'Signs the member out on every device. The temporary password is only returned once.',
        params: idParamsSchema,
        response: { 200: passwordResetSchema },
      },
    },
    async (request) => {
      const target = await findUser(app.db, request.params.id);
      if (!target) throw notFound('Member');
      if (target.id === request.viewer.id) {
        throw badRequest('CANNOT_CHANGE_SELF', 'Change your own password from your profile.');
      }
      const temporaryPassword = generateTemporaryPassword();
      await app.db
        .update(users)
        .set({ passwordHash: await hashPassword(temporaryPassword), tokenVersion: sql`${users.tokenVersion} + 1` })
        .where(eq(users.id, target.id));
      return { temporaryPassword };
    },
  );

  // ─── Settings ────────────────────────────────────────────────────────────

  app.get(
    '/settings',
    {
      preHandler: requirePermission('settings:manage'),
      schema: { tags: ['admin'], summary: 'Club settings', response: { 200: clubSettingsSchema } },
    },
    async () => app.clubSettings.get(),
  );

  app.patch(
    '/settings',
    {
      preHandler: requirePermission('settings:manage'),
      schema: {
        tags: ['admin'],
        summary: 'Update club settings (fees, dues period, rules…)',
        description: 'Amounts are in millimes (20 DT = 20000). New fees apply to payments submitted afterwards.',
        body: clubSettingsUpdateSchema,
        response: { 200: clubSettingsSchema },
      },
    },
    async (request) => app.clubSettings.update(request.body),
  );
};
