import { formatBadgeNumber, formatPhone, MEMBER_FILTERS, t, type MemberFilter } from '@identity/shared';
import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Avatar, BackLink, Card, EmptyState, ErrorState, LargeTitle, List, ListRow, Loading, Screen } from '../../components/ui';
import { api } from '../../lib/api';
import { cx } from '../../lib/cx';
import { stateLabel } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import { keys } from '../../lib/queries';
import s from './admin.module.css';

/** English source texts, translated when displayed. */
const FILTER_LABELS: Record<MemberFilter, string> = {
  all: 'All',
  pending: 'Pending',
  active: 'Active',
  due: 'Dues due',
  expired: 'Expired',
  suspended: 'Suspended',
  staff: 'Staff',
};

const STATE_CLASS = { active: s.green, pending: s.blue, due: s.orange, expired: s.red, suspended: s.red, rejected: undefined };

export default function AdminMembers() {
  const [params, setParams] = useSearchParams();
  const filter = (MEMBER_FILTERS as readonly string[]).includes(params.get('filter') ?? '')
    ? (params.get('filter') as MemberFilter)
    : 'all';
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim());

  const members = useQuery({
    queryKey: keys.adminMembers({ filter, q }),
    queryFn: () => api.admin.members({ filter, q: q || undefined }),
    placeholderData: (previous) => previous,
  });

  return (
    <Screen>
      <BackLink to="/admin">{t('Admin')}</BackLink>
      <LargeTitle>{t('Members')}</LargeTitle>

      <label className={s.search}>
        <Search aria-hidden />
        <input
          type="search"
          placeholder={t('Name or phone')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={t('Search members')}
        />
      </label>

      <div className={s.chips} role="radiogroup" aria-label={t('Filter')}>
        {MEMBER_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={value === filter}
            className={cx(s.chip, value === filter && s.chipActive)}
            onClick={() => setParams(value === 'all' ? {} : { filter: value }, { replace: true })}
          >
            {t(FILTER_LABELS[value])}
          </button>
        ))}
      </div>

      {members.isPending ? (
        <Loading />
      ) : members.error ? (
        <ErrorState error={members.error} onRetry={() => void members.refetch()} />
      ) : members.data.items.length === 0 ? (
        <Card>
          <EmptyState icon={<Users />}>{t('No member matches.')}</EmptyState>
        </Card>
      ) : (
        <List>
          {members.data.items.map((member) => (
            <ListRow
              key={member.id}
              to={`/admin/members/${member.id}`}
              leading={<Avatar name={member.fullName} photo={member.avatar} size={38} online={member.online} />}
              title={member.fullName}
              subtitle={[
                member.badgeNumber !== null ? formatBadgeNumber(member.badgeNumber) : null,
                formatPhone(member.phone),
                member.pendingPayments ? t('{count} to review', { count: member.pendingPayments }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              value={stateLabel(member.state)}
              valueClassName={STATE_CLASS[member.state]}
            />
          ))}
        </List>
      )}
    </Screen>
  );
}
