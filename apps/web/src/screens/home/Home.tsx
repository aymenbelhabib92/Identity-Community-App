import { firstName, t, tn, type User } from '@identity/shared';
import { Bell, Book, CalendarPlus, Navigation, QrCode, Shield, Upload } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '../../components/brand/Logo';
import { Shards } from '../../components/brand/Shards';
import { Photo } from '../../components/photos/Photos';
import { RolePill } from '../../components/RolePill';
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
import { cx } from '../../lib/cx';
import { greeting } from '../../lib/format';
import { isActiveMeetup } from '../../lib/meetups';
import { useAdminOverview, useMeetups, useNotifications } from '../../lib/queries';
import { QrSheet } from '../pass/QrSheet';
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
  const [qrOpen, setQrOpen] = useState(false);
  const hasPass = user.badgeNumber !== null && user.state !== 'suspended';

  return (
    <Screen>
      <header className={s.header}>
        <div>
          <p className={s.greeting}>{greeting()}</p>
          <h1 className={s.name}>{firstName(user.fullName)}</h1>
        </div>
        <div className={s.headerActions}>
          <RoundButton label={t('Notifications')} to="/notifications" dot={(notifications?.unread ?? 0) > 0}>
            <Bell aria-hidden strokeWidth={2} />
          </RoundButton>
          <Link to="/profile" aria-label={t('My account')} className={s.account}>
            <Avatar name={user.fullName} photo={user.avatar} online />
          </Link>
        </div>
      </header>

      <HomeBanner user={user} onQr={hasPass ? () => setQrOpen(true) : undefined} />

      <MembershipAlert user={user} />

      <SectionTitle action={<SectionAction to="/meetups">{t('See all')}</SectionAction>}>{t('Next meetup')}</SectionTitle>
      {meetups.isPending ? (
        <Card>
          <Loading />
        </Card>
      ) : next ? (
        <NextMeetupCard meetup={next} />
      ) : canCreateMeetup ? (
        <List>
          <ListRow
            to="/meetups/new"
            tile={{ icon: <CalendarPlus />, color: 'blue' }}
            title={t('Plan a meetup')}
            subtitle={t('Nothing on the calendar yet')}
          />
        </List>
      ) : (
        <Card>
          <EmptyState>{t('No meetup planned yet. You will be notified when one is.')}</EmptyState>
        </Card>
      )}

      <div className={s.actions}>
        <QuickAction to="/map" color="blue" icon={<Navigation />} label={t('Share location')} />
        <QuickAction to="/pass/pay" color="green" icon={<Upload />} label={t('Payment proof')} />
        <QuickAction to="/rules" color="orange" icon={<Book />} label={t('Club rules')} />
      </div>

      <AdminShortcut />
      <Announcements />

      {hasPass && <QrSheet open={qrOpen} onClose={() => setQrOpen(false)} member={user} />}
    </Screen>
  );
}

/**
 * Under the name: the member's cover photo (or the club's texture until they
 * choose one), their role, and the pass QR code for check-in.
 */
function HomeBanner({ user, onQr }: { user: User; onQr?: () => void }) {
  const content = (
    <>
      <Logo height={user.cover ? 34 : 40} className={s.bannerLogo} />
      <div className={s.bannerSide}>
        <RolePill role={user.role} member={user.approvedAt !== null} />
        {onQr && (
          <button type="button" className={s.bannerQr} onClick={onQr} aria-label={t('Show my pass QR code')}>
            <QrCode aria-hidden strokeWidth={2} />
          </button>
        )}
      </div>
    </>
  );
  if (!user.cover) return <Shards className={s.banner}>{content}</Shards>;
  return (
    <div className={cx(s.banner, s.coverBanner, 'theme-dark')}>
      <Photo id={user.cover} className={s.coverImage} />
      {content}
    </div>
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
    data?.pendingPayments ? tn(data.pendingPayments, '{count} payment to review', '{count} payments to review') : null,
    data?.pendingMembers ? tn(data.pendingMembers, '{count} request', '{count} requests') : null,
  ].filter(Boolean);

  return (
    <List className={s.adminCard}>
      <ListRow
        to="/admin"
        tile={{ icon: <Shield />, color: 'purple' }}
        title={t('Club admin')}
        subtitle={todo.length ? todo.join(' · ') : t('Members, payments, check-in')}
      />
    </List>
  );
}
