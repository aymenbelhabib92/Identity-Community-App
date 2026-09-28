import { Suspense } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { LocationProvider } from '../../lib/location';
import { Loading } from '../ui';
import { TabBar } from './TabBar';

/** Signed-in layout: the screen, the tab bar, and location sharing running in the background. */
export function AppShell() {
  return (
    <LocationProvider>
      <div className="app-frame">
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
        <TabBar />
      </div>
      <ScrollRestoration />
    </LocationProvider>
  );
}
