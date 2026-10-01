import { formatBadgeNumber, formatIsoDate, shortName, t, type User } from '@identity/shared';
import { QrCode } from 'lucide-react';
import { Logo } from '../../components/brand/Logo';
import { Shards } from '../../components/brand/Shards';
import { StatePill } from '../../components/StatePill';
import { Avatar } from '../../components/ui';
import { roleLabel } from '../../lib/format';
import s from './pass.module.css';

/** The member card: logo, QR button, photo, name, badge, role, validity. */
export function PassCard({ member, onShowQr }: { member: User; onShowQr: () => void }) {
  const hasBadge = member.badgeNumber !== null;
  return (
    <Shards className={s.pass}>
      <div className={s.passTop}>
        <Logo height={50} className={s.passLogo} />
        {hasBadge && member.state !== 'suspended' ? (
          <button type="button" className={s.qrButton} onClick={onShowQr} aria-label={t('Show my pass QR code')}>
            <QrCode aria-hidden strokeWidth={2} />
          </button>
        ) : (
          <StatePill state={member.state} />
        )}
      </div>
      <div>
        <div className={s.passHolder}>
          {member.avatar && <Avatar name={member.fullName} photo={member.avatar} size={46} />}
          <p className={s.passName}>{shortName(member.fullName)}</p>
        </div>
        <dl className={s.passFields}>
          <div>
            <dt>{t('Badge')}</dt>
            <dd>{hasBadge ? formatBadgeNumber(member.badgeNumber) : t('Pending')}</dd>
          </div>
          <div>
            <dt>{t('Role')}</dt>
            <dd>{roleLabel(member.role)}</dd>
          </div>
          <div>
            <dt>{t('Valid until')}</dt>
            <dd>{member.paidUntil ? formatIsoDate(member.paidUntil) : '—'}</dd>
          </div>
        </dl>
      </div>
    </Shards>
  );
}
