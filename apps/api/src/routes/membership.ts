import { access } from 'node:fs/promises';
import {
  can,
  formatMoney,
  idParamsSchema,
  membershipSchema,
  okResponseSchema,
  paymentFormSchema,
  paymentSchema,
  PROOF_MIME_TYPES,
  shortName,
} from '@identity/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { fileTypeFromFile } from 'file-type';
import { payments } from '../db/schema';
import { AppError, badRequest, conflict, fieldError, isUniqueViolation, notFound, validationError } from '../errors';
import { buildMembership, paymentLabel, preparePayment, toPaymentDto } from '../services/membership';
import { notify } from '../services/notifications';
import { staffWith } from '../services/users';

const ACCEPTED_PROOFS: readonly string[] = PROOF_MIME_TYPES;

/** A member's own membership: status, fees, payments and proof uploads. */
export const membershipRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/membership',
    { schema: { tags: ['membership'], summary: 'My membership, fees and payments', response: { 200: membershipSchema } } },
    async (request) => buildMembership(app.db, request.viewer.user, request.viewer),
  );

  app.post(
    '/payments',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['membership'],
        summary: 'Submit a payment (proof upload or pay in person)',
        description:
          'multipart/form-data with fields `kind` (entry_fee | dues), `method` (proof | in_person), optional `periods` ' +
          '(dues paid at once) and `note`, and a `file` part (JPG, PNG, WEBP, HEIC or PDF, max 8 MB) when method is proof. ' +
          'The payment stays pending until the treasurer verifies it.',
        consumes: ['multipart/form-data'],
        response: { 201: paymentSchema },
      },
    },
    async (request, reply) => {
      const { viewer } = request;
      if (!request.isMultipart()) throw badRequest('MULTIPART_REQUIRED', 'Send the payment as multipart/form-data.');

      const fields: Record<string, string> = {};
      let upload: { key: string } | null = null;

      try {
        for await (const part of request.parts()) {
          if (part.type === 'file') {
            if (part.fieldname !== 'file' || upload) {
              for await (const _chunk of part.file); // drain unexpected files
              continue;
            }
            upload = await app.storage.save(part.file, 'proofs');
            if (part.file.truncated) throw new AppError(413, 'FILE_TOO_LARGE', 'The file is too large (max 8 MB).');
          } else if (typeof part.value === 'string') {
            fields[part.fieldname] = part.value;
          }
        }

        const parsed = paymentFormSchema.safeParse(fields);
        if (!parsed.success) throw validationError(parsed.error);
        const form = parsed.data;

        let proofMime: string | null = null;
        if (form.method === 'proof') {
          if (!upload) throw fieldError('file', 'Attach a photo or PDF of your payment.');
          const type = await fileTypeFromFile(app.storage.path(upload.key));
          if (!type || !ACCEPTED_PROOFS.includes(type.mime)) {
            throw fieldError('file', 'Upload a photo (JPG, PNG, WEBP, HEIC) or a PDF.');
          }
          proofMime = type.mime;
        } else if (upload) {
          await app.storage.remove(upload.key);
          upload = null;
        }

        const prepared = await preparePayment(app.db, viewer.user, viewer.settings, viewer.today, form);
        const [row] = await app.db
          .insert(payments)
          .values({
            userId: viewer.id,
            ...prepared,
            method: form.method,
            proofFile: upload?.key ?? null,
            proofMime,
            note: form.note || null,
          })
          .returning();

        const payment = row!;
        await notify(app, await staffWith(app.db, 'payments:review'), (tr, lang) => ({
          kind: 'payment_review',
          title: tr(form.method === 'proof' ? 'Payment proof to review' : 'In-person payment announced'),
          body: `${shortName(viewer.user.fullName)} · ${paymentLabel(payment, lang)} · ${formatMoney(payment.amount, viewer.settings.currency)}`,
          link: '/admin/payments',
        }));

        reply.code(201);
        return toPaymentDto(payment, null, viewer.lang);
      } catch (err) {
        if (upload) await app.storage.remove(upload.key);
        if (isUniqueViolation(err)) throw conflict('ENTRY_FEE_PENDING', 'The entry fee is already awaiting review.');
        throw err;
      }
    },
  );

  app.get(
    '/payments/:id/proof',
    {
      schema: {
        tags: ['membership'],
        summary: 'Download a payment proof (owner or treasurer)',
        params: idParamsSchema,
      },
    },
    async (request, reply) => {
      const { viewer } = request;
      const [row] = await app.db.select().from(payments).where(eq(payments.id, request.params.id)).limit(1);
      const allowed = row && (row.userId === viewer.id || (viewer.hasAccess && can(viewer.role, 'payments:review')));
      if (!row || !allowed || !row.proofFile) throw notFound('Proof');
      const file = app.storage.path(row.proofFile);
      try {
        await access(file);
      } catch {
        throw notFound('Proof');
      }
      return reply
        .header('Cache-Control', 'private, no-store')
        .header('Content-Disposition', 'inline')
        .type(row.proofMime ?? 'application/octet-stream')
        .send(app.storage.open(row.proofFile));
    },
  );

  app.delete(
    '/payments/:id',
    {
      schema: {
        tags: ['membership'],
        summary: 'Withdraw a payment that is still pending',
        params: idParamsSchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const [row] = await app.db
        .delete(payments)
        .where(and(eq(payments.id, request.params.id), eq(payments.userId, viewer.id), eq(payments.status, 'pending')))
        .returning();
      if (!row) throw notFound('Pending payment');
      if (row.proofFile) await app.storage.remove(row.proofFile);
      return { ok: true as const };
    },
  );
};
