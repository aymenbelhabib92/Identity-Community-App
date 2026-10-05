import type { createBrowserRouter, To } from 'react-router';

type Router = ReturnType<typeof createBrowserRouter>;

/**
 * iOS-style screen transitions, played with the View Transitions API
 * (see "Screen transitions" in global.css):
 * - push: a deeper screen slides in from the right (notifications, profile, a meetup…)
 * - pop:  going back, the screen slides out to the right
 * - tab:  switching tabs cross-fades quickly
 * - fade: signing in or out
 * Browsers without the API simply switch screens instantly.
 */
export type ScreenTransition = 'push' | 'pop' | 'tab' | 'fade' | 'none';

const TAB_ROOTS = ['/home', '/map', '/meetups', '/chat'];
/** Screens reached from the Home tab (they keep it highlighted in the tab bar). */
const HOME_SECTIONS = ['/notifications', '/profile', '/pass', '/rules', '/admin', '/verify'];
const AUTH_FLOW = ['/welcome', '/signin', '/join'];

const within = (path: string, section: string) => path === section || path.startsWith(`${section}/`);

function tabOf(path: string): string {
  if (HOME_SECTIONS.some((section) => within(path, section))) return '/home';
  return TAB_ROOTS.find((root) => within(path, root)) ?? path;
}

/**
 * Tab roots are level 0; every path segment below goes one level deeper. The
 * pass is opened from the account screen (/profile), so it sits one level below it.
 */
function depth(path: string): number {
  if (TAB_ROOTS.includes(path)) return 0;
  return path.split('/').filter(Boolean).length + (within(path, '/pass') ? 1 : 0);
}

export function transitionFor(from: string, to: string): ScreenTransition {
  if (from === to || from === '/' || to === '/') return 'none';
  const fromAuth = AUTH_FLOW.indexOf(from);
  const toAuth = AUTH_FLOW.indexOf(to);
  if (fromAuth >= 0 && toAuth >= 0) return toAuth > fromAuth ? 'push' : 'pop';
  if (fromAuth >= 0 || toAuth >= 0) return 'fade';
  if (TAB_ROOTS.includes(to) && tabOf(to) !== tabOf(from)) return 'tab';
  return depth(to) < depth(from) ? 'pop' : 'push';
}

function targetPath(to: To | null, from: string): string {
  const base = `${window.location.origin}${from}`;
  if (to == null) return from;
  if (typeof to === 'string') return new URL(to, base).pathname;
  return to.pathname ? new URL(to.pathname, base).pathname : from;
}

function announce(transition: ScreenTransition): void {
  document.documentElement.dataset.transition = transition;
}

/**
 * Turns on view transitions for every navigation of `router` (links, buttons,
 * redirects), with the direction picked from where the member comes from and
 * goes to. Query-only changes (segmented controls) are not animated.
 */
export function enableScreenTransitions(router: Router): void {
  if (typeof document.startViewTransition !== 'function') return;

  // The screen being shown. Tracked here because on "back", React Router has
  // already moved its state to the new page when our popstate listener runs.
  let shownPath = router.state.location.pathname;

  const navigate = router.navigate;
  router.navigate = ((to: To | number | null, options?: Parameters<Router['navigate']>[1]) => {
    if (typeof to === 'number') return navigate(to);
    const from = router.state.location.pathname;
    const target = targetPath(to, from);
    const transition = transitionFor(from, target);
    shownPath = target;
    if (transition === 'none' || options?.viewTransition === false) return navigate(to, options);
    announce(transition);
    return navigate(to, { ...options, viewTransition: true });
  }) as Router['navigate'];

  // Back / forward buttons and gestures. React Router replays a transition on
  // "back" when the forward navigation had one; skip ours when the browser
  // already animated the swipe itself (Safari's back gesture).
  window.addEventListener('popstate', (event) => {
    const animatedByBrowser = (event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition;
    const target = window.location.pathname;
    announce(animatedByBrowser ? 'none' : transitionFor(shownPath, target));
    shownPath = target;
  });
}
