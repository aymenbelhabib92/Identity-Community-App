import { formatBadgeNumber, formatIsoDate, ROLE_LABELS, shortName, type User } from '@identity/shared';
import { QrCode } from 'lucide-react';
import { Logo } from '../../components/brand/Logo';
import { Shards } from '../../components/brand/Shards';
import { StatePill } from '../../components/StatePill';
import s from './pass.module.css';

/** The member card: logo, QR button, name, badge, role, validity. */
export function PassCard({ member, onShowQr }: { member: User; onShowQr: () => void }) {
  const hasBadge = member.badgeNumber !== null;
  return (
    <Shards className={s.pass}>
      <div className={s.passTop}>
        <Logo height={50} className={s.passLogo} />
        {hasBadge && member.state !== 'suspended' ? (
          <button type="button" className={s.qrButton} onClick={onShowQr} aria-label="Show my pass QR code">
            <QrCode aria-hidden strokeWidth={2} />
          </button>
        ) : (
          <StatePill state={member.state} />
        )}
      </div>
      <div>
        <p className={s.passName}>{shortName(member.fullName)}</p>
        <dl className={s.passFields}>
          <div>
            <dt>Badge</dt>
            <dd>{hasBadge ? formatBadgeNumber(member.badgeNumber) : 'Pending'}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{ROLE_LABELS[member.role]}</dd>
          </div>
          <div>
            <dt>Valid until</dt>
            <dd>{member.paidUntil ? formatIsoDate(member.paidUntil) : '—'}</dd>
          </div>
        </dl>
      </div>
    </Shards>
  );
}
