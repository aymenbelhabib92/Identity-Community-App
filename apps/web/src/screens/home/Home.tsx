import { firstName } from '@identity/shared';
import { Bell, Book, CalendarPlus, Navigation, Shield, Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '../../components/brand/Logo';
import { Shards } from '../../components/brand/Shards';
import { StatePill } from '../../components/StatePill';
import {
  Avatar,
  Card,
  EmptyState,
  IconTile,
  List,
  ListRow,
  Loading,
  RoundButton,
  Screen,
  SectionAction,
  SectionTitle,
  type TileColor,
} from '../../components/ui';
import { useCan, useUser } from '../../lib/auth';
import { greeting } from '../../lib/format';
import { isActiveMeetup } from '../../lib/meetups';
import { useAdminOverview, useMeetups, useNotifications } from '../../lib/queries';
import { Announcements } from './Announcements';
import s from './home.module.css';
import { MembershipAlert } from './MembershipAlert';
import { NextMeetupCard } from './NextMeetupCard';

export default function Home() {
  const user = useUser();
  const { data: notifications } = useNotifications();
  const meetups = useMeetups('upcoming');
  const next = meetups.data?.items.find(isActiveMeetup);
  const canCreateMeetup = useCan('meetups:create');

  return (
    <Screen>
      <header className={s.header}>
        <div>
          <p className={s.greeting}>{greeting()}</p>
          <h1 className={s.name}>{firstName(user.fullName)}</h1>
        </div>
        <div className={s.headerActions}>
          <RoundButton label="Notifications" to="/notifications" dot={(notifications?.unread ?? 0) > 0}>
            <Bell aria-hidden strokeWidth={2} />
          </RoundButton>
          <Link to="/profile" aria-label="Profile">
            <Avatar name={user.fullName} />
          </Link>
        </div>
      </header>

      <Shards className={s.banner}>
        <Logo height={40} className={s.bannerLogo} />
        <StatePill state={user.state} />
      </Shards>

      <MembershipAlert user={user} />

      <SectionTitle action={<SectionAction to="/meetups">See all</SectionAction>}>Next meetup</SectionTitle>
      {meetups.isPending ? (
        <Card>
          <Loading />
        </Card>
      ) : next ? (
        <NextMeetupCard meetup={next} />
      ) : canCreateMeetup ? (
        <List>
          <ListRow to="/meetups/new" tile={{ icon: <CalendarPlus />, color: 'blue' }} title="Plan a meetup" subtitle="Nothing on the calendar yet" />
        </List>
      ) : (
        <Card>
          <EmptyState>No meetup planned yet. You will be notified when one is.</EmptyState>
        </Card>
      )}

      <div className={s.actions}>
        <QuickAction to="/map" color="blue" icon={<Navigation />} label="Share location" />
        <QuickAction to="/pass/pay" color="green" icon={<Upload />} label="Payment proof" />
        <QuickAction to="/rules" color="orange" icon={<Book />} label="Club rules" />
      </div>

      <AdminShortcut />
      <Announcements />
    </Screen>
  );
}

function QuickAction({ to, color, icon, label }: { to: string; color: TileColor; icon: ReactNode; label: string }) {
  return (
    <Link to={to} className={s.action}>
      <IconTile color={color}>{icon}</IconTile>
      <span className={s.actionLabel}>{label}</span>
    </Link>
  );
}

function AdminShortcut() {
  const isStaff = useCan('members:view');
  const { data } = useAdminOverview(isStaff);
  if (!isStaff) return null;

  const todo = [
    data?.pendingPayments ? `${data.pendingPayments} payment${data.pendingPayments > 1 ? 's' : ''} to review` : null,
    data?.pendingMembers ? `${data.pendingMembers} request${data.pendingMembers > 1 ? 's' : ''}` : null,
  ].filter(Boolean);

  return (
    <List className={s.adminCard}>
      <ListRow
        to="/admin"
        tile={{ icon: <Shield />, color: 'purple' }}
        title="Club admin"
        subtitle={todo.length ? todo.join(' · ') : 'Members, payments, check-in'}
      />
    </List>
  );
}
