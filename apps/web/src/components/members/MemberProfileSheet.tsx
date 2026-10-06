import { instagramUrl, t, type MemberRef, type Role } from '@identity/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Car } from 'lucide-react';
import type { ReactNode } from 'react';
import { api } from '../../lib/api';
import { dateOf } from '../../lib/format';
import { keys } from '../../lib/queries';
import { Shards } from '../brand/Shards';
import { InstagramIcon } from '../InstagramIcon';
import { Photo, PhotoGrid } from '../photos/Photos';
import { RolePill } from '../RolePill';
import { Avatar, ErrorState, List, ListRow, Sheet, Spinner } from '../ui';
import s from './members.module.css';

/** Who to show: what the chat, the map or a list already knows; the rest is loaded. */
export type ProfileTarget = Pick<MemberRef, 'id' | 'fullName' | 'avatar' | 'online'> & { role?: Role };

/**
 * Another member's profile, as on Instagram: cover photo, profile photo, name,
 * role, bio, Instagram, car and their photos. Opened from the chat, the map,
 * meetup attendees… `extra` adds what the opening screen knows (e.g. the map).
 */
export function MemberProfileSheet({
  member,
  onClose,
  extra,
}: {
  member: ProfileTarget | null;
  onClose: () => void;
  extra?: ReactNode;
}) {
  return (
    <Sheet open={member !== null} onClose={onClose}>
      {member && <Profile member={member} extra={extra} />}
    </Sheet>
  );
}

function Profile({ member, extra }: { member: ProfileTarget; extra?: ReactNode }) {
  const profile = useQuery({ queryKey: keys.member(member.id), queryFn: () => api.members.get(member.id), staleTime: 60_000 });
  const data = profile.data;
  const online = data?.online ?? member.online;
  const role = data?.role ?? member.role;

  return (
    <div className={s.profile}>
      <div className={s.cover}>
        {data?.cover ? <Photo id={data.cover} className={s.coverImage} /> : <Shards className={s.coverImage} />}
      </div>
      <Avatar name={member.fullName} photo={member.avatar} size={88} online={online} className={s.avatar} />
      <p className={s.name}>{member.fullName}</p>
      <div className={s.meta}>
        {role && <RolePill role={role} />}
        {online && <span className={s.online}>{t('Online')}</span>}
      </div>
      {data?.bio && <p className={s.bio}>{data.bio}</p>}
      {data?.instagram && (
        <a className={s.instagram} href={instagramUrl(data.instagram)} target="_blank" rel="noopener noreferrer">
          <InstagramIcon />@{data.instagram}
        </a>
      )}

      {profile.error ? (
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      ) : !data ? (
        <div className={s.loading}>
          <Spinner />
        </div>
      ) : (
        <div className={s.details}>
          <List>
            <ListRow icon={<Car />} title={t('Car')} value={data.car ?? '—'} />
            {data.memberSince && <ListRow icon={<CalendarCheck />} title={t('Member since')} value={dateOf(data.memberSince)} />}
          </List>
          {extra}
          {data.carPhotos.length > 0 && (
            <>
              <p className={s.photosTitle}>{t('Photos')}</p>
              <PhotoGrid photos={data.carPhotos} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
