import { t } from '@identity/shared';
import { Logo } from '../../components/brand/Logo';
import { ButtonLink } from '../../components/ui';
import s from './misc.module.css';

export default function NotFound() {
  return (
    <div className="app-frame">
      <main className={s.notFound} style={{ padding: '80px 24px' }}>
        <Logo width={170} />
        <p className={s.verdictText}>{t('This page does not exist.')}</p>
        <ButtonLink to="/" variant="secondary">
          {t('Back to the app')}
        </ButtonLink>
      </main>
    </div>
  );
}
