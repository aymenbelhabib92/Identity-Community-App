import { t } from '@identity/shared';
import { Calendar, House, Map as MapIcon, type LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { cx } from '../../lib/cx';
import s from './layout.module.css';

// The account (profile, pass, settings) is reached from the avatar at the top right of Home.
const TABS: { to: string; label: string; icon: LucideIcon; sections: string[] }[] = [
  { to: '/home', label: 'Home', icon: House, sections: ['/home', '/notifications', '/profile', '/pass', '/rules', '/admin'] },
  { to: '/map', label: 'Map', icon: MapIcon, sections: ['/map'] },
  { to: '/meetups', label: 'Meetups', icon: Calendar, sections: ['/meetups'] },
];

export function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav className={s.tabbar} aria-label={t('Main')}>
      {TABS.map(({ to, label, icon: Icon, sections }) => {
        const active = sections.some((section) => pathname === section || pathname.startsWith(`${section}/`));
        return (
          <Link key={to} to={to} className={cx(s.tab, active && s.tabActive)} aria-current={active ? 'page' : undefined}>
            <Icon aria-hidden strokeWidth={1.8} />
            <span>{t(label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
