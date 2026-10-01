import { formatRelative, t, type Notification, type NotificationList } from '@identity/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarDays, CreditCard, Megaphone, Shield, UserCheck, type LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { BackLink, Card, EmptyState, ErrorState, IconTile, LargeTitle, Loading, Screen, type TileColor } from '../../components/ui';
import { api } from '../../lib/api';
import { cx } from '../../lib/cx';
import { keys, useNotifications } from '../../lib/queries';
import s from './misc.module.css';

const KIND: Record<string, { icon: LucideIcon; color: TileColor }> = {
  meetup: { icon: CalendarDays, color: 'red' },
  announcement: { icon: Megaphone, color: 'blue' },
  payment: { icon: CreditCard, color: 'green' },
  payment_review: { icon: CreditCard, color: 'orange' },
  membership: { icon: UserCheck, color: 'green' },
  role: { icon: Shield, color: 'purple' },
};

export default function Notifications() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isPending, error, refetch } = useNotifications();
  const markRead = useMutation({
    mutationFn: api.notifications.markAllRead,
    // Clear the bell badge but keep this list as loaded, so unread dots stay visible during the visit.
    onSuccess: () =>
      queryClient.setQueryData<NotificationList>(keys.notifications, (current) => current && { ...current, unread: 0 }),
  });

  // Opening the list marks everything as read.
  const marked = useRef(false);
  useEffect(() => {
    if (data && data.unread > 0 && !marked.current) {
      marked.current = true;
      markRead.mutate();
    }
  }, [data, markRead]);

  return (
    <Screen>
      <BackLink to="/home">{t('Home')}</BackLink>
      <LargeTitle>{t('Notifications')}</LargeTitle>
      {isPending ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState icon={<Bell />} title={t('All caught up')}>
            {t('Payments, meetups and club news will show up here.')}
          </EmptyState>
        </Card>
      ) : (
        <Card>
          {data.items.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              onOpen={notification.link ? () => navigate(notification.link!) : undefined}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}

function NotificationRow({ notification, onOpen }: { notification: Notification; onOpen?: () => void }) {
  const kind = KIND[notification.kind] ?? { icon: Bell, color: 'gray' as const };
  const Icon = kind.icon;
  const content = (
    <>
      <IconTile color={kind.color}>
        <Icon />
      </IconTile>
      <div className={s.notificationBody}>
        <div className={s.notificationHead}>
          <p className={s.notificationTitle}>{notification.title}</p>
          <span className={s.notificationTime}>{formatRelative(notification.createdAt)}</span>
        </div>
        {notification.body && <p className={s.notificationText}>{notification.body}</p>}
      </div>
    </>
  );
  const className = cx(s.notification, !notification.read && s.unread);
  return onOpen ? (
    <button type="button" className={className} onClick={onOpen}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}
