import { t, type Role } from '@identity/shared';
import { CalendarCheck, Globe, ShieldCheck, User, Wallet, type LucideIcon } from 'lucide-react';
import { roleLabel } from '../lib/format';
import { Pill, type Tone } from './ui';

const ROLE_STYLE: Record<Role, { tone: Tone; icon: LucideIcon }> = {
  member: { tone: 'blue', icon: User },
  organizer: { tone: 'orange', icon: CalendarCheck },
  treasurer: { tone: 'green', icon: Wallet },
  admin: { tone: 'purple', icon: ShieldCheck },
};

/** The member's role in the club ("Member", "Admin"…), or "Public" until the membership is confirmed. */
export function RolePill({ role, member = true }: { role: Role; member?: boolean }) {
  if (!member) {
    return (
      <Pill tone="gray" icon={<Globe aria-hidden strokeWidth={2.4} />}>
        {t('Public')}
      </Pill>
    );
  }
  const { tone, icon: Icon } = ROLE_STYLE[role];
  return (
    <Pill tone={tone} icon={<Icon aria-hidden strokeWidth={2.4} />}>
      {roleLabel(role)}
    </Pill>
  );
}
