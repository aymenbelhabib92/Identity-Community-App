import { normalizePhone, todayIn } from '@identity/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { users } from './db/schema';
import { hashPassword } from './lib/password';
import { activateMember } from './services/membership';

/**
 * Creates the first admin from ADMIN_PHONE / ADMIN_PASSWORD when the club has no
 * admin yet, so a fresh deployment can be administered right away.
 */
export async function ensureBootstrapAdmin(app: FastifyInstance): Promise<void> {
  const admin = app.config.bootstrapAdmin;
  if (!admin) return;

  const [existingAdmin] = await app.db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1);
  if (existingAdmin) return;

  const phone = normalizePhone(admin.phone);
  if (!phone) {
    app.log.warn('ADMIN_PHONE is not a valid phone number; no admin account created.');
    return;
  }

  const [existing] = await app.db.select().from(users).where(eq(users.phone, phone)).limit(1);
  const user =
    existing ??
    (
      await app.db
        .insert(users)
        .values({ fullName: admin.name, phone, passwordHash: await hashPassword(admin.password) })
        .returning()
    )[0]!;

  await app.db.update(users).set({ role: 'admin' }).where(eq(users.id, user.id));
  if (!user.approvedAt) {
    const settings = await app.clubSettings.get();
    const now = app.clock.now();
    await activateMember(app.db, user, settings, todayIn(app.config.timezone, now), now);
  }
  app.log.info({ phone }, existing ? 'Existing member promoted to admin' : 'Admin account created');
}
