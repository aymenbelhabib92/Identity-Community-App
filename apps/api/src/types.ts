import type { ClubSettings, IsoDate, Language, MembershipState, Role } from '@identity/shared';
import type { Config } from './config';
import type { Db } from './db/client';
import type { UserRow } from './db/schema';
import type { Storage } from './lib/storage';
import type { ChatHub } from './services/chat';
import type { PushService } from './services/push';
import type { SettingsStore } from './services/settings';

/** The signed-in member, resolved once per request. */
export interface Viewer {
  id: string;
  user: UserRow;
  role: Role;
  state: MembershipState;
  hasAccess: boolean;
  settings: ClubSettings;
  /** Today in the club time zone. */
  today: IsoDate;
  now: Date;
  /** Language of this request (labels in responses). */
  lang: Language;
}

export interface Clock {
  now(): Date;
}

export interface AccessTokenPayload {
  sub: string;
  tv: number;
  typ: 'access';
}

/** Short-lived token shown as a QR code on the member pass. */
export interface PassTokenPayload {
  sub: string;
  typ: 'pass';
}

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    db: Db;
    storage: Storage;
    clubSettings: SettingsStore;
    clock: Clock;
    push: PushService;
    chat: ChatHub;
  }

  interface FastifyRequest {
    viewer: Viewer;
    /** From Accept-Language: error messages and labels are answered in it. */
    lang: Language;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload | PassTokenPayload;
    user: AccessTokenPayload | PassTokenPayload;
  }
}
