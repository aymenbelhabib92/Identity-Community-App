import { existsSync } from 'node:fs';
import path from 'node:path';

export interface Config {
  env: 'development' | 'production' | 'test';
  host: string;
  port: number;
  /** PostgreSQL URL. When null, the embedded PGlite database is used. */
  databaseUrl: string | null;
  /** PGlite data directory; null keeps the database in memory (tests). */
  pgliteDir: string | null;
  migrationsDir: string;
  uploadDir: string;
  jwtSecret: string;
  tokenTtl: string;
  /** Club time zone: dues periods and "today" are computed in it. */
  timezone: string;
  corsOrigins: string[];
  trustProxy: boolean;
  logLevel: string;
  geocoder: { url: string; countryCodes: string; email: string | null };
  bootstrapAdmin: { phone: string; password: string; name: string } | null;
  /**
   * Web Push (VAPID). Without keys in the environment, a key pair is generated
   * once and kept in the database. The subject (site URL or mailto:) identifies
   * the sender to the push services.
   */
  vapid: { publicKey: string | null; privateKey: string | null; subject: string };
}

const DEV_JWT_SECRET = 'dev-only-secret-never-use-in-production-3f9a1c7e5b';

/** Loads ./.env when present (local development). */
export function loadEnvFile(): void {
  if (existsSync('.env')) process.loadEnvFile('.env');
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const env = process.env;
  const mode: Config['env'] =
    env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development';

  const jwtSecret = env.JWT_SECRET || (mode === 'production' ? '' : DEV_JWT_SECRET);
  if (mode === 'production' && jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
  }

  const bootstrapAdmin =
    env.ADMIN_PHONE && env.ADMIN_PASSWORD
      ? { phone: env.ADMIN_PHONE, password: env.ADMIN_PASSWORD, name: env.ADMIN_NAME || 'Club Admin' }
      : null;

  return {
    env: mode,
    host: env.HOST || '0.0.0.0',
    port: Number(env.PORT || 3000),
    databaseUrl: env.DATABASE_URL || null,
    pgliteDir: path.resolve(env.PGLITE_DIR || './data/pglite'),
    migrationsDir: path.resolve(env.MIGRATIONS_DIR || './drizzle'),
    uploadDir: path.resolve(env.UPLOAD_DIR || './data/uploads'),
    jwtSecret,
    tokenTtl: env.TOKEN_TTL || '30d',
    timezone: env.TZ || 'Africa/Tunis',
    corsOrigins: (env.CORS_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY === 'true' : mode === 'production',
    logLevel: env.LOG_LEVEL || (mode === 'test' ? 'silent' : 'info'),
    geocoder: {
      url: (env.GEOCODER_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, ''),
      countryCodes: env.GEOCODER_COUNTRY_CODES ?? 'tn',
      email: env.GEOCODER_EMAIL || null,
    },
    bootstrapAdmin,
    vapid: {
      publicKey: env.VAPID_PUBLIC_KEY || null,
      privateKey: env.VAPID_PRIVATE_KEY || null,
      subject: env.VAPID_SUBJECT || env.PUBLIC_URL || 'https://localhost',
    },
    ...overrides,
  };
}
