import { formatMoney, formatRelative, t, type AdminPayment } from '@identity/shared';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PaymentRow } from '../../components/payments/Payments';
import { BackLink, Card, EmptyState, ErrorState, LargeTitle, List, Loading, Screen, Segmented } from '../../components/ui';
import { api } from '../../lib/api';
import { keys, useClubSettings } from '../../lib/queries';
import s from './admin.module.css';
import { ReviewSheet, type ReviewTarget } from './ReviewSheet';

type Tab = 'pending' | 'all';

export default function AdminPayments() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'history' ? 'all' : 'pending';
  const { data: settings } = useClubSettings();
  const currency = settings?.currency ?? 'DT';
  const [target, setTarget] = useState<ReviewTarget | null>(null);

  const payments = useQuery({
    queryKey: keys.adminPayments(tab),
    queryFn: () => api.admin.payments({ status: tab }),
    refetchInterval: 60_000,
  });

  const subtitle = (payment: AdminPayment) => {
    const parts = [`${payment.label} · ${formatMoney(payment.amount, currency)}`];
    if (payment.status === 'pending') {
      parts.push(payment.method === 'proof' ? t('proof') : t('in person'), formatRelative(payment.createdAt));
    }
    return parts.join(' · ');
  };

  return (
    <Screen>
      <BackLink to="/admin">{t('Admin')}</BackLink>
      <LargeTitle>{t('Payments')}</LargeTitle>
      <Segmented
        className={s.segmented}
        label={t('Payments')}
        value={tab}
        onChange={(value) => setParams(value === 'all' ? { tab: 'history' } : {}, { replace: true })}
        options={[
          { value: 'pending', label: t('To review') },
          { value: 'all', label: t('History') },
        ]}
      />
      {payments.isPending ? (
        <Loading />
      ) : payments.error ? (
        <ErrorState error={payments.error} onRetry={() => void payments.refetch()} />
      ) : payments.data.items.length === 0 ? (
        <Card>
          <EmptyState icon={<CircleCheck />} title={tab === 'pending' ? t('All caught up') : t('No payments yet')}>
            {tab === 'pending' ? t('New proofs and in-person payments to confirm will show up here.') : null}
          </EmptyState>
        </Card>
      ) : (
        <List>
          {payments.data.items.map((payment) => (
            <PaymentRow
              key={payment.id}
              payment={payment}
              title={payment.member.fullName}
              subtitle={subtitle(payment)}
              onClick={() => setTarget({ payment, member: payment.member })}
            />
          ))}
        </List>
      )}
      <ReviewSheet target={target} onClose={() => setTarget(null)} />
    </Screen>
  );
}
