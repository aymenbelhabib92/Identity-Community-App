import { addDays, t, todayIn, type Membership, type Payment } from '@identity/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, Upload } from 'lucide-react';
import { useState } from 'react';
import { PaymentDetails, PaymentRow } from '../../components/payments/Payments';
import {
  BackLink,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  LargeTitle,
  List,
  ListRow,
  Loading,
  Screen,
  SectionHeader,
  Sheet,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { dateOf, duesDescription, money } from '../../lib/format';
import { keys, useMembership } from '../../lib/queries';
import { PassCard } from './PassCard';
import s from './pass.module.css';
import { QrSheet } from './QrSheet';

const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Main call to action under the fees: what the member should pay now, if anything. */
function payAction(membership: Membership): { label: string; primary: boolean } | null {
  const { member } = membership;
  if (membership.entryFeeStatus === 'unpaid' && member.status === 'pending') {
    return { label: t('Pay the entry fee'), primary: true };
  }
  if (membership.duesOptions.length === 0) return null;
  const endingSoon = member.paidUntil !== null && member.paidUntil <= addDays(todayIn(deviceTimeZone), 30);
  if (member.state === 'due' || member.state === 'expired' || endingSoon) return { label: t('Pay dues'), primary: true };
  return { label: t('Pay dues in advance'), primary: false };
}

/** The member's pass and membership: card, QR code, fees, payments. Opened from the account screen. */
export default function Pass() {
  const { data: membership, isPending, error, refetch } = useMembership();
  const [qrOpen, setQrOpen] = useState(false);
  const [selected, setSelected] = useState<Payment | null>(null);

  if (isPending || error) {
    return (
      <Screen>
        <BackLink to="/profile">{t('Account')}</BackLink>
        <LargeTitle>{t('Membership')}</LargeTitle>
        {isPending ? <Loading /> : <ErrorState error={error} onRetry={() => void refetch()} />}
      </Screen>
    );
  }

  const { member, fees } = membership;
  const action = payAction(membership);

  return (
    <Screen>
      <BackLink to="/profile">{t('Account')}</BackLink>
      <LargeTitle>{t('Membership')}</LargeTitle>
      <PassCard member={member} onShowQr={() => setQrOpen(true)} />

      <SectionHeader>{t('Fees')}</SectionHeader>
      <List>
        <ListRow title={t('Entry fee & badge')} subtitle={t('One time')} value={money(fees.entryFee, fees.currency)} />
        <ListRow
          title={t('Dues')}
          subtitle={duesDescription(fees.duesPeriodMonths, fees.yearlyDues, fees.currency)}
          value={money(fees.duesAmount, fees.currency)}
        />
        <ListRow title={t('Member since')} value={member.approvedAt ? dateOf(member.approvedAt) : t('Pending')} />
      </List>
      {action && (
        <div className={s.payAction}>
          <ButtonLink
            to="/pass/pay"
            variant={action.primary ? 'primary' : 'secondary'}
            icon={<Upload aria-hidden />}
          >
            {action.label}
          </ButtonLink>
        </div>
      )}

      <SectionHeader>{t('Payments')}</SectionHeader>
      {membership.payments.length === 0 ? (
        <Card>
          <EmptyState icon={<Receipt />}>{t('Your payments and their status will show up here.')}</EmptyState>
        </Card>
      ) : (
        <List>
          {membership.payments.map((payment) => (
            <PaymentRow key={payment.id} payment={payment} onClick={() => setSelected(payment)} />
          ))}
        </List>
      )}

      {member.badgeNumber !== null && <QrSheet open={qrOpen} onClose={() => setQrOpen(false)} member={member} />}
      <PaymentSheet payment={selected} currency={fees.currency} onClose={() => setSelected(null)} />
    </Screen>
  );
}

function PaymentSheet({ payment, currency, onClose }: { payment: Payment | null; currency: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const withdraw = useMutation({
    mutationFn: (id: string) => api.membership.cancelPayment(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.membership });
      onClose();
      toast(t('Payment withdrawn'), 'success');
    },
  });

  return (
    <Sheet open={payment !== null} onClose={onClose} title={payment?.label}>
      {payment && (
        <div className={s.sheetStack}>
          <PaymentDetails payment={payment} currency={currency} />
          {withdraw.error && <ErrorState error={withdraw.error} />}
          {payment.status === 'pending' && (
            <Button variant="danger" loading={withdraw.isPending} onClick={() => withdraw.mutate(payment.id)}>
              {t('Withdraw this payment')}
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}
