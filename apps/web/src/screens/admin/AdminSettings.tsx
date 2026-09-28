import {
  DUES_PERIOD_MONTHS,
  moneyToInput,
  parseMoney,
  type ClubSettings,
  type ClubSettingsUpdate,
} from '@identity/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import {
  BackLink,
  Button,
  ErrorState,
  FieldErrors,
  FormList,
  FormRow,
  Input,
  LargeTitle,
  List,
  ListRow,
  Loading,
  Screen,
  Select,
  TextArea,
  Toggle,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useCan } from '../../lib/auth';
import { fieldErrors } from '../../lib/errors';
import { keys } from '../../lib/queries';
import s from './admin.module.css';

const PERIOD_LABELS: Record<number, string> = {
  1: 'Every month',
  2: 'Every 2 months',
  3: 'Every 3 months',
  4: 'Every 4 months',
  6: 'Every 6 months',
  12: 'Every year',
};

export default function AdminSettings() {
  const canManage = useCan('settings:manage');
  const settings = useQuery({ queryKey: keys.clubSettings, queryFn: api.admin.settings, enabled: canManage });

  if (!canManage) return <Navigate to="/admin" replace />;
  return (
    <Screen>
      <BackLink to="/admin">Admin</BackLink>
      <LargeTitle>Club settings</LargeTitle>
      {settings.isPending ? (
        <Loading />
      ) : settings.error ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <SettingsForm initial={settings.data} />
      )}
    </Screen>
  );
}

function SettingsForm({ initial }: { initial: ClubSettings }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    ...initial,
    entryFeeText: moneyToInput(initial.entryFee),
    duesAmountText: moneyToInput(initial.duesAmount),
  });
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: (body: ClubSettingsUpdate) => api.admin.updateSettings(body),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.clubSettings, updated);
      void queryClient.invalidateQueries({ queryKey: keys.clubInfo });
      void queryClient.invalidateQueries({ queryKey: keys.membership });
      toast('Settings saved', 'success');
    },
  });
  const errors = { ...fieldErrors(save.error), ...localErrors };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const entryFee = parseMoney(form.entryFeeText);
    const duesAmount = parseMoney(form.duesAmountText);
    const nextErrors: Record<string, string> = {};
    if (entryFee === null) nextErrors.entryFee = 'Entry fee: enter an amount such as 20 or 7.5';
    if (duesAmount === null) nextErrors.duesAmount = 'Dues: enter an amount such as 5 or 7.5';
    setLocalErrors(nextErrors);
    if (entryFee === null || duesAmount === null) return;
    save.mutate({
      currency: form.currency,
      entryFee,
      duesAmount,
      duesPeriodMonths: form.duesPeriodMonths,
      entryFeeCoversFirstPeriod: form.entryFeeCoversFirstPeriod,
      graceDays: form.graceDays,
      revealHoursBefore: form.revealHoursBefore,
      locationTtlHours: form.locationTtlHours,
      paymentInstructions: form.paymentInstructions,
      clubRules: form.clubRules,
      meetRules: form.meetRules,
    });
  };

  const int = (value: string) => Math.max(0, Math.round(Number(value) || 0));

  return (
    <form className={s.sheetStack} onSubmit={submit} noValidate>
      <h2 className={s.formSection}>Fees</h2>
      <FormList>
        <FormRow label="Entry fee" htmlFor="entryFee" suffix={form.currency} invalid={Boolean(errors.entryFee)}>
          <Input
            id="entryFee"
            inputMode="decimal"
            value={form.entryFeeText}
            onChange={(event) => set('entryFeeText', event.target.value)}
          />
        </FormRow>
        <FormRow label="Dues" htmlFor="duesAmount" suffix={form.currency} invalid={Boolean(errors.duesAmount)}>
          <Input
            id="duesAmount"
            inputMode="decimal"
            value={form.duesAmountText}
            onChange={(event) => set('duesAmountText', event.target.value)}
          />
        </FormRow>
        <FormRow label="Dues period" htmlFor="duesPeriod">
          <Select
            id="duesPeriod"
            value={form.duesPeriodMonths}
            onChange={(event) => set('duesPeriodMonths', Number(event.target.value) as ClubSettings['duesPeriodMonths'])}
          >
            {DUES_PERIOD_MONTHS.map((months) => (
              <option key={months} value={months}>
                {PERIOD_LABELS[months]}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Currency" htmlFor="currency">
          <Input id="currency" value={form.currency} maxLength={8} onChange={(event) => set('currency', event.target.value)} />
        </FormRow>
        <FormRow label="Grace period" htmlFor="grace" suffix="days">
          <Input
            id="grace"
            inputMode="numeric"
            value={form.graceDays}
            onChange={(event) => set('graceDays', int(event.target.value))}
          />
        </FormRow>
      </FormList>
      <List>
        <ListRow
          title="Entry fee covers the first period"
          trailing={
            <Toggle
              checked={form.entryFeeCoversFirstPeriod}
              onChange={(checked) => set('entryFeeCoversFirstPeriod', checked)}
              label="Entry fee covers the first period"
            />
          }
        />
      </List>
      <p className={s.help}>
        Periods follow the calendar (with 3 months: Q1 Jan–Mar, Q2 Apr–Jun…). New amounts apply to payments submitted from
        now on. Members keep access during the grace period after their dues end.
      </p>

      <h2 className={s.formSection}>Meetups & map</h2>
      <FormList>
        <FormRow label="Reveal spot" htmlFor="reveal" suffix="h before start">
          <Input
            id="reveal"
            inputMode="numeric"
            value={form.revealHoursBefore}
            onChange={(event) => set('revealHoursBefore', Math.min(72, int(event.target.value)))}
          />
        </FormRow>
        <FormRow label="Map positions" htmlFor="ttl" suffix="hours max">
          <Input
            id="ttl"
            inputMode="numeric"
            value={form.locationTtlHours}
            onChange={(event) => set('locationTtlHours', Math.min(168, Math.max(1, int(event.target.value))))}
          />
        </FormRow>
      </FormList>

      <h2 className={s.formSection}>How to pay</h2>
      <TextArea
        aria-label="Payment instructions"
        value={form.paymentInstructions}
        maxLength={2000}
        onChange={(event) => set('paymentInstructions', event.target.value)}
      />
      <p className={s.help}>Shown when members upload a proof: bank account, D17 number, who to pay in person…</p>

      <h2 className={s.formSection}>Club rules</h2>
      <TextArea
        className={s.tall}
        aria-label="Club rules"
        value={form.clubRules}
        maxLength={20000}
        onChange={(event) => set('clubRules', event.target.value)}
      />
      <p className={s.help}>Start a section with “# Title” and each rule with “- ”.</p>

      <h2 className={s.formSection}>Default meet rules</h2>
      <TextArea
        aria-label="Default meet rules"
        value={form.meetRules}
        maxLength={2000}
        onChange={(event) => set('meetRules', event.target.value)}
      />

      <FieldErrors errors={Object.values(errors)} />
      {save.error && Object.keys(fieldErrors(save.error)).length === 0 && <ErrorState error={save.error} />}
      <Button type="submit" loading={save.isPending}>
        Save settings
      </Button>
    </form>
  );
}
