import type { MembershipState } from '@identity/shared';
import { Check, CircleAlert, Clock, X } from 'lucide-react';
import { STATE_TONE, stateLabel } from '../lib/format';
import { Pill } from './ui';

const ICONS: Record<MembershipState, typeof Check> = {
  active: Check,
  pending: Clock,
  due: Clock,
  expired: CircleAlert,
  suspended: CircleAlert,
  rejected: X,
};

export function StatePill({ state }: { state: MembershipState }) {
  const Icon = ICONS[state];
  return (
    <Pill tone={STATE_TONE[state]} icon={<Icon aria-hidden strokeWidth={2.6} />}>
      {stateLabel(state)}
    </Pill>
  );
}
