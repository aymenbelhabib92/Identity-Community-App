import { formatBadgeNumber, formatIsoDate, t, type PassVerification } from '@identity/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, ScanLine, X } from 'lucide-react';
import { useLocation } from 'react-router';
import { CarPhotoStrip } from '../../components/photos/Photos';
import {
  Avatar,
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
import { roleLabel, stateLabel } from '../../lib/format';
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
      <BackLink to={canVerify ? '/admin' : '/home'}>{canVerify ? t('Admin') : t('Home')}</BackLink>
      <LargeTitle>{t('Pass check')}</LargeTitle>
      {!canVerify ? (
        <Notice tone="gray">{t('Only organizers can check passes. Your own pass is in your account.')}</Notice>
      ) : token.length <= 10 ? (
        <Notice tone="orange">{t("This link does not contain a pass. Scan the member's QR code again.")}</Notice>
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
            {t('Scan another pass')}
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
          {member?.avatar ? (
            <Avatar name={member.fullName} photo={member.avatar} size={96} />
          ) : (
            <span className={cx(s.verdictIcon, result.valid ? s.valid : s.invalid)}>
              {result.valid ? <Check aria-hidden strokeWidth={3} /> : <X aria-hidden strokeWidth={3} />}
            </span>
          )}
          <p className={cx(s.verdictTitle, member?.avatar && (result.valid ? s.validText : s.invalidText))}>
            {result.valid ? t('Valid member') : t('Not valid')}
          </p>
          {result.reason && <p className={s.verdictText}>{result.reason}</p>}
        </div>
      </Card>
      {member && (
        <>
          <List>
            <ListRow title={t('Name')} value={member.fullName} />
            <ListRow title={t('Badge')} value={formatBadgeNumber(member.badgeNumber)} />
            <ListRow title={t('Role')} value={roleLabel(member.role)} />
            <ListRow title={t('Status')} value={stateLabel(member.state)} />
            <ListRow title={t('Valid until')} value={member.paidUntil ? formatIsoDate(member.paidUntil) : '—'} />
            <ListRow title={t('Car')} value={member.car ?? '—'} />
          </List>
          <CarPhotoStrip photos={member.carPhotos} />
        </>
      )}
    </div>
  );
}
