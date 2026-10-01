import { t } from '@identity/shared';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useInstallStatus } from '../../lib/install';
import { InstallHelpSheet } from './InstallHelpSheet';
import s from './install.module.css';

// English source texts, translated when displayed.
const SUBTITLE = {
  ios: 'Add it to your Home Screen',
  android: 'Full screen, from your home screen',
  'mac-safari': 'Add it to your Dock',
  'in-app': 'Open this page in your browser to install',
  other: 'Full screen, one tap away',
} as const;

/**
 * Offers to install the PWA each time the site is opened in a browser. Hidden
 * when the device says the app is already installed (or when running as the
 * installed app). Closing it hides it until the next opening.
 */
export function InstallBanner() {
  const { installed, platform, prompt, installable } = useInstallStatus();
  const [dismissed, setDismissed] = useState(false);
  const [help, setHelp] = useState(false);

  const visible = installed === false && installable && !dismissed;

  // Screens leave room at the top while the banner is shown (see --banner-space).
  useEffect(() => {
    document.documentElement.toggleAttribute('data-install-banner', visible);
    return () => document.documentElement.removeAttribute('data-install-banner');
  }, [visible]);

  const install = async () => {
    if (!prompt) {
      setHelp(true);
      return;
    }
    if (await prompt()) setDismissed(true);
  };

  return (
    <>
      {visible && (
        <div className={s.host}>
          <section className={s.banner} aria-label={t('Install the Identity app')}>
            <img className={s.icon} src="/icons/icon-192.png" alt="" width={44} height={44} />
            <div className={s.text}>
              <p className={s.title}>{t('Install Identity')}</p>
              <p className={s.subtitle}>{t(prompt ? SUBTITLE.other : SUBTITLE[platform])}</p>
            </div>
            <button type="button" className={s.install} onClick={() => void install()}>
              {t('Install')}
            </button>
            <button type="button" className={s.close} onClick={() => setDismissed(true)} aria-label={t('Close')}>
              <X aria-hidden strokeWidth={2.6} />
            </button>
          </section>
        </div>
      )}
      <InstallHelpSheet open={help} onClose={() => setHelp(false)} platform={platform} />
    </>
  );
}
