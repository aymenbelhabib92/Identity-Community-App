import { t } from '@identity/shared';
import { CalendarDays, Plus } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Card, EmptyState, ErrorState, LargeTitle, Loading, RoundButton, Screen, Segmented } from '../../components/ui';
import { useCan } from '../../lib/auth';
import { useMeetups } from '../../lib/queries';
import { MeetupCard } from './MeetupCard';
import s from './meetups.module.css';

type Scope = 'upcoming' | 'past';

export default function Meetups() {
  const [params, setParams] = useSearchParams();
  const scope: Scope = params.get('scope') === 'past' ? 'past' : 'upcoming';
  const canCreate = useCan('meetups:create');
  const { data, isPending, error, refetch } = useMeetups(scope);

  return (
    <Screen>
      <LargeTitle
        accessory={
          canCreate && (
            <RoundButton label={t('New meetup')} to="/meetups/new">
              <Plus aria-hidden color="var(--blue)" strokeWidth={2.4} />
            </RoundButton>
          )
        }
      >
        {t('Meetups')}
      </LargeTitle>

      <Segmented
        className={s.segmented}
        label={t('Meetups')}
        value={scope}
        onChange={(value) => setParams(value === 'past' ? { scope: 'past' } : {}, { replace: true })}
        options={[
          { value: 'upcoming', label: t('Upcoming') },
          { value: 'past', label: t('Past') },
        ]}
      />

      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarDays />} title={scope === 'upcoming' ? t('Nothing planned yet') : t('No past meetups')}>
            {scope === 'upcoming' ? t('You will be notified when the organizers plan a meetup.') : null}
          </EmptyState>
        </Card>
      ) : (
        <div className={s.list}>
          {data.items.map((meetup) => (
            <MeetupCard key={meetup.id} meetup={meetup} />
          ))}
        </div>
      )}
    </Screen>
  );
}
