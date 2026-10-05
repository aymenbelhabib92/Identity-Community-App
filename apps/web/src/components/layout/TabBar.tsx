import { t } from '@identity/shared';
import { Calendar, House, Map as MapIcon, MessageCircle, type LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../../lib/auth';
import { useChatUnread } from '../../lib/chat';
import { cx } from '../../lib/cx';
import s from './layout.module.css';

// The account (profile, pass, settings) is reached from the avatar at the top right of Home.
const TABS: { to: string; label: string; icon: LucideIcon; sections: string[] }[] = [
  { to: '/home', label: 'Home', icon: House, sections: ['/home', '/notifications', '/profile', '/pass', '/rules', '/admin'] },
  { to: '/map', label: 'Map', icon: MapIcon, sections: ['/map'] },
  { to: '/meetups', label: 'Meetups', icon: Calendar, sections: ['/meetups'] },
  { to: '/chat', label: 'Chat', icon: MessageCircle, sections: ['/chat'] },
];

export function TabBar() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const inChat = pathname === '/chat';
  const unread = useChatUnread(Boolean(user?.hasAccess) && !inChat);

  return (
    <nav className={s.tabbar} aria-label={t('Main')}>
      {TABS.map(({ to, label, icon: Icon, sections }) => {
        const active = sections.some((section) => pathname === section || pathname.startsWith(`${section}/`));
        const badge = to === '/chat' && !inChat && unread > 0 ? (unread > 99 ? '99+' : String(unread)) : null;
        return (
          <Link key={to} to={to} className={cx(s.tab, active && s.tabActive)} aria-current={active ? 'page' : undefined}>
            <span className={s.tabIcon}>
              <Icon aria-hidden strokeWidth={1.8} />
              {badge && (
                <span className={s.tabBadge} aria-hidden>
                  {badge}
                </span>
              )}
            </span>
            <span>{t(label)}</span>
            {badge && <span className="sr-only">{t('{count} unread', { count: badge })}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
