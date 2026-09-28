import { formatMoney, formatPhone, type User } from '@identity/shared';
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
          Your membership is suspended. Contact an admin for details.
        </Notice>
      </div>
    );
  }
  if (user.state === 'rejected') {
    return (
      <div className={s.pendingSteps}>
        <Notice tone="gray" icon={<CircleAlert aria-hidden />}>
          Your membership request was not approved. Contact the club for details.
        </Notice>
      </div>
    );
  }
  if (!needsMembership || !membership) return null;

  if (user.state === 'pending') {
    const fee = formatMoney(membership.fees.entryFee, membership.fees.currency);
    const paying = membership.entryFeeStatus === 'pending';
    const steps: StepItem[] = [
      { title: 'Account created', text: formatPhone(user.phone), state: 'done' },
      paying
        ? { title: 'Entry fee sent', text: 'Awaiting the treasurer', state: 'waiting' }
        : {
            title: `Pay the entry fee · ${fee}`,
            text: 'Upload a payment proof or pay in person',
            state: 'current',
            action: (
              <ButtonLink to="/pass/pay" size="small">
                Pay entry fee
              </ButtonLink>
            ),
          },
      { title: 'Get verified & receive your badge', text: 'Then the member map and secret meetups open' },
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
        <p className={s.alertTitle}>{expired ? 'Membership expired' : 'Dues due'}</p>
        <p className={s.alertText}>
          {next ? `${next.label} · ${formatMoney(next.amount, membership.fees.currency)}` : 'Pay your dues to keep access'}
        </p>
      </div>
      <ButtonLink to="/pass/pay" size="small">
        Pay
      </ButtonLink>
    </Card>
  );
}
