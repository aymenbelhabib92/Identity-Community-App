import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AuthResponse, Role } from '@identity/shared';
import { buildApp, type App } from '../src/app';
import type { PushTransport } from '../src/services/push';

export const ADMIN = { phone: '+21690000001', password: 'admin-pass-123' };

/** 1×1 PNG, a valid proof image. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

export interface TestContext {
  app: App;
  clock: { current: Date };
  close(): Promise<void>;
}

/**
 * With TEST_DATABASE_URL set, tests run against that PostgreSQL server instead
 * (wiped before each test file — run with --no-file-parallelism).
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL || null;

async function wipeDatabase(url: string): Promise<void> {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await client.end();
}

/** A fresh API on an in-memory Postgres (PGlite), with a controllable clock. */
export async function createTestApp(
  now = new Date('2026-09-28T16:00:00Z'),
  options: { pushTransport?: PushTransport } = {},
): Promise<TestContext> {
  const clock = { current: now };
  const uploadDir = await mkdtemp(path.join(os.tmpdir(), 'identity-test-'));
  if (testDatabaseUrl) await wipeDatabase(testDatabaseUrl);
  const app = await buildApp({
    config: {
      env: 'test',
      logLevel: 'silent',
      databaseUrl: testDatabaseUrl,
      pgliteDir: null,
      uploadDir,
      migrationsDir: path.resolve('drizzle'),
      bootstrapAdmin: { ...ADMIN, name: 'Test Admin' },
    },
    now: () => clock.current,
    // No real push service in tests: sending succeeds without leaving the machine.
    pushTransport: options.pushTransport ?? (async () => {}),
  });
  return {
    app,
    clock,
    async close() {
      await app.close();
      await rm(uploadDir, { recursive: true, force: true });
    },
  };
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

let phoneCounter = 20_000_100;

export async function register(app: App, fullName = 'Test Member', phone = String(phoneCounter++)) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { fullName, phone, password: 'password-123', car: 'Golf 7 GTI, 2018' },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.body}`);
  return res.json<AuthResponse>();
}

export async function login(app: App, phone: string, password: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { phone, password } });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.body}`);
  return res.json<AuthResponse>().token;
}

export const adminToken = (app: App) => login(app, ADMIN.phone, ADMIN.password);

/** Registers a member and has the admin activate them (and optionally give them a role). */
export async function activeMember(app: App, admin: string, fullName = 'Active Member', role?: Role) {
  const { token, user } = await register(app, fullName);
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/v1/admin/members/${user.id}`,
    headers: bearer(admin),
    payload: { status: 'active', ...(role && { role }) },
  });
  if (res.statusCode !== 200) throw new Error(`activation failed: ${res.body}`);
  return { token, id: user.id };
}

/** Builds a multipart/form-data body for `inject`. */
export function multipart(fields: Record<string, string>, file?: { name: string; type: string; data: Buffer }) {
  const boundary = `----identity${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`,
      ),
      file.data,
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
