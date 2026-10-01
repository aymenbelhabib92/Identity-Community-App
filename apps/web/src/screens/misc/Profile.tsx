import {
  formatBadgeNumber,
  formatIsoDate,
  formatPhone,
  LANGUAGE_NAMES,
  LANGUAGES,
  t,
  type Language,
  type User,
} from '@identity/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Book,
  Camera,
  CarFront,
  Check,
  CreditCard,
  Download,
  KeyRound,
  Languages,
  LogOut,
  MonitorSmartphone,
  Pencil,
  Shield,
  SunMoon,
  Trash2,
} from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { InstallHelpSheet } from '../../components/install/InstallHelpSheet';
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
import { errorMessage, fieldErrors } from '../../lib/errors';
import { useInstallStatus } from '../../lib/install';
import { photoForm, preparePhoto } from '../../lib/photos';
import { changeLanguage, changeTheme, THEMES, useLanguage, useTheme, type Theme } from '../../lib/preferences';
import { keys } from '../../lib/queries';
import s from './misc.module.css';

/** English source texts, translated when displayed. */
const THEME_LABELS: Record<Theme, string> = { dark: 'Dark', light: 'Light', system: 'Automatic' };

type SheetName = 'photo' | 'edit' | 'password' | 'language' | 'theme' | 'install' | null;

/**
 * The account screen, opened from the avatar at the top right of Home: profile
 * photo, pass and membership, car, language, theme, password, session.
 */
export default function Profile() {
  const user = useUser();
  const { signOut } = useAuth();
  const canViewMembers = useCan('members:view');
  const canReviewPayments = useCan('payments:review');
  const isStaffMember = canViewMembers || canReviewPayments;
  const install = useInstallStatus();
  const language = useLanguage();
  const theme = useTheme();
  const [sheet, setSheet] = useState<SheetName>(null);
  const close = () => setSheet(null);

  const logoutEverywhere = useMutation({
    mutationFn: api.auth.logoutEverywhere,
    onSettled: signOut,
  });

  const showInstall = install.installed === false && install.installable;
  const passSummary = [
    user.badgeNumber !== null ? t('Badge {badge}', { badge: formatBadgeNumber(user.badgeNumber) }) : null,
    user.paidUntil ? t('valid until {date}', { date: formatIsoDate(user.paidUntil) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen>
      <BackLink to="/home">{t('Home')}</BackLink>
      <div className={s.profileHead}>
        <button type="button" className={s.avatarButton} onClick={() => setSheet('photo')} aria-label={t('Change my profile photo')}>
          <Avatar name={user.fullName} photo={user.avatar} size={96} state={user.state} online />
          <span className={s.avatarBadge} aria-hidden>
            <Camera strokeWidth={2.2} />
          </span>
        </button>
        <p className={s.profileName}>{user.fullName}</p>
        <p className={s.profileMeta}>{formatPhone(user.phone)}</p>
        <StatePill state={user.state} />
      </div>

      <List>
        <ListRow
          to="/pass"
          tile={{ icon: <CreditCard />, color: 'blue' }}
          title={t('Pass & membership')}
          subtitle={passSummary || t('Fees, payments, QR code')}
        />
      </List>

      <SectionHeader>{t('Profile')}</SectionHeader>
      <List>
        <ListRow tile={{ icon: <Pencil />, color: 'blue' }} title={t('Edit profile')} onClick={() => setSheet('edit')} chevron />
        <ListRow
          to="/profile/car"
          tile={{ icon: <CarFront />, color: 'orange' }}
          title={t('My car')}
          subtitle={user.car ?? t('Add your car and its photos')}
        />
      </List>

      <SectionHeader>{t('Preferences')}</SectionHeader>
      <List>
        <ListRow
          tile={{ icon: <Languages />, color: 'green' }}
          title={t('Language')}
          value={LANGUAGE_NAMES[language]}
          onClick={() => setSheet('language')}
          chevron
        />
        <ListRow
          tile={{ icon: <SunMoon />, color: 'purple' }}
          title={t('Appearance')}
          value={t(THEME_LABELS[theme])}
          onClick={() => setSheet('theme')}
          chevron
        />
      </List>

      <SectionHeader>{t('Account')}</SectionHeader>
      <List>
        <ListRow
          tile={{ icon: <KeyRound />, color: 'gray' }}
          title={t('Change password')}
          onClick={() => setSheet('password')}
          chevron
        />
        <ListRow tile={{ icon: <Book />, color: 'orange' }} title={t('Club rules')} to="/rules" />
        {isStaffMember && <ListRow tile={{ icon: <Shield />, color: 'purple' }} title={t('Club admin')} to="/admin" />}
        {showInstall && (
          <ListRow
            tile={{ icon: <Download />, color: 'green' }}
            title={t('Install the app')}
            subtitle={t('Full screen, from your home screen')}
            onClick={() => (install.prompt ? void install.prompt() : setSheet('install'))}
            chevron
          />
        )}
      </List>

      <SectionHeader>{t('Session')}</SectionHeader>
      <List>
        <ListRow tile={{ icon: <LogOut />, color: 'red' }} title={t('Sign out')} onClick={signOut} destructive />
        <ListRow
          tile={{ icon: <MonitorSmartphone />, color: 'red' }}
          title={t('Sign out on all devices')}
          onClick={() => logoutEverywhere.mutate()}
          destructive
        />
      </List>
      <p className={s.version}>Identity Car Community · v{__APP_VERSION__}</p>

      <PhotoSheet open={sheet === 'photo'} onClose={close} user={user} />
      <EditProfileSheet open={sheet === 'edit'} onClose={close} />
      <PasswordSheet open={sheet === 'password'} onClose={close} />
      <LanguageSheet open={sheet === 'language'} onClose={close} user={user} />
      <ThemeSheet open={sheet === 'theme'} onClose={close} />
      <InstallHelpSheet open={sheet === 'install'} onClose={close} platform={install.platform} />
    </Screen>
  );
}

/** Choose, replace or remove the profile photo. */
function PhotoSheet({ open, onClose, user }: { open: boolean; onClose: () => void; user: User }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);

  const done = (updated: User, message: string) => {
    queryClient.setQueryData(keys.me, updated);
    toast(message, 'success');
    onClose();
  };
  const upload = useMutation({
    mutationFn: async (file: File) => api.me.setAvatar(photoForm(await preparePhoto(file, { size: 512, square: true }))),
    onSuccess: (updated) => done(updated, t('Profile photo updated')),
  });
  const remove = useMutation({
    mutationFn: api.me.removeAvatar,
    onSuccess: (updated) => done(updated, t('Profile photo removed')),
  });
  const error = upload.error ?? remove.error;

  return (
    <Sheet open={open} onClose={onClose} title={t('Profile photo')}>
      <div className={s.form}>
        <div className={s.photoPreview}>
          <Avatar name={user.fullName} photo={user.avatar} size={148} />
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) upload.mutate(file);
          }}
        />
        {error && <ErrorState error={error} />}
        <Button icon={<Camera aria-hidden />} loading={upload.isPending} onClick={() => input.current?.click()}>
          {user.avatar ? t('Choose another photo') : t('Choose a photo')}
        </Button>
        {user.avatar && (
          <Button variant="danger" icon={<Trash2 aria-hidden />} loading={remove.isPending} onClick={() => remove.mutate()}>
            {t('Remove the photo')}
          </Button>
        )}
        <SectionFooter>{t('Your photo is shown to the members of the club. It is cropped to a square.')}</SectionFooter>
      </div>
    </Sheet>
  );
}

