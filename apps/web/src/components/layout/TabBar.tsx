import { Calendar, CreditCard, House, Map as MapIcon, type LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { cx } from '../../lib/cx';
import s from './layout.module.css';

const TABS: { to: string; label: string; icon: LucideIcon; sections: string[] }[] = [
  { to: '/home', label: 'Home', icon: House, sections: ['/home', '/notifications', '/profile', '/rules', '/admin'] },
  { to: '/map', label: 'Map', icon: MapIcon, sections: ['/map'] },
  { to: '/meetups', label: 'Meetups', icon: Calendar, sections: ['/meetups'] },
  { to: '/pass', label: 'Pass', icon: CreditCard, sections: ['/pass'] },
];

export function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav className={s.tabbar} aria-label="Main">
      {TABS.map(({ to, label, icon: Icon, sections }) => {
        const active = sections.some((section) => pathname === section || pathname.startsWith(`${section}/`));
        return (
          <Link key={to} to={to} className={cx(s.tab, active && s.tabActive)} aria-current={active ? 'page' : undefined}>
            <Icon aria-hidden strokeWidth={1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
