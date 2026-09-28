import {
  formatBadgeNumber,
  formatIsoDate,
  formatMoney,
  formatPhone,
  ROLE_LABELS,
  ROLES,
  toIsoDate,
  zonedParts,
  type Membership,
  type PaymentKind,
  type Role,
  type UpdateMemberBody,
} from '@identity/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, CircleCheck, KeyRound, Phone, Receipt, ShieldCheck, UserCheck, UserX, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { PaymentRow } from '../../components/payments/Payments';
import { StatePill } from '../../components/StatePill';
import {
  Avatar,
  BackLink,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormList,
  FormRow,
  Input,
  List,
  ListRow,
  Loading,
  Screen,
  SectionHeader,
  Segmented,
  Sheet,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useCan, useUser } from '../../lib/auth';
import { keys } from '../../lib/queries';
import s from './admin.module.css';
import { ReviewSheet, type ReviewTarget } from './ReviewSheet';

function dateOf(timestamp: string): string {
  const p = zonedParts(new Date(timestamp));
  return formatIsoDate(toIsoDate(p.y, p.m, p.d));
}

type SheetName = 'record' | 'role' | 'suspend' | 'reactivate' | 'approve' | 'decline' | 'password' | null;

export default function AdminMember() {
  const { id = '' } = useParams();
  const member = useQuery({ queryKey: keys.adminMember(id), queryFn: () => api.admin.member(id) });

  return (
    <Screen>
      <BackLink to="/admin/members">Members</BackLink>
      {member.isPending ? (
        <Loading />
      ) : member.error ? (
        <ErrorState error={member.error} onRetry={() => void member.refetch()} />
      ) : (
        <MemberDetail membership={member.data} />
      )}
    </Screen>
  );
}