function LanguageSheet({ open, onClose, user }: { open: boolean; onClose: () => void; user: User }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const language = useLanguage();

  const choose = (next: Language) => {
    onClose();
    if (next === language) return;
    // The account remembers the choice (notifications are written in it); the whole app is then shown again.
    queryClient.setQueryData(keys.me, { ...user, language: next });
    changeLanguage(next);
    api.me
      .update({ language: next })
      .then(
        (updated) => queryClient.setQueryData(keys.me, updated),
        (error: unknown) => toast(errorMessage(error), 'error'),
      )
      // Labels written by the server (payments, dues periods) come back in the new language.
      .finally(() => void queryClient.invalidateQueries());
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('Language')}>
      <List>
        {LANGUAGES.map((value) => (
          <ListRow
            key={value}
            title={LANGUAGE_NAMES[value]}
            onClick={() => choose(value)}
            trailing={value === language ? <Check className={s.check} aria-hidden strokeWidth={3} /> : undefined}
          />
        ))}
      </List>
      <SectionFooter>{t('Notifications are written in this language too.')}</SectionFooter>
    </Sheet>
  );
}

function ThemeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useTheme();
  return (
    <Sheet open={open} onClose={onClose} title={t('Appearance')}>
      <List>
        {THEMES.map((value) => (
          <ListRow
            key={value}
            title={t(THEME_LABELS[value])}
            subtitle={value === 'system' ? t('Follows the setting of your phone') : undefined}
            onClick={() => {
              changeTheme(value);
              onClose();
            }}
            trailing={value === theme ? <Check className={s.check} aria-hidden strokeWidth={3} /> : undefined}
          />
        ))}
      </List>
    </Sheet>
  );
}

function EditProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [fullName, setFullName] = useState(user.fullName);

  const save = useMutation({
    mutationFn: () => api.me.update({ fullName }),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.me, updated);
      toast(t('Profile updated'), 'success');
      onClose();
    },
  });
  const errors = fieldErrors(save.error);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('Edit profile')}>
      <form className={s.form} onSubmit={submit} noValidate>
        <div>
          <FormList>
            <FormRow label={t('Full name')} htmlFor="profile-name" invalid={Boolean(errors.fullName)}>
              <Input id="profile-name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </FormRow>
          </FormList>
          <FieldErrors errors={[errors.fullName]} />
        </div>
        {save.error && Object.keys(errors).length === 0 && <ErrorState error={save.error} />}
        <Button type="submit" loading={save.isPending}>
          {t('Save')}
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
      toast(t('Password changed. Other devices are signed out.'), 'success');
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
    <Sheet open={open} onClose={onClose} title={t('Change password')}>
      <form className={s.form} onSubmit={submit} noValidate>
        <div>
          <FormList>
            <FormRow label={t('Current')} htmlFor="current-password" invalid={Boolean(errors.currentPassword)}>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </FormRow>
            <FormRow label={t('New')} htmlFor="new-password" invalid={Boolean(errors.newPassword)}>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                placeholder={t('8 characters min.')}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </FormRow>
          </FormList>
          <FieldErrors errors={[errors.currentPassword, errors.newPassword]} />
        </div>
        {change.error && Object.keys(errors).length === 0 && <ErrorState error={change.error} />}
        <Button type="submit" loading={change.isPending} disabled={!currentPassword || !newPassword}>
          {t('Change password')}
        </Button>
      </form>
    </Sheet>
  );
}
