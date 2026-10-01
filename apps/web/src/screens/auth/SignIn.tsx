import { t } from '@identity/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Logo } from '../../components/brand/Logo';
import { useRedirectTarget } from '../../components/layout/guards';
import { Button, ErrorState, FieldErrors, FormList, FormRow, Input, LargeTitle } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fieldErrors } from '../../lib/errors';
import s from './auth.module.css';

export default function SignIn() {
  const { signIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const target = useRedirectTarget();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () => api.auth.login({ phone, password }),
    onSuccess: (response) => {
      signIn(response);
      navigate(target, { replace: true });
    },
  });
  const errors = fieldErrors(login.error);
  const hasFieldErrors = Object.keys(errors).length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate();
  };

  return (
    <div className="app-frame">
      <main className={s.page}>
        <div className={s.signInLogo}>
          <Logo width={150} />
        </div>
        <LargeTitle>{t('Sign in')}</LargeTitle>
        <form className={s.form} onSubmit={submit} noValidate>
          <div>
            <FormList>
              <FormRow label={t('Phone')} htmlFor="phone" invalid={Boolean(errors.phone)}>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+216"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  required
                />
              </FormRow>
              <FormRow label={t('Password')} htmlFor="password" invalid={Boolean(errors.password)}>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder={t('Required')}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </FormRow>
            </FormList>
            <FieldErrors errors={[errors.phone, errors.password]} />
          </div>
          {login.error && !hasFieldErrors && <ErrorState error={login.error} />}
          <Button type="submit" loading={login.isPending} disabled={!phone || !password}>
            {t('Sign in')}
          </Button>
        </form>
        <p className={s.alt}>
          {t('New to Identity?')}{' '}
          <Link to="/join" state={location.state}>
            {t('Request membership')}
          </Link>
        </p>
        <p className={s.hint}>{t('Forgot your password? An admin can give you a temporary one.')}</p>
      </main>
    </div>
  );
}
