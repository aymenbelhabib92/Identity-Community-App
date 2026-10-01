import {
  formatBadgeNumber,
  formatIsoDate,
  formatMoney,
  formatPhone,
  LANGUAGE_NAMES,
  ROLES,
  t,
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
import { CarPhotoStrip } from '../../components/photos/Photos';
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
import { dateOf, roleLabel } from '../../lib/format';
import { keys } from '../../lib/queries';
import s from './admin.module.css';
import { ReviewSheet, type ReviewTarget } from './ReviewSheet';

type SheetName = 'record' | 'role' | 'suspend' | 'reactivate' | 'approve' | 'decline' | 'password' | null;

export default function AdminMember() {
  const { id = '' } = useParams();
  const member = useQuery({ queryKey: keys.adminMember(id), queryFn: () => api.admin.member(id) });

  return (
    <Screen>
      <BackLink to="/admin/members">{t('Members')}</BackLink>
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
        <Avatar name={member.fullName} photo={member.avatar} size={64} state={member.state} online={member.online} />
        <div>
          <p className={s.memberName}>{member.fullName}</p>
          <div className={s.memberMeta}>
            <StatePill state={member.state} />
            <a href={`tel:${member.phone}`}>{formatPhone(member.phone)}</a>
          </div>
        </div>
      </div>

      <SectionHeader>{t('Membership')}</SectionHeader>
      <List>
        <ListRow title={t('Badge')} value={formatBadgeNumber(member.badgeNumber)} />
        <ListRow title={t('Role')} value={roleLabel(member.role)} />
        <ListRow title={t('Car')} value={member.car ?? '—'} />
        <ListRow title={t('Requested')} value={dateOf(member.createdAt)} />
        <ListRow title={t('Member since')} value={member.approvedAt ? dateOf(member.approvedAt) : '—'} />
        <ListRow title={t('Valid until')} value={member.paidUntil ? formatIsoDate(member.paidUntil) : '—'} />
        <ListRow title={t('Location sharing')} value={member.locationSharing ? t('On') : t('Off')} />
        <ListRow title={t('Language')} value={member.language ? LANGUAGE_NAMES[member.language] : '—'} />
      </List>
      <CarPhotoStrip photos={member.carPhotos} className={s.carPhotos} />

      <SectionHeader>{t('Actions')}</SectionHeader>
      <List>
        <ListRow href={`tel:${member.phone}`} tile={{ icon: <Phone />, color: 'green' }} title={t('Call')} chevron />
        {canRecord && (canRecordEntryFee || canRecordDues) && (
          <ListRow
            tile={{ icon: <Wallet />, color: 'orange' }}
            title={t('Record a payment in person')}
            subtitle={canRecordEntryFee ? `${t('Entry fee')} · ${formatMoney(fees.entryFee, fees.currency)}` : t('Dues')}
            onClick={() => setSheet('record')}
            chevron
          />
        )}
        {canManage && member.status === 'pending' && (
          <ListRow
            tile={{ icon: <UserCheck />, color: 'blue' }}
            title={t('Approve without payment')}
            subtitle={t('Founding members, honorary badges…')}
            onClick={() => setSheet('approve')}
            chevron
          />
        )}
        {canManage && (
          <ListRow
            tile={{ icon: <ShieldCheck />, color: 'purple' }}
            title={t('Change role')}
            value={roleLabel(member.role)}
            onClick={() => setSheet('role')}
            chevron
          />
        )}
        {canManage && (
          <ListRow
            tile={{ icon: <KeyRound />, color: 'gray' }}
            title={t('Temporary password')}
            subtitle={t('When the member forgot theirs')}
            onClick={() => setSheet('password')}
            chevron
          />
        )}
        {canManage && member.status === 'active' && (
          <ListRow tile={{ icon: <Ban />, color: 'red' }} title={t('Suspend')} onClick={() => setSheet('suspend')} destructive />
        )}
        {canManage && member.status === 'suspended' && (
          <ListRow
            tile={{ icon: <CircleCheck />, color: 'green' }}
            title={t('Lift the suspension')}
            onClick={() => setSheet('reactivate')}
            chevron
          />
        )}
        {canManage && member.status === 'pending' && (
          <ListRow
            tile={{ icon: <UserX />, color: 'red' }}
            title={t('Decline the request')}
            onClick={() => setSheet('decline')}
            destructive
          />
        )}
      </List>

      <SectionHeader>{t('Payments')}</SectionHeader>
      {membership.payments.length === 0 ? (
        <Card>
          <EmptyState icon={<Receipt />}>{t('No payment yet.')}</EmptyState>
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
        title={t('Approve without payment?')}
        text={t('The member gets a badge and full access now. The entry fee will not be recorded.')}
        confirm={t('Approve')}
        done={t('Member approved')}
      />
      <StatusSheet
        open={sheet === 'reactivate'}
        onClose={close}
        memberId={member.id}
        body={{ status: 'active' }}
        title={t('Lift the suspension?')}
        text={t('The member gets access to the map and member meetups again.')}
        confirm={t('Lift suspension')}
        done={t('Suspension lifted')}
      />
      <StatusSheet
        open={sheet === 'suspend'}
        onClose={close}
        memberId={member.id}
        body={{ status: 'suspended' }}
        title={t('Suspend this member?')}
        text={t('They lose access to the member map and member-only meetups, and their shared position is deleted.')}
        confirm={t('Suspend')}
        done={t('Member suspended')}
        danger
      />
      <StatusSheet
        open={sheet === 'decline'}
        onClose={close}
        memberId={member.id}
        body={{ status: 'rejected' }}
        title={t('Decline this request?')}
        text={t('Pending payments of this request are rejected too.')}
        confirm={t('Decline')}
        done={t('Request declined')}
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
    t('Role updated'),
    onClose,
  );
  const descriptions: Record<Role, string> = {
    member: t('Map, meetups, pass'),
    organizer: t('Creates meetups, posts announcements, checks passes'),
    treasurer: t('Verifies payments, records cash'),
    admin: t('Everything, including roles and club settings'),
  };
  return (
    <Sheet open={open} onClose={onClose} title={t('Role')}>
      <div className={s.sheetStack}>
        <List>
          {ROLES.map((value) => (
            <ListRow
              key={value}
              title={roleLabel(value)}
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
    t('Payment recorded'),
    onClose,
  );

  return (
    <Sheet open={open} onClose={onClose} title={t('Payment in person')}>
      <div className={s.sheetStack}>
        {entryFeeOpen && membership.duesOptions.length > 0 && (
          <Segmented
            label={t('What was paid')}
            value={kind}
            onChange={setKind}
            options={[
              { value: 'entry_fee', label: t('Entry fee') },
              { value: 'dues', label: t('Dues') },
            ]}
          />
        )}
        {kind === 'entry_fee' ? (
          <List>
            <ListRow title={t('Entry fee & badge')} value={formatMoney(fees.entryFee, fees.currency)} />
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
          <FormRow label={t('Note')} htmlFor="record-note">
            <Input
              id="record-note"
              placeholder={t('e.g. Cash at Coffee & Cars')}
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
            />
          </FormRow>
        </FormList>
        {record.error && <ErrorState error={record.error} />}
        <Button loading={record.isPending} onClick={() => record.mutate(undefined)}>
          {t('Record as received')}
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
      toast(t('Copied'), 'success');
    } catch {
      toast(t('Select the password to copy it'), 'info');
    }
  };

  return (
    <Sheet open={open} onClose={closeAndClear} title={t('Temporary password')}>
      <div className={s.sheetStack}>
        {reset.data ? (
          <>
            <p className={s.text}>
              {t('Give this password to {name}. It is shown only once; they can change it from their account.', { name })}
            </p>
            <p className={s.password}>{reset.data.temporaryPassword}</p>
            <Button variant="secondary" onClick={() => void copy(reset.data.temporaryPassword)}>
              {t('Copy')}
            </Button>
          </>
        ) : (
          <>
            <p className={s.text}>
              {t('{name} will be signed out on every device and will sign in with a new password you give them.', { name })}
            </p>
            {reset.error && <ErrorState error={reset.error} />}
            <Button loading={reset.isPending} onClick={() => reset.mutate()}>
              {t('Create a temporary password')}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
