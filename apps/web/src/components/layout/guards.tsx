import { t } from '@identity/shared';
import { useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../../lib/auth';
import { Logo } from '../brand/Logo';
import { Button, ErrorState, Spinner } from '../ui';
import s from './layout.module.css';

const STAFF_PERMISSIONS = ['members:view', 'payments:review', 'settings:manage', 'pass:verify'];

function Splash({ children }: { children?: ReactNode }) {
  return (
    <div className={s.fullscreen}>
      <div className={s.fullscreenInner}>
        <Logo width={180} />
        {children ?? <Spinner />}
      </div>
    </div>
  );
}

/** Signed-in screens. Remembers where the member was going (e.g. a scanned pass link). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { token, user, loading, error, signOut } = useAuth();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/welcome" replace state={{ from: location.pathname + location.search + location.hash }} />;
  }
  if (loading) return <Splash />;
  if (!user) {
    return (
      <Splash>
        <ErrorState error={error} onRetry={() => window.location.reload()} />
        <Button variant="plain" onClick={signOut}>
          {t('Sign out')}
        </Button>
      </Splash>
    );
  }
  return children;
}

/** Where a signed-out visitor was heading, carried through welcome → sign in → join. */
export function useRedirectTarget(): string {
  const location = useLocation();
  return (location.state as { from?: string } | null)?.from ?? '/home';
}

/**
 * Welcome, sign-in and join: skipped when the member arrives already signed in.
 * After signing in on the page itself, the page decides where to go next.
 */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { token, user, loading } = useAuth();
  const target = useRedirectTarget();
  const [signedInOnArrival] = useState(() => token !== null);
  if (signedInOnArrival) {
    if (loading) return <Splash />;
    if (user) return <Navigate to={target} replace />;
  }
  return children;
}

export function RequireStaff({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const staff = user?.hasAccess && user.permissions.some((permission) => STAFF_PERMISSIONS.includes(permission));
  if (!staff) return <Navigate to="/home" replace />;
  return children;
}

export function RootRedirect() {
  const { token } = useAuth();
  return <Navigate to={token ? '/home' : '/welcome'} replace />;
}
