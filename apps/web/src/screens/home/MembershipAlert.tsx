import { formatMoney, formatPhone, t, type User } from '@identity/shared';
import { CircleAlert, Wallet } from 'lucide-react';
import { Steps, type StepItem } from '../../components/Steps';
import { ButtonLink, Card, IconTile, Notice } from '../../components/ui';
import { useMembership } from '../../lib/queries';
import s from './home.module.css';

/** What a member still has to do: finish joining, pay dues, or why access is closed. */
export function MembershipAlert({ user }: { user: User }) {
  const needsMembership = user.state === 'pending' || user.state === 'due' || user.state === 'expired';
  const { data: membership } = useMembership(needsMembership);

  if (user.state === 'suspended') {
    return (
      <div className={s.pendingSteps}>
        <Notice tone="red" icon={<CircleAlert aria-hidden />}>
          {t('Your membership is suspended. Contact an admin for details.')}
        </Notice>
      </div>
    );
  }
  if (user.state === 'rejected') {
    return (
      <div className={s.pendingSteps}>
        <Notice tone="gray" icon={<CircleAlert aria-hidden />}>
          {t('Your membership request was not approved. Contact the club for details.')}
        </Notice>
      </div>
    );
  }
  if (!needsMembership || !membership) return null;

  if (user.state === 'pending') {
    const fee = formatMoney(membership.fees.entryFee, membership.fees.currency);
    const paying = membership.entryFeeStatus === 'pending';
    const steps: StepItem[] = [
      { title: t('Account created'), text: formatPhone(user.phone), state: 'done' },
      paying
        ? { title: t('Entry fee sent'), text: t('Awaiting the treasurer'), state: 'waiting' }
        : {
            title: t('Pay the entry fee · {amount}', { amount: fee }),
            text: t('Upload a payment proof or pay in person'),
            state: 'current',
            action: (
              <ButtonLink to="/pass/pay" size="small">
                {t('Pay entry fee')}
              </ButtonLink>
            ),
          },
      { title: t('Get verified & receive your badge'), text: t('Then the member map and secret meetups open') },
    ];
    return <Steps steps={steps} className={s.pendingSteps} />;
  }

  const next = membership.duesOptions[0];
  const expired = user.state === 'expired';
  return (
    <Card className={s.alertCard}>
      <IconTile color={expired ? 'red' : 'orange'} large>
        <Wallet />
      </IconTile>
      <div className={s.alertBody}>
        <p className={s.alertTitle}>{expired ? t('Membership expired') : t('Dues due')}</p>
        <p className={s.alertText}>
          {next ? `${next.label} · ${formatMoney(next.amount, membership.fees.currency)}` : t('Pay your dues to keep access')}
        </p>
      </div>
      <ButtonLink to="/pass/pay" size="small">
        {t('Pay')}
      </ButtonLink>
    </Card>
  );
}
