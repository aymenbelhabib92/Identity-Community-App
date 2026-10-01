import { createApiClient } from '@identity/shared';
import { currentLanguage } from './preferences';

const TOKEN_KEY = 'identity.token';

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

let currentToken = readToken();

/** The session token, kept in memory and persisted when storage is available. */
export const tokenStore = {
  get: () => currentToken,
  set(token: string | null) {
    currentToken = token;
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Private mode or blocked storage: the session lasts until the tab closes.
    }
  },
};

/** Fired when the API rejects the token (expired, revoked, password changed elsewhere). */
export const SIGNED_OUT_EVENT = 'identity:signed-out';

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL || '/api/v1',
  getToken: () => tokenStore.get(),
  getLanguage: currentLanguage,
  onUnauthorized: () => {
    tokenStore.set(null);
    window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
  },
});
