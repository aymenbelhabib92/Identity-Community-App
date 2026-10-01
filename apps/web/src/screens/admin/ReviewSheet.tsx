import { formatBadgeNumber, t, type Payment } from '@identity/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { PaymentDetails } from '../../components/payments/Payments';
import { Avatar, Button, ErrorState, Sheet, TextArea, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { useCan } from '../../lib/auth';
import { keys } from '../../lib/queries';
import s from './admin.module.css';

export interface ReviewTarget {
  payment: Payment;
  member: { id: string; fullName: string; avatar: string | null; badgeNumber: number | null };
}

/** Payment details with Verify / Reject for the treasurer. */
export function ReviewSheet({ target, onClose }: { target: ReviewTarget | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canReview = useCan('payments:review');
  const [note, setNote] = useState('');
  useEffect(() => setNote(''), [target?.payment.id]);

  const review = useMutation({
    mutationFn: (decision: 'verify' | 'reject') =>
      api.admin.reviewPayment(target!.payment.id, { decision, note: note.trim() || undefined }),
    onSuccess: (payment) => {
      void queryClient.invalidateQueries({ queryKey: keys.admin });
      toast(payment.status === 'verified' ? t('Payment verified. The member is notified.') : t('Payment rejected'), 'success');
      onClose();
    },
  });

  const payment = target?.payment;
  const pending = payment?.status === 'pending' && canReview;

  return (
    <Sheet open={target !== null} onClose={onClose} title={payment?.label}>
      {target && payment && (
        <div className={s.sheetStack}>
          <Link to={`/admin/members/${target.member.id}`} className={s.reviewMember} onClick={onClose}>
            <Avatar name={target.member.fullName} photo={target.member.avatar} size={40} />
            <div>
              <p>{target.member.fullName}</p>
              <p className={s.text}>
                {target.member.badgeNumber !== null
                  ? t('Badge {badge}', { badge: formatBadgeNumber(target.member.badgeNumber) })
                  : t('Membership request')}
              </p>
            </div>
          </Link>
          <PaymentDetails payment={payment} />
          {pending && (
            <>
              <TextArea
                aria-label={t('Note to the member')}
                placeholder={t('Note to the member (optional, e.g. why it is rejected)')}
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                style={{ minHeight: 80 }}
              />
              {review.error && <ErrorState error={review.error} />}
              <div className={s.reviewButtons}>
                <Button
                  variant="danger"
                  icon={<X aria-hidden strokeWidth={3} />}
                  loading={review.isPending && review.variables === 'reject'}
                  disabled={review.isPending}
                  onClick={() => review.mutate('reject')}
                >
                  {t('Reject')}
                </Button>
                <Button
                  variant="success"
                  icon={<Check aria-hidden strokeWidth={3} />}
                  loading={review.isPending && review.variables === 'verify'}
                  disabled={review.isPending}
                  onClick={() => review.mutate('verify')}
                >
                  {payment.method === 'in_person' ? t('Received') : t('Verify')}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
