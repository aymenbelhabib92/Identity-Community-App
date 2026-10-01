import { duesFrequencyLabel, formatMoney, t } from '@identity/shared';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Steps } from '../../components/Steps';
import {
  BackLink,
  Button,
  ErrorState,
  FieldErrors,
  FormList,
  FormRow,
  Input,
  LargeTitle,
  Lead,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fieldErrors } from '../../lib/errors';
import { useClubInfo } from '../../lib/queries';
import s from './auth.module.css';

export default function Join() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { data: club } = useClubInfo();
  const [form, setForm] = useState({ fullName: '', phone: '', car: '', password: '' });
  const set = (field: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const register = useMutation({
    mutationFn: () => api.auth.register({ ...form, car: form.car || undefined }),
    onSuccess: (response) => {
      signIn(response);
      navigate('/pass/pay', { replace: true, state: { joined: true } });
    },
  });
  const errors = fieldErrors(register.error);
  const hasFieldErrors = Object.keys(errors).length > 0;

  const entryFee = club ? formatMoney(club.entryFee, club.currency) : '…';
  const dues = club
    ? t('Then {amount} {frequency}', {
        amount: formatMoney(club.duesAmount, club.currency),
        frequency: duesFrequencyLabel(club.duesPeriodMonths).toLowerCase(),
      })
    : '';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    register.mutate();
  };

  return (
    <div className="app-frame">
      <main className={s.page}>
        <BackLink to="/signin">{t('Sign in')}</BackLink>
        <LargeTitle>{t('Join Identity')}</LargeTitle>
        <Lead>{t('Membership is validated by the club. Your badge is issued once your entry fee is confirmed.')}</Lead>

        <Steps
          className={s.steps}
          steps={[
            { title: t('Create your account'), text: t('Name, phone, your car'), state: 'current' },
            { title: t('Pay the entry fee · {amount}', { amount: entryFee }), text: t('Upload a payment proof or pay in person') },
            { title: t('Get verified & receive your badge'), text: dues },
          ]}
        />

        <form className={s.form} onSubmit={submit} noValidate>
          <div>
            <FormList>
              <FormRow label={t('Full name')} htmlFor="fullName" invalid={Boolean(errors.fullName)}>
                <Input
                  id="fullName"
                  autoComplete="name"
                  placeholder={t('Required')}
                  value={form.fullName}
                  onChange={set('fullName')}
                  required
                />
              </FormRow>
              <FormRow label={t('Phone')} htmlFor="phone" invalid={Boolean(errors.phone)}>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+216"
                  value={form.phone}
                  onChange={set('phone')}
                  required
                />
              </FormRow>
              <FormRow label={t('Car')} htmlFor="car" invalid={Boolean(errors.car)}>
                <Input id="car" placeholder={t('Make, model, year')} value={form.car} onChange={set('car')} />
              </FormRow>
              <FormRow label={t('Password')} htmlFor="password" invalid={Boolean(errors.password)}>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder={t('8 characters min.')}
                  value={form.password}
                  onChange={set('password')}
                  required
                />
              </FormRow>
            </FormList>
            <FieldErrors errors={[errors.fullName, errors.phone, errors.car, errors.password]} />
          </div>
          {register.error && !hasFieldErrors && <ErrorState error={register.error} />}
          <Button type="submit" loading={register.isPending}>
            {t('Submit request')}
          </Button>
        </form>
      </main>
    </div>
  );
}
