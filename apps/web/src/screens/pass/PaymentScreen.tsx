import { formatMoney, PROOF_MAX_BYTES, t, tn, type Membership, type PaymentKind, type PaymentMethod } from '@identity/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, CircleCheck, Clock, FileText, PartyPopper } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  BackLink,
  Button,
  ButtonLink,
  Card,
  ErrorState,
  FieldErrors,
  FormList,
  FormRow,
  Input,
  LargeTitle,
  List,
  ListRow,
  Loading,
  Notice,
  Screen,
  Segmented,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { fieldErrors } from '../../lib/errors';
import { clubText } from '../../lib/format';
import { keys, useMembership } from '../../lib/queries';
import s from './pass.module.css';

export default function PaymentScreen() {
  const { data: membership, isPending, error, refetch } = useMembership();
  const location = useLocation();
  const joined = Boolean((location.state as { joined?: boolean } | null)?.joined);

  return (
    <Screen>
      <BackLink to={joined ? '/home' : '/pass'}>{joined ? t('Home') : t('Membership')}</BackLink>
      <LargeTitle>{t('Payment')}</LargeTitle>
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <PaymentContent membership={membership} joined={joined} />
      )}
    </Screen>
  );
}

function PaymentContent({ membership, joined }: { membership: Membership; joined: boolean }) {
  const { member } = membership;
  const kind: PaymentKind | null =
    membership.entryFeeStatus === 'unpaid' && member.status === 'pending'
      ? 'entry_fee'
      : membership.duesOptions.length > 0
        ? 'dues'
        : null;

  if (membership.entryFeeStatus === 'pending') {
    return (
      <div className={s.form}>
        <Notice tone="orange" icon={<Clock aria-hidden />}>
          {t('Your entry fee is awaiting the treasurer. You will be notified as soon as it is verified.')}
        </Notice>
        <ButtonLink to="/pass" variant="secondary">
          {t('View my payments')}
        </ButtonLink>
      </div>
    );
  }
  if (!kind) {
    return (
      <Notice tone="gray" icon={<CircleCheck aria-hidden />}>
        {t('There is nothing to pay right now.')}
      </Notice>
    );
  }
  return <PaymentForm membership={membership} kind={kind} joined={joined} />;
}

function PaymentForm({ membership, kind, joined }: { membership: Membership; kind: PaymentKind; joined: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [periods, setPeriods] = useState(1);
  const [method, setMethod] = useState<PaymentMethod>('proof');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const { currency } = membership.fees;

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const option = membership.duesOptions.find((o) => o.periods === periods) ?? membership.duesOptions[0];
  const amount = kind === 'entry_fee' ? membership.fees.entryFee : (option?.amount ?? 0);

  const submit = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append('kind', kind);
      form.append('method', method);
      if (kind === 'dues') form.append('periods', String(periods));
      if (note.trim()) form.append('note', note.trim());
      if (method === 'proof' && file) form.append('file', file);
      return api.membership.submitPayment(form);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.membership });
      toast(
        method === 'proof' ? t('Proof sent. The treasurer will verify it.') : t('Noted. Pay the treasurer at the next meetup.'),
        'success',
      );
      navigate('/pass', { replace: true });
    },
  });
  const errors = fieldErrors(submit.error);
  const hasFieldErrors = Object.keys(errors).length > 0;

  const chooseFile = (chosen: File | undefined) => {
    setFileError(null);
    if (!chosen) return;
    if (chosen.size > PROOF_MAX_BYTES) {
      setFileError(t('This file is larger than 8 MB. Take a screenshot or a smaller photo instead.'));
      return;
    }
    setFile(chosen);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit.mutate();
  };

  const ready = method === 'in_person' || file !== null;

  return (
    <form className={s.form} onSubmit={onSubmit} noValidate>
      {joined && (
        <Notice tone="green" icon={<PartyPopper aria-hidden />}>
          {t('Request sent! Next step: pay the entry fee. Your badge is issued once the treasurer confirms it.')}
        </Notice>
      )}

      <h2 className={s.section}>{t('What you pay')}</h2>
      {kind === 'entry_fee' ? (
        <List>
          <ListRow title={t('Entry fee & badge')} subtitle={t('One time')} value={formatMoney(amount, currency)} />
        </List>
      ) : (
        <List>
          {membership.duesOptions.map((o) => (
            <ListRow
              key={o.periods}
              title={t('{period} dues', { period: o.label })}
              subtitle={o.periods === 1 ? undefined : tn(o.periods, '{count} period', '{count} periods')}
              value={formatMoney(o.amount, currency)}
              onClick={() => setPeriods(o.periods)}
              trailing={
                <Check
                  className={s.check}
                  aria-hidden
                  strokeWidth={3}
                  style={{ visibility: o.periods === periods ? 'visible' : 'hidden' }}
                />
              }
            />
          ))}
        </List>
      )}

      <h2 className={s.section}>{t('How')}</h2>
      <Segmented
        label={t('Payment method')}
        value={method}
        onChange={setMethod}
        options={[
          { value: 'proof', label: t('Upload a proof') },
          { value: 'in_person', label: t('Pay in person') },
        ]}
      />

      {method === 'proof' ? (
        <>
          <input
            ref={fileInput}
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />
          {file ? (
            <div className={s.chosen}>
              <div className={s.thumb}>{preview ? <img src={preview} alt="" /> : <FileText aria-hidden />}</div>
              <p className={s.chosenName}>
                {file.name}
                <span className={s.chosenSize}>{t('{size} MB', { size: (file.size / 1024 / 1024).toFixed(1) })}</span>
              </p>
              <Button variant="plain" onClick={() => fileInput.current?.click()}>
                {t('Change')}
              </Button>
            </div>
          ) : (
            <button type="button" className={s.upload} onClick={() => fileInput.current?.click()}>
              <Camera aria-hidden />
              {t('Add a photo or PDF')}
              <span className={s.uploadHint}>{t('Transfer receipt, D17 screenshot… max 8 MB')}</span>
            </button>
          )}
          <FormList>
            <FormRow label={t('Note')} htmlFor="note">
              <Input
                id="note"
                placeholder={t('Reference (optional)')}
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
              />
            </FormRow>
          </FormList>
        </>
      ) : (
        <Card padded>
          <p className={s.instructions}>
            {t(
              'Hand {amount} to the treasurer or an organizer, for example at the next meetup. They confirm it in the app and you get notified.',
              { amount: formatMoney(amount, currency) },
            )}
          </p>
        </Card>
      )}

      {method === 'proof' && membership.paymentInstructions && (
        <>
          <h2 className={s.section}>{t('How to pay')}</h2>
          <Card padded>
            <p className={s.instructions}>{clubText(membership.paymentInstructions)}</p>
          </Card>
        </>
      )}

      <FieldErrors errors={[fileError ?? undefined, errors.file, errors.periods]} />
      {submit.error && !hasFieldErrors && <ErrorState error={submit.error} />}

      <Button type="submit" loading={submit.isPending} disabled={!ready}>
        {method === 'proof' ? t('Send proof · {amount}', { amount: formatMoney(amount, currency) }) : t("I'll pay in person")}
      </Button>
    </form>
  );
}
