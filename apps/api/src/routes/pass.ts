import {
  passTokenSchema,
  passVerificationSchema,
  passVerifyBodySchema,
  translate,
  type MembershipState,
} from '@identity/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { conflict } from '../errors';
import { requirePermission } from '../plugins/auth';
import { findUser, stateOf } from '../services/users';
import type { AccessTokenPayload, PassTokenPayload } from '../types';

const PASS_TTL_MINUTES = 10;

const REFUSAL: Partial<Record<MembershipState, string>> = {
  pending: 'Membership not confirmed yet.',
  expired: 'Dues expired.',
  suspended: 'Membership suspended.',
  banned: 'Member banned.',
  rejected: 'Not a member.',
};

/**
 * Member pass check-in: the pass shows a QR code holding a short-lived signed
 * token; an organizer scans it and the app verifies it here.
 */
export const passRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/pass/token',
    {
      schema: {
        tags: ['pass'],
        summary: 'Short-lived token for my pass QR code',
        description: `Valid ${PASS_TTL_MINUTES} minutes, so a screenshot of the code cannot be reused later.`,
        response: { 200: passTokenSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      if (viewer.user.badgeNumber === null) {
        throw conflict('NO_BADGE', 'Your badge is issued once your membership is confirmed.');
      }
      const payload: PassTokenPayload = { sub: viewer.id, typ: 'pass' };
      return {
        token: app.jwt.sign(payload, { expiresIn: `${PASS_TTL_MINUTES}m` }),
        expiresAt: new Date(Date.now() + PASS_TTL_MINUTES * 60_000).toISOString(),
      };
    },
  );

  app.post(
    '/pass/verify',
    {
      preHandler: requirePermission('pass:verify'),
      schema: {
        tags: ['pass'],
        summary: 'Check a scanned pass (organizers)',
        body: passVerifyBodySchema,
        response: { 200: passVerificationSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const tr = (text: string) => translate(viewer.lang, text);
      let payload: AccessTokenPayload | PassTokenPayload;
      try {
        payload = app.jwt.verify<AccessTokenPayload | PassTokenPayload>(request.body.token);
      } catch (err) {
        const code = (err as { code?: string }).code ?? '';
        const expired = code.includes('EXPIRED');
        return {
          valid: false,
          reason: tr(
            expired ? 'This code has expired. Ask the member to open their pass again.' : 'This is not a valid Identity pass.',
          ),
          member: null,
        };
      }
      const user = payload.typ === 'pass' ? await findUser(app.db, payload.sub) : undefined;
      if (!user) return { valid: false, reason: tr('This is not a valid Identity pass.'), member: null };

      const { state, hasAccess } = stateOf(user, viewer.settings, viewer.today, viewer.now);
      const warning = state === 'due' ? tr('Dues are due: remind them to pay.') : null;
      return {
        valid: hasAccess,
        reason: hasAccess ? warning : tr(REFUSAL[state] ?? 'Not active.'),
        member: {
          id: user.id,
          fullName: user.fullName,
          role: user.role,
          avatar: user.avatarPhotoId,
          badgeNumber: user.badgeNumber,
          state,
          paidUntil: user.paidUntil,
          car: user.car,
          carPhotos: user.carPhotoIds,
        },
      };
    },
  );
};
