import {
  formatBadgeNumber,
  formatIsoDate,
  formatPhone,
  ROLE_LABELS,
  toIsoDate,
  zonedParts,
} from '@identity/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Book, Download, KeyRound, LogOut, MonitorSmartphone, Pencil, Share, Shield } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { StatePill } from '../../components/StatePill';
import {
  Avatar,
  BackLink,
  Button,
  ErrorState,
  FieldErrors,
  FormList,
  FormRow,
  Input,
  List,
  ListRow,
  Screen,
  SectionFooter,
  SectionHeader,
  Sheet,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth, useCan, useUser } from '../../lib/auth';
import { fieldErrors } from '../../lib/errors';
import { isIos, isStandalone, useInstallPrompt } from '../../lib/install';
import { keys } from '../../lib/queries';
import s from './misc.module.css';

function dateOf(timestamp: string): string {
  const p = zonedParts(new Date(timestamp));
  return formatIsoDate(toIsoDate(p.y, p.m, p.d));
}

export default function Profile() {
  const user = useUser();
  const { signOut } = useAuth();
  const canViewMembers = useCan('members:view');
  const canReviewPayments = useCan('payments:review');
  const isStaffMember = canViewMembers || canReviewPayments;
  const install = useInstallPrompt();
  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  const logoutEverywhere = useMutation({
    mutationFn: api.auth.logoutEverywhere,
    onSettled: signOut,
  });

  const showInstall = !isStandalone() && (install !== null || isIos());

  return (
    <Screen>
      <BackLink to="/home">Home</BackLink>
      <div className={s.profileHead}>
        <Avatar name={user.fullName} size={84} />
        <p className={s.profileName}>{user.fullName}</p>
        <p className={s.profileMeta}>{formatPhone(user.phone)}</p>
        <StatePill state={user.state} />
      </div>

      <SectionHeader>Membership</SectionHeader>
      <List>
        <ListRow title="Badge" value={formatBadgeNumber(user.badgeNumber)} />
        <ListRow title="Role" value={ROLE_LABELS[user.role]} />
        <ListRow title="Car" value={user.car ?? '—'} />
        <ListRow title="Member since" value={user.approvedAt ? dateOf(user.approvedAt) : 'Pending'} />
        <ListRow title="Valid until" value={user.paidUntil ? formatIsoDate(user.paidUntil) : '—'} />
      </List>

      <SectionHeader>Account</SectionHeader>
      <List>
        <ListRow tile={{ icon: <Pencil />, color: 'blue' }} title="Edit profile" onClick={() => setEditing(true)} chevron />
        <ListRow
          tile={{ icon: <KeyRound />, color: 'gray' }}
          title="Change password"
          onClick={() => setChangingPassword(true)}
          chevron
        />
        <ListRow tile={{ icon: <Book />, color: 'orange' }} title="Club rules" to="/rules" />
        {isStaffMember && <ListRow tile={{ icon: <Shield />, color: 'purple' }} title="Club admin" to="/admin" />}
        {showInstall && (
          <ListRow
            tile={{ icon: <Download />, color: 'green' }}
            title="Install the app"
            subtitle="Full screen, from your home screen"
            onClick={() => (install ? void install() : setIosHint(true))}
            chevron
          />
        )}
      </List>

      <SectionHeader>Session</SectionHeader>
      <List>
        <ListRow tile={{ icon: <LogOut />, color: 'red' }} title="Sign out" onClick={signOut} destructive />
        <ListRow
          tile={{ icon: <MonitorSmartphone />, color: 'red' }}
          title="Sign out on all devices"
          onClick={() => logoutEverywhere.mutate()}
          destructive
        />
      </List>
      <p className={s.version}>Identity Car Community · v{__APP_VERSION__}</p>

      <EditProfileSheet open={editing} onClose={() => setEditing(false)} />
      <PasswordSheet open={changingPassword} onClose={() => setChangingPassword(false)} />
      <Sheet open={iosHint} onClose={() => setIosHint(false)} title="Install on iPhone">
        <List>
          <ListRow icon={<Share />} title="1. Tap Share in Safari" subtitle="The square with an arrow, at the bottom" />
          <ListRow icon={<Download />} title="2. Add to Home Screen" subtitle="Scroll the menu if you don't see it" />
        </List>
        <SectionFooter>The app then opens full screen, like a native app.</SectionFooter>
      </Sheet>
    </Screen>
  );
}

function EditProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [fullName, setFullName] = useState(user.fullName);
  const [car, setCar] = useState(user.car ?? '');

  const save = useMutation({
    mutationFn: () => api.me.update({ fullName, car: car || null }),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.me, updated);
      toast('Profile updated', 'success');
      onClose();
    },
  });
  const errors = fieldErrors(save.error);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Edit profile">
      <form className={s.form} onSubmit={submit} noValidate>
        <div>
          <FormList>
            <FormRow label="Full name" htmlFor="profile-name" invalid={Boolean(errors.fullName)}>
              <Input id="profile-name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </FormRow>
            <FormRow label="Car" htmlFor="profile-car" invalid={Boolean(errors.car)}>
              <Input
                id="profile-car"
                placeholder="Make, model, year"
                value={car}
                onChange={(event) => setCar(event.target.value)}
              />
            </FormRow>
          </FormList>
          <FieldErrors errors={[errors.fullName, errors.car]} />
        </div>
        {save.error && Object.keys(errors).length === 0 && <ErrorState error={save.error} />}
        <Button type="submit" loading={save.isPending}>
          Save
        </Button>
      </form>
    </Sheet>
  );
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signIn } = useAuth();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const change = useMutation({
    mutationFn: () => api.me.changePassword({ currentPassword, newPassword }),
    onSuccess: (response) => {
      signIn(response);
      toast('Password changed. Other devices are signed out.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      onClose();
    },
  });
  const errors = fieldErrors(change.error);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    change.mutate();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Change password">
      <form className={s.form} onSubmit={submit} noValidate>
        <div>
          <FormList>
            <FormRow label="Current" htmlFor="current-password" invalid={Boolean(errors.currentPassword)}>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </FormRow>
            <FormRow label="New" htmlFor="new-password" invalid={Boolean(errors.newPassword)}>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                placeholder="8 characters min."
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </FormRow>
          </FormList>
          <FieldErrors errors={[errors.currentPassword, errors.newPassword]} />
        </div>
        {change.error && Object.keys(errors).length === 0 && <ErrorState error={change.error} />}
        <Button type="submit" loading={change.isPending} disabled={!currentPassword || !newPassword}>
          Change password
        </Button>
      </form>
    </Sheet>
  );
}
