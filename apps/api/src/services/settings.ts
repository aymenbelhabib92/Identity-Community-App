import { resolveClubSettings, type ClubSettings, type ClubSettingsUpdate } from '@identity/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { settings } from '../db/schema';

const KEY = 'club';
const CACHE_MS = 30_000;

/** Club settings with a short in-memory cache (they are read on every request). */
export class SettingsStore {
  private readonly db: Db;
  private cached: { value: ClubSettings; at: number } | null = null;

  constructor(db: Db) {
    this.db = db;
  }

  async get(): Promise<ClubSettings> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.value;
    const [row] = await this.db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
    const value = resolveClubSettings(row?.value);
    this.cached = { value, at: Date.now() };
    return value;
  }

  async update(patch: ClubSettingsUpdate): Promise<ClubSettings> {
    const next = resolveClubSettings({ ...(await this.get()), ...patch });
    await this.db
      .insert(settings)
      .values({ key: KEY, value: next })
      .onConflictDoUpdate({ target: settings.key, set: { value: next, updatedAt: new Date() } });
    this.cached = { value: next, at: Date.now() };
    return next;
  }
}
