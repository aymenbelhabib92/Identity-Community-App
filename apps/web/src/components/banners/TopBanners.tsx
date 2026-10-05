import { t } from '@identity/shared';
import { Bell, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../../lib/auth';
import { errorMessage } from '../../lib/errors';
import { useInstallStatus } from '../../lib/install';
import { enablePush, usePushStatus } from '../../lib/push';
import { InstallHelpSheet } from '../install/InstallHelpSheet';
import { useToast } from '../ui';
import s from './banners.module.css';

// English source texts, translated when displayed.
const INSTALL_SUBTITLE = {
  ios: 'Add it to your Home Screen',
  android: 'Full screen, from your home screen',
  'mac-safari': 'Add it to your Dock',
  'in-app': 'Open this page in your browser to install',
  other: 'Full screen, one tap away',
} as const;

/**
 * Banners at the top of the screen, shown each time the app is opened until
 * the member acts on them (closing one hides it until the next opening):
 * 1. install the app, unless the device says it is already installed;
 * 2. then turn on notifications, if this device can receive them and the member
 *    was never asked (on iPhone, only once the app is installed).
 */
export function TopBanners() {
  const { user } = useAuth();
  const install = useInstallStatus();
  const push = usePushStatus();
  const toast = useToast();
  const [installClosed, setInstallClosed] = useState(false);
  const [pushClosed, setPushClosed] = useState(false);
  const [installHelp, setInstallHelp] = useState(false);
  const [enabling, setEnabling] = useState(false);

  const showInstall = install.installed === false && install.installable && !installClosed;
  const showPush = !showInstall && user !== undefined && push.state === 'off' && push.askable && !pushClosed;

  // Screens leave room at the top while a banner is shown (see --banner-space).
  const visible = showInstall || showPush;
  useEffect(() => {
    document.documentElement.toggleAttribute('data-top-banner', visible);
    return () => document.documentElement.removeAttribute('data-top-banner');
  }, [visible]);

  const installApp = async () => {
    if (!install.prompt) {
      setInstallHelp(true);
      return;
    }
    if (await install.prompt()) setInstallClosed(true);
  };

  // Straight from the tap: browsers only show their permission dialog for one.
  const turnOn = () => {
    setEnabling(true);
    enablePush()
      .then(() => toast(t('Notifications are on'), 'success'))
      .catch((error: unknown) => {
        toast(errorMessage(error), 'error');
        setPushClosed(true);
      })
      .finally(() => setEnabling(false));
  };

  return (
    <>
      {showInstall && (
        <Banner
          label={t('Install the Identity app')}
          icon={<img className={s.icon} src="/icons/icon-192.png" alt="" width={44} height={44} />}
          title={t('Install Identity')}
          subtitle={t(install.prompt ? INSTALL_SUBTITLE.other : INSTALL_SUBTITLE[install.platform])}
          action={t('Install')}
          onAction={() => void installApp()}
          onClose={() => setInstallClosed(true)}
        />
      )}
      {showPush && (
        <Banner
          label={t('Turn on notifications')}
          icon={
            <span className={`${s.icon} ${s.bell}`} aria-hidden>
              <Bell strokeWidth={2.2} />
            </span>
          }
          title={t('Turn on notifications')}
          subtitle={t('Meetups, payments and club news')}
          action={t('Turn on')}
          busy={enabling}
          onAction={turnOn}
          onClose={() => setPushClosed(true)}
        />
      )}
      <InstallHelpSheet open={installHelp} onClose={() => setInstallHelp(false)} platform={install.platform} />
    </>
  );
}

function Banner({
  label,
  icon,
  title,
  subtitle,
  action,
  busy,
  onAction,
  onClose,
}: {
  label: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  action: string;
  busy?: boolean;
  onAction: () => void;
  onClose: () => void;
}) {
  return (
    <div className={s.host}>
      <section className={s.banner} aria-label={label}>
        {icon}
        <div className={s.text}>
          <p className={s.title}>{title}</p>
          <p className={s.subtitle}>{subtitle}</p>
        </div>
        <button type="button" className={s.action} onClick={onAction} disabled={busy}>
          {action}
        </button>
        <button type="button" className={s.close} onClick={onClose} aria-label={t('Close')}>
          <X aria-hidden strokeWidth={2.6} />
        </button>
      </section>
    </div>
  );
}
