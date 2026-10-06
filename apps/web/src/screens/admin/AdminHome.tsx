import { t } from '@identity/shared';
import { BookOpen, CalendarPlus, CreditCard, MapPinned, ScanLine, Settings, UserPlus, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BackLink, LargeTitle, List, ListRow, Screen, SectionHeader } from '../../components/ui';
import { useCan } from '../../lib/auth';
import { cx } from '../../lib/cx';
import { useAdminOverview } from '../../lib/queries';
import s from './admin.module.css';

export default function AdminHome() {
  const canViewMembers = useCan('members:view');
  const canReview = useCan('payments:review');
  const canVerify = useCan('pass:verify');
  const canCreateMeetup = useCan('meetups:create');
  const canManageSettings = useCan('settings:manage');
  const canManagePlaces = useCan('places:manage');
  const { data } = useAdminOverview(canViewMembers);

  const count = (value: number | undefined) => (value === undefined ? '…' : value);

  return (
    <Screen>
      <BackLink to="/home">{t('Home')}</BackLink>
      <LargeTitle>{t('Club admin')}</LargeTitle>

      {canViewMembers && (
        <div className={s.stats}>
          <Stat to="/admin/members?filter=active" value={count(data?.activeMembers)} label={t('Active members')} tone="green" />
          <Stat to="/admin/members?filter=pending" value={count(data?.pendingMembers)} label={t('Pending requests')} tone="blue" />
          <Stat to="/admin/members?filter=due" value={count(data?.dueMembers)} label={t('Dues due')} tone="orange" />
          <Stat to="/admin/members?filter=expired" value={count(data?.expiredMembers)} label={t('Expired')} tone="red" />
        </div>
      )}

      <SectionHeader>{t('To do')}</SectionHeader>
      <List>
        {canReview && (
          <ListRow
            to="/admin/payments"
            tile={{ icon: <CreditCard />, color: 'orange' }}
            title={t('Payments to review')}
            value={data?.pendingPayments ? data.pendingPayments : undefined}
          />
        )}
        {canViewMembers && (
          <ListRow
            to="/admin/members?filter=pending"
            tile={{ icon: <UserPlus />, color: 'blue' }}
            title={t('Membership requests')}
            value={data?.pendingMembers ? data.pendingMembers : undefined}
          />
        )}
        {canVerify && (
          <ListRow
            to="/admin/scan"
            tile={{ icon: <ScanLine />, color: 'red' }}
            title={t('Scan a pass')}
            subtitle={t('Check-in at a meetup')}
          />
        )}
      </List>

      <SectionHeader>{t('Club')}</SectionHeader>
      <List>
        {canViewMembers && (
          <ListRow
            to="/admin/members"
            tile={{ icon: <Users />, color: 'green' }}
            title={t('Members')}
            value={data ? data.totalMembers : undefined}
          />
        )}
        {canCreateMeetup && <ListRow to="/meetups/new" tile={{ icon: <CalendarPlus />, color: 'red' }} title={t('New meetup')} />}
        {canManagePlaces && (
          <ListRow
            to="/admin/places"
            tile={{ icon: <MapPinned />, color: 'purple' }}
            title={t('Places & red zones')}
            subtitle={t('On the members’ map')}
          />
        )}
        {canManageSettings && (
          <ListRow
            to="/admin/settings"
            tile={{ icon: <Settings />, color: 'gray' }}
            title={t('Club settings')}
            subtitle={t('Fees, dues period, rules')}
          />
        )}
        {canManageSettings && (
          <ListRow
            href="/api/docs"
            tile={{ icon: <BookOpen />, color: 'purple' }}
            title={t('API documentation')}
            subtitle={t('For developers of the club apps')}
            chevron
          />
        )}
      </List>
    </Screen>
  );
}

function Stat({ to, value, label, tone }: { to: string; value: ReactNode; label: string; tone: 'green' | 'blue' | 'orange' | 'red' }) {
  return (
    <Link to={to} className={s.stat}>
      <span className={cx(s.statValue, s[tone])}>{value}</span>
      <span className={s.statLabel}>{label}</span>
    </Link>
  );
}
