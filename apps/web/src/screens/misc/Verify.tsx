import { formatBadgeNumber, formatIsoDate, ROLE_LABELS, type PassVerification } from '@identity/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, ScanLine, X } from 'lucide-react';
import { useLocation } from 'react-router';
import {
  BackLink,
  ButtonLink,
  Card,
  ErrorState,
  LargeTitle,
  List,
  ListRow,
  Loading,
  Notice,
  Screen,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useCan } from '../../lib/auth';
import { cx } from '../../lib/cx';
import { stateLabel } from '../../lib/format';
import s from './misc.module.css';

/** Opened from a scanned pass QR code: /verify#<token>. */
export default function Verify() {
  const { hash } = useLocation();
  const token = decodeURIComponent(hash.replace(/^#/, ''));
  const canVerify = useCan('pass:verify');

  const check = useQuery({
    queryKey: ['verify', token],
    queryFn: () => api.pass.verify(token),
    enabled: canVerify && token.length > 10,
    retry: false,
    gcTime: 0,
  });

  return (
    <Screen>
      <BackLink to={canVerify ? '/admin' : '/home'}>{canVerify ? 'Admin' : 'Home'}</BackLink>
      <LargeTitle>Pass check</LargeTitle>
      {!canVerify ? (
        <Notice tone="gray">Only organizers can check passes. Your own pass is in the Pass tab.</Notice>
      ) : token.length <= 10 ? (
        <Notice tone="orange">This link does not contain a pass. Scan the member's QR code again.</Notice>
      ) : check.isPending ? (
        <Loading />
      ) : check.error ? (
        <ErrorState error={check.error} onRetry={() => void check.refetch()} />
      ) : (
        <Verdict result={check.data} />
      )}
      {canVerify && (
        <div style={{ marginTop: 16 }}>
          <ButtonLink to="/admin/scan" variant="secondary" icon={<ScanLine aria-hidden />}>
            Scan another pass
          </ButtonLink>
        </div>
      )}
    </Screen>
  );
}

function Verdict({ result }: { result: PassVerification }) {
  const { member } = result;
  return (
    <div className={s.form}>
      <Card>
        <div className={s.verdict}>
          <span className={cx(s.verdictIcon, result.valid ? s.valid : s.invalid)}>
            {result.valid ? <Check aria-hidden strokeWidth={3} /> : <X aria-hidden strokeWidth={3} />}
          </span>
          <p className={s.verdictTitle}>{result.valid ? 'Valid member' : 'Not valid'}</p>
          {result.reason && <p className={s.verdictText}>{result.reason}</p>}
        </div>
      </Card>
      {member && (
        <List>
          <ListRow title="Name" value={member.fullName} />
          <ListRow title="Badge" value={formatBadgeNumber(member.badgeNumber)} />
          <ListRow title="Role" value={ROLE_LABELS[member.role]} />
          <ListRow title="Status" value={stateLabel(member.state)} />
          <ListRow title="Valid until" value={member.paidUntil ? formatIsoDate(member.paidUntil) : '—'} />
          <ListRow title="Car" value={member.car ?? '—'} />
        </List>
      )}
    </div>
  );
}
