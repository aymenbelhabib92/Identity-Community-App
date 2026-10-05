import { t, type MemberRef } from '@identity/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Car } from 'lucide-react';
import { api } from '../../lib/api';
import { dateOf, roleLabel } from '../../lib/format';
import { keys } from '../../lib/queries';
import { CarPhotoStrip } from '../photos/Photos';
import { Avatar, ErrorState, List, ListRow, Sheet, Spinner } from '../ui';
import s from './members.module.css';

/**
 * Another member's profile, as members see each other: photo, role, car and
 * car photos. The header shows at once from `member`; the rest is loaded.
 */
export function MemberProfileSheet({ member, onClose }: { member: MemberRef | null; onClose: () => void }) {
  return (
    <Sheet open={member !== null} onClose={onClose}>
      {member && <Profile member={member} />}
    </Sheet>
  );
}

function Profile({ member }: { member: MemberRef }) {
  const profile = useQuery({ queryKey: keys.member(member.id), queryFn: () => api.members.get(member.id), staleTime: 60_000 });
  const online = profile.data?.online ?? member.online;

  return (
    <>
      <div className={s.head}>
        <Avatar name={member.fullName} photo={member.avatar} size={72} online={online} />
        <div>
          <p className={s.name}>{member.fullName}</p>
          <p className={s.role}>
            {roleLabel(member.role)}
            {online && <span className={s.online}> · {t('Online')}</span>}
          </p>
        </div>
      </div>
      {profile.isPending ? (
        <div className={s.loading}>
          <Spinner />
        </div>
      ) : profile.error ? (
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      ) : (
        <>
          <List>
            <ListRow icon={<Car />} title={t('Car')} value={profile.data.car ?? '—'} />
            {profile.data.memberSince && (
              <ListRow icon={<CalendarCheck />} title={t('Member since')} value={dateOf(profile.data.memberSince)} />
            )}
          </List>
          <CarPhotoStrip photos={profile.data.carPhotos} className={s.photos} />
        </>
      )}
    </>
  );
}
