import { t } from '@identity/shared';
import { useLocation } from 'react-router';
import { Logo } from '../../components/brand/Logo';
import { ButtonLink } from '../../components/ui';
import s from './auth.module.css';

export default function Welcome() {
  const location = useLocation();
  return (
    <div className="app-frame">
      <div className={s.welcome}>
        <div className={s.brand}>
          <Logo width={226} />
          <p className={s.tagline}>{t('Car community')}</p>
        </div>
        {/* Keeps the page the visitor was heading to (e.g. a scanned pass) through sign-in. */}
        <ButtonLink to="/signin" state={location.state} variant="secondary">
          {t('Get started')}
        </ButtonLink>
      </div>
    </div>
  );
}
