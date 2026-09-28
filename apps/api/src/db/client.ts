import { mkdirSync } from 'node:fs';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Config } from '../config';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
/** A transaction or the database itself — services accept both. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export interface Database {
  db: Db;
  kind: 'postgres' | 'pglite';
  close(): Promise<void>;
}

/**
 * Opens PostgreSQL when DATABASE_URL is set (Docker / production), otherwise an
 * embedded PGlite database — the same Postgres engine compiled to WASM, so local
 * development needs no database server. Pending migrations are applied on open.
 */
export async function openDatabase(config: Pick<Config, 'databaseUrl' | 'pgliteDir' | 'migrationsDir'>): Promise<Database> {
  if (config.databaseUrl) {
    const { default: pg } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: config.migrationsDir });
    return { db, kind: 'postgres', close: () => pool.end() };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  if (config.pgliteDir) mkdirSync(config.pgliteDir, { recursive: true });
  const client = config.pgliteDir ? new PGlite(config.pgliteDir) : new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: config.migrationsDir });
  // Both drivers expose the same Postgres query builder.
  return { db: db as unknown as Db, kind: 'pglite', close: () => client.close() };
}