function MemberDetail({ membership }: { membership: Membership }) {
  const me = useUser();
  const { member, fees } = membership;
  const canManage = useCan('members:manage') && member.id !== me.id;
  const canRecord = useCan('payments:review');
  const [sheet, setSheet] = useState<SheetName>(null);
  const [review, setReview] = useState<ReviewTarget | null>(null);
  const close = () => setSheet(null);

  const canRecordEntryFee = membership.entryFeeStatus === 'unpaid' && member.status === 'pending';
  const canRecordDues = membership.duesOptions.length > 0;

  return (
    <>
      <div className={s.memberHead}>
        <Avatar name={member.fullName} size={64} />
        <div>
          <p className={s.memberName}>{member.fullName}</p>
          <div className={s.memberMeta}>
            <StatePill state={member.state} />
            <a href={`tel:${member.phone}`}>{formatPhone(member.phone)}</a>
          </div>
        </div>
      </div>

      <SectionHeader>Membership</SectionHeader>
      <List>
        <ListRow title="Badge" value={formatBadgeNumber(member.badgeNumber)} />
        <ListRow title="Role" value={ROLE_LABELS[member.role]} />
        <ListRow title="Car" value={member.car ?? '—'} />
        <ListRow title="Requested" value={dateOf(member.createdAt)} />
        <ListRow title="Member since" value={member.approvedAt ? dateOf(member.approvedAt) : '—'} />
        <ListRow title="Valid until" value={member.paidUntil ? formatIsoDate(member.paidUntil) : '—'} />
        <ListRow title="Location sharing" value={member.locationSharing ? 'On' : 'Off'} />
      </List>

      <SectionHeader>Actions</SectionHeader>
      <List>
        <ListRow href={`tel:${member.phone}`} tile={{ icon: <Phone />, color: 'green' }} title="Call" chevron />
        {canRecord && (canRecordEntryFee || canRecordDues) && (
          <ListRow
            tile={{ icon: <Wallet />, color: 'orange' }}
            title="Record a payment in person"
            subtitle={canRecordEntryFee ? `Entry fee · ${formatMoney(fees.entryFee, fees.currency)}` : 'Dues'}
            onClick={() => setSheet('record')}
            chevron
          />
        )}
        {canManage && member.status === 'pending' && (
          <ListRow
            tile={{ icon: <UserCheck />, color: 'blue' }}
            title="Approve without payment"
            subtitle="Founding members, honorary badges…"
            onClick={() => setSheet('approve')}
            chevron
          />
        )}
        {canManage && (
          <ListRow
            tile={{ icon: <ShieldCheck />, color: 'purple' }}
            title="Change role"
            value={ROLE_LABELS[member.role]}
            onClick={() => setSheet('role')}
            chevron
          />
        )}
        {canManage && (
          <ListRow
            tile={{ icon: <KeyRound />, color: 'gray' }}
            title="Temporary password"
            subtitle="When the member forgot theirs"
            onClick={() => setSheet('password')}
            chevron
          />
        )}
        {canManage && member.status === 'active' && (
          <ListRow tile={{ icon: <Ban />, color: 'red' }} title="Suspend" onClick={() => setSheet('suspend')} destructive />
        )}
        {canManage && member.status === 'suspended' && (
          <ListRow
            tile={{ icon: <CircleCheck />, color: 'green' }}
            title="Lift the suspension"
            onClick={() => setSheet('reactivate')}
            chevron
          />
        )}
        {canManage && member.status === 'pending' && (
          <ListRow tile={{ icon: <UserX />, color: 'red' }} title="Decline the request" onClick={() => setSheet('decline')} destructive />
        )}
      </List>

      <SectionHeader>Payments</SectionHeader>
      {membership.payments.length === 0 ? (
        <Card>
          <EmptyState icon={<Receipt />}>No payment yet.</EmptyState>
        </Card>
      ) : (
        <List>
          {membership.payments.map((payment) => (
            <PaymentRow key={payment.id} payment={payment} onClick={() => setReview({ payment, member })} />
          ))}
        </List>
      )}

      <RecordSheet
        key={`${membership.entryFeeStatus}-${member.status}`}
        open={sheet === 'record'}
        onClose={close}
        membership={membership}
      />
      <RoleSheet open={sheet === 'role'} onClose={close} memberId={member.id} role={member.role} />
      <StatusSheet
        open={sheet === 'approve'}
        onClose={close}
        memberId={member.id}
        body={{ status: 'active' }}
        title="Approve without payment?"
        text="The member gets a badge and full access now. The entry fee will not be recorded."
        confirm="Approve"
        done="Member approved"
      />
      <StatusSheet
        open={sheet === 'reactivate'}
        onClose={close}
        memberId={member.id}
        body={{ status: 'active' }}
        title="Lift the suspension?"
        text="The member gets access to the map and member meetups again."
        confirm="Lift suspension"
        done="Suspension lifted"
      />
      <StatusSheet
        open={sheet === 'suspend'}
        onClose={close}
        memberId={member.id}
        body={{ status: 'suspended' }}
        title="Suspend this member?"
        text="They lose access to the member map and member-only meetups, and their shared position is deleted."
        confirm="Suspend"
        done="Member suspended"
        danger
      />
      <StatusSheet
        open={sheet === 'decline'}
        onClose={close}
        memberId={member.id}
        body={{ status: 'rejected' }}
        title="Decline this request?"
        text="Pending payments of this request are rejected too."
        confirm="Decline"
        done="Request declined"
        danger
      />
      <PasswordSheet open={sheet === 'password'} onClose={close} memberId={member.id} name={member.fullName} />
      <ReviewSheet target={review} onClose={() => setReview(null)} />
    </>
  );
}

function useMemberMutation<T>(memberId: string, mutationFn: (value: T) => Promise<unknown>, done: string, onDone: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.admin });
      void queryClient.invalidateQueries({ queryKey: keys.adminMember(memberId) });
      toast(done, 'success');
      onDone();
    },
  });
}

function StatusSheet({
  open,
  onClose,
  memberId,
  body,
  title,
  text,
  confirm,
  done,
  danger,
}: {
  open: boolean;
  onClose: () => void;
  memberId: string;
  body: UpdateMemberBody;
  title: string;
  text: string;
  confirm: string;
  done: string;
  danger?: boolean;
}) {
  const update = useMemberMutation(memberId, () => api.admin.updateMember(memberId, body), done, onClose);
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className={s.sheetStack}>
        <p className={s.text}>{text}</p>
        {update.error && <ErrorState error={update.error} />}
        <Button variant={danger ? 'danger' : 'primary'} loading={update.isPending} onClick={() => update.mutate(undefined)}>
          {confirm}
        </Button>
      </div>
    </Sheet>
  );
}

