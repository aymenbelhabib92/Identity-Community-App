import { formatBadgeNumber, t, type User } from '@identity/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ErrorState, Sheet, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import s from './pass.module.css';

/**
 * The QR code holds a link to /verify with a pass token valid 10 minutes, so a
 * screenshot shared later is useless. The token sits in the URL fragment, which
 * browsers never send to servers.
 */
export function QrSheet({ open, onClose, member }: { open: boolean; onClose: () => void; member: User }) {
  const token = useQuery({
    queryKey: ['pass', 'token'],
    queryFn: api.pass.token,
    enabled: open,
    refetchInterval: 8 * 60_000,
    gcTime: 0,
  });
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    if (!token.data) return;
    let cancelled = false;
    void import('qrcode').then(({ default: QRCode }) =>
      QRCode.toDataURL(`${window.location.origin}/verify#${token.data.token}`, {
        margin: 1,
        width: 600,
        errorCorrectionLevel: 'M',
      }).then((url) => {
        if (!cancelled) setImage(url);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [token.data]);

  return (
    <Sheet open={open} onClose={onClose} title={t('Member pass')}>
      {token.error ? (
        <ErrorState error={token.error} />
      ) : (
        <>
          <div className={s.qrBox}>{image ? <img src={image} alt={t('Pass QR code')} /> : <Spinner />}</div>
          <p className={s.qrName}>{member.fullName}</p>
          <p className={s.qrMeta}>{t('Badge {badge}', { badge: formatBadgeNumber(member.badgeNumber) })}</p>
          <p className={s.qrHint}>{t('Show this code to an organizer at check-in. It refreshes every few minutes.')}</p>
        </>
      )}
    </Sheet>
  );
}
