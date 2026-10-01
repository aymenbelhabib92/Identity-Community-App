import type { AuthResponse, Permission, User } from '@identity/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, SIGNED_OUT_EVENT, tokenStore } from './api';
import { clearPhotos } from './photos';
import { changeLanguage, currentLanguage } from './preferences';
import { keys } from './queries';

interface AuthContextValue {
  token: string | null;
  user: User | undefined;
  /** A token exists but the member has not been loaded yet. */
  loading: boolean;
  error: unknown;
  signIn(response: AuthResponse): void;
  signOut(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(tokenStore.get);

  const me = useQuery({
    queryKey: keys.me,
    queryFn: api.me.get,
    enabled: token !== null,
    staleTime: 30_000,
    // Also tells the server the member is still here (the green "online" dot).
    refetchInterval: 2 * 60_000,
  });

  // The account remembers the member's language: a new device adopts it, and an
  // account that has none yet takes the language of this device.
  const accountLanguage = me.data?.language;
  const signedIn = token !== null && me.data !== undefined;
  useEffect(() => {
    if (!signedIn) return;
    if (accountLanguage) changeLanguage(accountLanguage);
    else void api.me.update({ language: currentLanguage() }).then((user) => queryClient.setQueryData(keys.me, user), () => {});
  }, [signedIn, accountLanguage, queryClient]);

  const forget = useCallback(() => {
    setToken(null);
    queryClient.clear();
    clearPhotos();
  }, [queryClient]);

  useEffect(() => {
    window.addEventListener(SIGNED_OUT_EVENT, forget);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, forget);
  }, [forget]);

  const signIn = useCallback(
    (response: AuthResponse) => {
      tokenStore.set(response.token);
      queryClient.clear();
      clearPhotos();
      queryClient.setQueryData(keys.me, response.user);
      setToken(response.token);
    },
    [queryClient],
  );

  const signOut = useCallback(() => {
    tokenStore.set(null);
    forget();
  }, [forget]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user: token ? me.data : undefined,
      loading: token !== null && me.isPending,
      error: me.error,
      signIn,
      signOut,
    }),
    [token, me.data, me.isPending, me.error, signIn, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth outside AuthProvider');
  return context;
}

/** The signed-in member. Only for screens rendered behind `RequireAuth`. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser without a signed-in member');
  return user;
}

export function useCan(permission: Permission): boolean {
  const { user } = useAuth();
  return Boolean(user?.hasAccess && user.permissions.includes(permission));
}
