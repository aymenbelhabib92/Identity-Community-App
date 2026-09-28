import { lazy } from 'react';
import { createBrowserRouter } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { PublicOnly, RequireAuth, RequireStaff, RootRedirect } from './components/layout/guards';
import Join from './screens/auth/Join';
import SignIn from './screens/auth/SignIn';
import Welcome from './screens/auth/Welcome';
import Home from './screens/home/Home';
import MeetupDetail from './screens/meetups/MeetupDetail';
import Meetups from './screens/meetups/Meetups';
import NotFound from './screens/misc/NotFound';
import Notifications from './screens/misc/Notifications';
import Profile from './screens/misc/Profile';
import Rules from './screens/misc/Rules';
import Pass from './screens/pass/Pass';
import PaymentScreen from './screens/pass/PaymentScreen';

// Heavier screens (Leaflet, QR scanning, admin tools) load on demand.
const MapScreen = lazy(() => import('./screens/map/MapScreen'));
const MeetupForm = lazy(() => import('./screens/meetups/MeetupForm'));
const Verify = lazy(() => import('./screens/misc/Verify'));
const AdminHome = lazy(() => import('./screens/admin/AdminHome'));
const AdminPayments = lazy(() => import('./screens/admin/AdminPayments'));
const AdminMembers = lazy(() => import('./screens/admin/AdminMembers'));
const AdminMember = lazy(() => import('./screens/admin/AdminMember'));
const AdminSettings = lazy(() => import('./screens/admin/AdminSettings'));
const ScanPass = lazy(() => import('./screens/admin/ScanPass'));

const staff = (element: React.ReactNode) => <RequireStaff>{element}</RequireStaff>;

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/welcome', element: <PublicOnly><Welcome /></PublicOnly> },
  { path: '/signin', element: <PublicOnly><SignIn /></PublicOnly> },
  { path: '/join', element: <PublicOnly><Join /></PublicOnly> },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { path: '/home', element: <Home /> },
      { path: '/map', element: <MapScreen /> },
      { path: '/meetups', element: <Meetups /> },
      { path: '/meetups/new', element: <MeetupForm /> },
      { path: '/meetups/:id', element: <MeetupDetail /> },
      { path: '/meetups/:id/edit', element: <MeetupForm /> },
      { path: '/pass', element: <Pass /> },
      { path: '/pass/pay', element: <PaymentScreen /> },
      { path: '/rules', element: <Rules /> },
      { path: '/notifications', element: <Notifications /> },
      { path: '/profile', element: <Profile /> },
      { path: '/verify', element: <Verify /> },
      { path: '/admin', element: staff(<AdminHome />) },
      { path: '/admin/payments', element: staff(<AdminPayments />) },
      { path: '/admin/members', element: staff(<AdminMembers />) },
      { path: '/admin/members/:id', element: staff(<AdminMember />) },
      { path: '/admin/settings', element: staff(<AdminSettings />) },
      { path: '/admin/scan', element: staff(<ScanPass />) },
    ],
  },
  { path: '*', element: <NotFound /> },
]);
