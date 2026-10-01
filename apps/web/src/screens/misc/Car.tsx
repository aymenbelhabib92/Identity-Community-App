import { CAR_PHOTOS_MAX, t, type User } from '@identity/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, X } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Photo, PhotoViewer } from '../../components/photos/Photos';
import photoStyles from '../../components/photos/photos.module.css';
import {
  BackLink,
  Button,
  ErrorState,
  FieldErrors,
  FormList,
  FormRow,
  Input,
  LargeTitle,
  Screen,
  SectionFooter,
  SectionHeader,
  Spinner,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useUser } from '../../lib/auth';
import { fieldErrors } from '../../lib/errors';
import { photoForm, preparePhoto } from '../../lib/photos';
import { keys } from '../../lib/queries';
import s from './misc.module.css';

/** The member's car: its name and up to a few photos, shown to the other members. */
export default function Car() {
  const user = useUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [car, setCar] = useState(user.car ?? '');
  const [viewing, setViewing] = useState<string | null>(null);
  const setUser = (updated: User) => queryClient.setQueryData(keys.me, updated);

  const save = useMutation({
    mutationFn: () => api.me.update({ car: car.trim() || null }),
    onSuccess: (updated) => {
      setUser(updated);
      toast(t('Car updated'), 'success');
    },
  });
  const add = useMutation({
    mutationFn: async (file: File) => api.me.addCarPhoto(photoForm(await preparePhoto(file, { size: 1600 }))),
    onSuccess: setUser,
  });
  const remove = useMutation({
    mutationFn: (photoId: string) => api.me.removeCarPhoto(photoId),
    onSuccess: setUser,
  });

  const errors = fieldErrors(save.error);
  const changed = car.trim() !== (user.car ?? '');
  const photoError = add.error ?? remove.error;
  const full = user.carPhotos.length >= CAR_PHOTOS_MAX;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Screen>
      <BackLink to="/profile">{t('Account')}</BackLink>
      <LargeTitle>{t('My car')}</LargeTitle>

      <form className={s.form} onSubmit={submit} noValidate>
        <div>
          <FormList>
            <FormRow label={t('Car')} htmlFor="car" invalid={Boolean(errors.car)}>
              <Input
                id="car"
                placeholder={t('Make, model, year')}
                value={car}
                maxLength={120}
                onChange={(event) => setCar(event.target.value)}
              />
            </FormRow>
          </FormList>
          <FieldErrors errors={[errors.car]} />
        </div>
        {save.error && Object.keys(errors).length === 0 && <ErrorState error={save.error} />}
        {changed && (
          <Button type="submit" loading={save.isPending}>
            {t('Save')}
          </Button>
        )}
      </form>

      <SectionHeader>{t('Photos · {count} of {max}', { count: user.carPhotos.length, max: CAR_PHOTOS_MAX })}</SectionHeader>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) add.mutate(file);
        }}
      />
      <div className={photoStyles.grid}>
        {user.carPhotos.map((id, index) => (
          <div key={id} className={photoStyles.cell}>
            <button type="button" className={photoStyles.view} onClick={() => setViewing(id)} aria-label={t('View the photo')}>
              <Photo id={id} />
            </button>
            {index === 0 && <span className={photoStyles.main}>{t('Main photo')}</span>}
            <button
              type="button"
              className={photoStyles.remove}
              onClick={() => remove.mutate(id)}
              disabled={remove.isPending}
              aria-label={t('Remove the photo')}
            >
              <X aria-hidden strokeWidth={2.6} />
            </button>
          </div>
        ))}
        {!full && (
          <button type="button" className={photoStyles.add} onClick={() => input.current?.click()} disabled={add.isPending}>
            {add.isPending ? <Spinner /> : <ImagePlus aria-hidden />}
            {add.isPending ? t('Sending…') : t('Add a photo')}
          </button>
        )}
      </div>
      {photoError && (
        <div style={{ marginTop: 12 }}>
          <ErrorState error={photoError} />
        </div>
      )}
      <SectionFooter>
        {t('The first photo is the main one. Car photos are shown to active members only.')}
      </SectionFooter>

      <PhotoViewer id={viewing} onClose={() => setViewing(null)} />
    </Screen>
  );
}
