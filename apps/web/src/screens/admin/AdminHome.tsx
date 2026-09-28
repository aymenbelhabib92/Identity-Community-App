import { BookOpen, CalendarPlus, CreditCard, ScanLine, Settings, UserPlus, Users } from 'lucide-react';
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
  const { data } = useAdminOverview(canViewMembers);

  const count = (value: number | undefined) => (value === undefined ? '…' : value);

  return (
    <Screen>
      <BackLink to="/home">Home</BackLink>
      <LargeTitle>Club admin</LargeTitle>

      {canViewMembers && (
        <div className={s.stats}>
          <Stat to="/admin/members?filter=active" value={count(data?.activeMembers)} label="Active members" tone="green" />
          <Stat to="/admin/members?filter=pending" value={count(data?.pendingMembers)} label="Pending requests" tone="blue" />
          <Stat to="/admin/members?filter=due" value={count(data?.dueMembers)} label="Dues due" tone="orange" />
          <Stat to="/admin/members?filter=expired" value={count(data?.expiredMembers)} label="Expired" tone="red" />
        </div>
      )}

      <SectionHeader>To do</SectionHeader>
      <List>
        {canReview && (
          <ListRow
            to="/admin/payments"
            tile={{ icon: <CreditCard />, color: 'orange' }}
            title="Payments to review"
            value={data?.pendingPayments ? data.pendingPayments : undefined}
          />
        )}
        {canViewMembers && (
          <ListRow
            to="/admin/members?filter=pending"
            tile={{ icon: <UserPlus />, color: 'blue' }}
            title="Membership requests"
            value={data?.pendingMembers ? data.pendingMembers : undefined}
          />
        )}
        {canVerify && (
          <ListRow to="/admin/scan" tile={{ icon: <ScanLine />, color: 'red' }} title="Scan a pass" subtitle="Check-in at a meetup" />
        )}
      </List>

      <SectionHeader>Club</SectionHeader>
      <List>
        {canViewMembers && (
          <ListRow
            to="/admin/members"
            tile={{ icon: <Users />, color: 'green' }}
            title="Members"
            value={data ? data.totalMembers : undefined}
          />
        )}
        {canCreateMeetup && <ListRow to="/meetups/new" tile={{ icon: <CalendarPlus />, color: 'red' }} title="New meetup" />}
        {canManageSettings && (
          <ListRow
            to="/admin/settings"
            tile={{ icon: <Settings />, color: 'gray' }}
            title="Club settings"
            subtitle="Fees, dues period, rules"
          />
        )}
        {canManageSettings && (
          <ListRow
            href="/api/docs"
            tile={{ icon: <BookOpen />, color: 'purple' }}
            title="API documentation"
            subtitle="For developers of the club apps"
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