function RoleSheet({ open, onClose, memberId, role }: { open: boolean; onClose: () => void; memberId: string; role: Role }) {
  const update = useMemberMutation(
    memberId,
    (next: Role) => api.admin.updateMember(memberId, { role: next }),
    'Role updated',
    onClose,
  );
  const descriptions: Record<Role, string> = {
    member: 'Map, meetups, pass',
    organizer: 'Creates meetups, posts announcements, checks passes',
    treasurer: 'Verifies payments, records cash',
    admin: 'Everything, including roles and club settings',
  };
  return (
    <Sheet open={open} onClose={onClose} title="Role">
      <div className={s.sheetStack}>
        <List>
          {ROLES.map((value) => (
            <ListRow
              key={value}
              title={ROLE_LABELS[value]}
              subtitle={descriptions[value]}
              onClick={() => value !== role && update.mutate(value)}
              trailing={value === role ? <Check className={s.check} aria-hidden strokeWidth={3} /> : undefined}
            />
          ))}
        </List>
        {update.error && <ErrorState error={update.error} />}
      </div>
    </Sheet>
  );
}

function RecordSheet({ open, onClose, membership }: { open: boolean; onClose: () => void; membership: Membership }) {
  const { member, fees } = membership;
  const entryFeeOpen = membership.entryFeeStatus === 'unpaid' && member.status === 'pending';
  const [kind, setKind] = useState<PaymentKind>(entryFeeOpen ? 'entry_fee' : 'dues');
  const [periods, setPeriods] = useState(1);
  const [note, setNote] = useState('');
  const record = useMemberMutation(
    member.id,
    () => api.admin.recordPayment(member.id, { kind, periods: kind === 'dues' ? periods : undefined, note: note || undefined }),
    'Payment recorded',
    onClose,
  );

  return (
    <Sheet open={open} onClose={onClose} title="Payment in person">
      <div className={s.sheetStack}>
        {entryFeeOpen && membership.duesOptions.length > 0 && (
          <Segmented
            label="What was paid"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'entry_fee', label: 'Entry fee' },
              { value: 'dues', label: 'Dues' },
            ]}
          />
        )}
        {kind === 'entry_fee' ? (
          <List>
            <ListRow title="Entry fee & badge" value={formatMoney(fees.entryFee, fees.currency)} />
          </List>
        ) : (
          <List>
            {membership.duesOptions.map((option) => (
              <ListRow
                key={option.periods}
                title={option.label}
                value={formatMoney(option.amount, fees.currency)}
                onClick={() => setPeriods(option.periods)}
                trailing={
                  <Check
                    className={s.check}
                    aria-hidden
                    strokeWidth={3}
                    style={{ visibility: option.periods === periods ? 'visible' : 'hidden' }}
                  />
                }
              />
            ))}
          </List>
        )}
        <FormList>
          <FormRow label="Note" htmlFor="record-note">
            <Input
              id="record-note"
              placeholder="e.g. Cash at Coffee & Cars"
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
            />
          </FormRow>
        </FormList>
        {record.error && <ErrorState error={record.error} />}
        <Button loading={record.isPending} onClick={() => record.mutate(undefined)}>
          Record as received
        </Button>
      </div>
    </Sheet>
  );
}

function PasswordSheet({ open, onClose, memberId, name }: { open: boolean; onClose: () => void; memberId: string; name: string }) {
  const toast = useToast();
  const reset = useMutation({ mutationFn: () => api.admin.resetPassword(memberId) });
  const closeAndClear = () => {
    reset.reset();
    onClose();
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast('Copied', 'success');
    } catch {
      toast('Select the password to copy it', 'info');
    }
  };

  return (
    <Sheet open={open} onClose={closeAndClear} title="Temporary password">
      <div className={s.sheetStack}>
        {reset.data ? (
          <>
            <p className={s.text}>
              Give this password to {name}. It is shown only once; they can change it from their profile.
            </p>
            <p className={s.password}>{reset.data.temporaryPassword}</p>
            <Button variant="secondary" onClick={() => void copy(reset.data.temporaryPassword)}>
              Copy
            </Button>
          </>
        ) : (
          <>
            <p className={s.text}>
              {name} will be signed out on every device and will sign in with a new password you give them.
            </p>
            {reset.error && <ErrorState error={reset.error} />}
            <Button loading={reset.isPending} onClick={() => reset.mutate()}>
              Create a temporary password
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
