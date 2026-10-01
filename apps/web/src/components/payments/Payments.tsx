import { formatDayDateTime, formatMoney, shortName, t, type Payment } from '@identity/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, Clock, FileText, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import { PAYMENT_STATUS, paymentSubtitle } from '../../lib/format';
import { ErrorState, List, ListRow, Spinner } from '../ui';
import s from './payments.module.css';

const STATUS_ICON = { pending: Clock, verified: Check, rejected: X };
const STATUS_TEXT = { orange: s.textOrange, green: s.textGreen, red: s.textRed };

export function PaymentRow({
  payment,
  title,
  subtitle,
  onClick,
}: {
  payment: Payment;
  title?: ReactNode;
  subtitle?: ReactNode;
  onClick?: () => void;
}) {
  const status = PAYMENT_STATUS[payment.status];
  const Icon = STATUS_ICON[payment.status];
  return (
    <ListRow
      tile={{ icon: <Icon strokeWidth={2.6} />, color: status.tone }}
      title={title ?? payment.label}
      subtitle={subtitle ?? paymentSubtitle(payment)}
      value={t(status.label)}
      valueClassName={STATUS_TEXT[status.tone]}
      onClick={onClick}
      chevron={false}
    />
  );
}

/** Amount, method, dates, notes and the proof of a payment. */
export function PaymentDetails({ payment, currency = 'DT' }: { payment: Payment; currency?: string }) {
  return (
    <div className={s.stack}>
      <List>
        <ListRow title={t('Amount')} value={formatMoney(payment.amount, currency)} />
        <ListRow title={t('Method')} value={payment.method === 'proof' ? t('Proof upload') : t('In person')} />
        <ListRow title={t('Submitted')} value={formatDayDateTime(payment.createdAt)} />
        {payment.reviewedAt && (
          <ListRow
            title={payment.status === 'rejected' ? t('Rejected') : t('Verified')}
            value={`${formatDayDateTime(payment.reviewedAt)}${payment.reviewedBy ? ` · ${shortName(payment.reviewedBy.fullName)}` : ''}`}
          />
        )}
        {payment.note && <ListRow title={t('Note')} subtitle={payment.note} />}
        {payment.reviewNote && <ListRow title={t("Treasurer's note")} subtitle={payment.reviewNote} />}
      </List>
      {payment.hasProof && <ProofPreview paymentId={payment.id} />}
    </div>
  );
}

/** Proofs are private: fetched with the session token, shown from a local object URL. */
export function ProofPreview({ paymentId }: { paymentId: string }) {
  const proof = useQuery({
    queryKey: ['proof', paymentId],
    queryFn: () => api.membership.proof(paymentId),
    staleTime: Infinity,
    gcTime: 60_000,
  });
  const [url, setUrl] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (!proof.data) return;
    const objectUrl = URL.createObjectURL(proof.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [proof.data]);

  if (proof.isPending) {
    return (
      <div className={s.proofLoading}>
        <Spinner />
      </div>
    );
  }
  if (proof.error) return <ErrorState error={proof.error} />;
  if (!url) return null;

  const isImage = proof.data.type.startsWith('image/') && !broken;
  return isImage ? (
    <a href={url} target="_blank" rel="noreferrer" aria-label={t('Open the proof in full size')}>
      <img src={url} alt={t('Payment proof')} className={s.proofImage} onError={() => setBroken(true)} />
    </a>
  ) : (
    <a href={url} target="_blank" rel="noreferrer" className={s.proofFile}>
      <FileText aria-hidden />
      {proof.data.type === 'application/pdf' ? t('Open the proof (PDF)') : t('Open the proof (file)')}
    </a>
  );
}
