import { formatRelative, t, type Announcement, type AnnouncementAudience } from '@identity/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  Segmented,
  SectionTitle,
  Sheet,
  TextArea,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useCan } from '../../lib/auth';
import { roleLabel } from '../../lib/format';
import { keys, useAnnouncements } from '../../lib/queries';
import s from './home.module.css';

function authorLabel(announcement: Announcement): string {
  const role = announcement.author?.role;
  if (!role) return t('Club');
  const label = role === 'organizer' ? t('Organizers') : roleLabel(role);
  return announcement.audience === 'staff' ? `${label} · ${t('Staff only')}` : label;
}

export function Announcements() {
  const canPost = useCan('announcements:create');
  const { data, isPending, error, refetch } = useAnnouncements();
  const [composing, setComposing] = useState(false);
  const [selected, setSelected] = useState<Announcement | null>(null);

  return (
    <>
      <SectionTitle
        action={
          canPost && (
            <button type="button" className={s.addButton} onClick={() => setComposing(true)} aria-label={t('New announcement')}>
              <Plus strokeWidth={2.6} aria-hidden />
            </button>
          )
        }
      >
        {t('Announcements')}
      </SectionTitle>

      {isPending ? (
        <Card>
          <Loading />
        </Card>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState icon={<Megaphone />}>{t('News from the organizers will show up here.')}</EmptyState>
        </Card>
      ) : (
        <Card>
          {data.items.map((announcement) => {
            const content = (
              <>
                <div className={s.announcementHead}>
                  <span className={s.announcementAuthor}>{authorLabel(announcement)}</span>
                  <span className={s.announcementTime}>{formatRelative(announcement.createdAt)}</span>
                </div>
                <p className={s.announcementBody}>{announcement.body}</p>
              </>
            );
            return announcement.canDelete ? (
              <button
                key={announcement.id}
                type="button"
                className={s.announcement}
                onClick={() => setSelected(announcement)}
              >
                {content}
              </button>
            ) : (
              <article key={announcement.id} className={s.announcement}>
                {content}
              </article>
            );
          })}
        </Card>
      )}

      <Composer open={composing} onClose={() => setComposing(false)} />
      <DeleteSheet announcement={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function Composer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');

  const post = useMutation({
    mutationFn: () => api.announcements.create({ body, audience }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.announcements });
      setBody('');
      setAudience('all');
      onClose();
      toast(t('Announcement posted'), 'success');
    },
  });

  return (
    <Sheet open={open} onClose={onClose} title={t('New announcement')}>
      <div className={s.composer}>
        <TextArea
          aria-label={t('Message')}
          placeholder={t('Share news with the club…')}
          value={body}
          maxLength={1000}
          onChange={(event) => setBody(event.target.value)}
          autoFocus
        />
        <Segmented
          label={t('Audience')}
          value={audience}
          onChange={setAudience}
          options={[
            { value: 'all', label: t('Everyone') },
            { value: 'staff', label: t('Staff only') },
          ]}
        />
        {post.error && <ErrorState error={post.error} />}
        <Button onClick={() => post.mutate()} loading={post.isPending} disabled={body.trim().length < 3}>
          {t('Post')}
        </Button>
      </div>
    </Sheet>
  );
}

function DeleteSheet({ announcement, onClose }: { announcement: Announcement | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const remove = useMutation({
    mutationFn: (id: string) => api.announcements.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.announcements });
      onClose();
      toast(t('Announcement deleted'), 'success');
    },
  });

  return (
    <Sheet open={announcement !== null} onClose={onClose} title={t('Announcement')}>
      {announcement && (
        <div className={s.composer}>
          <Card padded>
            <p className={s.announcementBody}>{announcement.body}</p>
          </Card>
          {remove.error && <ErrorState error={remove.error} />}
          <Button
            variant="danger"
            icon={<Trash2 aria-hidden />}
            loading={remove.isPending}
            onClick={() => remove.mutate(announcement.id)}
          >
            {t('Delete announcement')}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
