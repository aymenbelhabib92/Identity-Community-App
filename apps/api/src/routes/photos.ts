import { access } from 'node:fs/promises';
import { CAR_PHOTOS_MAX, idParamsSchema, PHOTO_MAX_BYTES, PHOTO_MIME_TYPES, userSchema } from '@identity/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { fileTypeFromFile } from 'file-type';
import { memberPhotos, users } from '../db/schema';
import { AppError, badRequest, conflict, fieldError, notFound } from '../errors';
import { findUser, toUserDto } from '../services/users';

const ACCEPTED_PHOTOS: readonly string[] = PHOTO_MIME_TYPES;
const uploadRateLimit = { max: 20, timeWindow: '1 minute' };

/**
 * Profile, cover and car photos. Apps resize pictures before sending them (which
 * also drops their metadata, e.g. where they were taken); the server only checks
 * that the file is a photo and stores it.
 */
export const photoRoutes: FastifyPluginAsyncZod = async (app) => {
  /** Stores the `file` part of a multipart request once it is known to be a photo. */
  async function receivePhoto(request: FastifyRequest): Promise<{ key: string; mime: string }> {
    if (!request.isMultipart()) throw badRequest('MULTIPART_REQUIRED', 'Send the photo as multipart/form-data.');
    let upload: { key: string; size: number } | null = null;
    try {
      for await (const part of request.parts()) {
        if (part.type !== 'file') continue;
        if (part.fieldname !== 'file' || upload) {
          for await (const _chunk of part.file); // drain unexpected files
          continue;
        }
        upload = await app.storage.save(part.file, 'photos');
        if (part.file.truncated || upload.size > PHOTO_MAX_BYTES) {
          throw new AppError(413, 'FILE_TOO_LARGE', 'The photo is too large (max 5 MB).');
        }
      }
      if (!upload) throw fieldError('file', 'Choose a photo.');
      const type = await fileTypeFromFile(app.storage.path(upload.key));
      if (!type || !ACCEPTED_PHOTOS.includes(type.mime)) throw fieldError('file', 'Upload a photo (JPG, PNG or WEBP).');
      return { key: upload.key, mime: type.mime };
    } catch (err) {
      if (upload) await app.storage.remove(upload.key);
      throw err;
    }
  }

  async function deletePhoto(photoId: string): Promise<void> {
    const [row] = await app.db.delete(memberPhotos).where(eq(memberPhotos.id, photoId)).returning();
    if (row) await app.storage.remove(row.file);
  }

  /** The profile photo and the cover photo: one each, a new one replaces the previous. */
  const singlePhotos = {
    avatar: { path: '/me/avatar', column: 'avatarPhotoId', name: 'profile photo' },
    cover: { path: '/me/cover', column: 'coverPhotoId', name: 'cover photo (wide, at the top of my profile)' },
  } as const;

  for (const [kind, { path, column, name }] of Object.entries(singlePhotos) as [
    keyof typeof singlePhotos,
    (typeof singlePhotos)[keyof typeof singlePhotos],
  ][]) {
    app.put(
      path,
      {
        config: { rateLimit: uploadRateLimit },
        schema: {
          tags: ['me'],
          summary: `Set my ${name}`,
          description: 'multipart/form-data with a `file` part (JPG, PNG or WEBP, max 5 MB). Replaces the current photo.',
          consumes: ['multipart/form-data'],
          response: { 200: userSchema },
        },
      },
      async (request) => {
        const { viewer } = request;
        const photo = await receivePhoto(request);
        const previous = viewer.user[column];
        let user;
        try {
          user = await app.db.transaction(async (tx) => {
            const [row] = await tx
              .insert(memberPhotos)
              .values({ userId: viewer.id, kind, file: photo.key, mime: photo.mime })
              .returning();
            const [updated] = await tx.update(users).set({ [column]: row!.id }).where(eq(users.id, viewer.id)).returning();
            return updated!;
          });
        } catch (err) {
          await app.storage.remove(photo.key);
          throw err;
        }
        if (previous) await deletePhoto(previous);
        return toUserDto(user, viewer);
      },
    );

    app.delete(
      path,
      { schema: { tags: ['me'], summary: `Remove my ${name}`, response: { 200: userSchema } } },
      async (request) => {
        const { viewer } = request;
        const [user] = await app.db.update(users).set({ [column]: null }).where(eq(users.id, viewer.id)).returning();
        const previous = viewer.user[column];
        if (previous) await deletePhoto(previous);
        return toUserDto(user!, viewer);
      },
    );
  }

  app.post(
    '/me/car-photos',
    {
      config: { rateLimit: uploadRateLimit },
      schema: {
        tags: ['me'],
        summary: 'Add a photo of my car',
        description: `multipart/form-data with a \`file\` part (JPG, PNG or WEBP, max 5 MB). Up to ${CAR_PHOTOS_MAX} photos; the first one is the main photo.`,
        consumes: ['multipart/form-data'],
        response: { 201: userSchema },
      },
    },
    async (request, reply) => {
      const { viewer } = request;
      const photo = await receivePhoto(request);
      let user;
      try {
        user = await app.db.transaction(async (tx) => {
          const current = await findUser(tx, viewer.id);
          const ids = current?.carPhotoIds ?? [];
          if (ids.length >= CAR_PHOTOS_MAX) {
            throw conflict('TOO_MANY_PHOTOS', 'Up to {max} car photos. Remove one first.', { max: CAR_PHOTOS_MAX });
          }
          const [row] = await tx
            .insert(memberPhotos)
            .values({ userId: viewer.id, kind: 'car', file: photo.key, mime: photo.mime })
            .returning();
          const [updated] = await tx
            .update(users)
            .set({ carPhotoIds: [...ids, row!.id] })
            .where(eq(users.id, viewer.id))
            .returning();
          return updated!;
        });
      } catch (err) {
        await app.storage.remove(photo.key);
        throw err;
      }
      reply.code(201);
      return toUserDto(user, viewer);
    },
  );

  app.delete(
    '/me/car-photos/:id',
    { schema: { tags: ['me'], summary: 'Remove a photo of my car', params: idParamsSchema, response: { 200: userSchema } } },
    async (request) => {
      const { viewer } = request;
      const photoId = request.params.id;
      const [photo] = await app.db
        .select({ id: memberPhotos.id })
        .from(memberPhotos)
        .where(and(eq(memberPhotos.id, photoId), eq(memberPhotos.userId, viewer.id), eq(memberPhotos.kind, 'car')))
        .limit(1);
      if (!photo) throw notFound('Photo');
      const user = await app.db.transaction(async (tx) => {
        const current = await findUser(tx, viewer.id);
        const ids = (current?.carPhotoIds ?? []).filter((id) => id !== photoId);
        const [updated] = await tx.update(users).set({ carPhotoIds: ids }).where(eq(users.id, viewer.id)).returning();
        return updated!;
      });
      await deletePhoto(photoId);
      return toUserDto(user, viewer);
    },
  );

  app.get(
    '/photos/:id',
    {
      schema: {
        tags: ['members'],
        summary: 'A profile, cover or car photo',
        description:
          'Profile and cover photos are shown to every signed-in account; car photos to active members (and to their owner). ' +
          'A photo never changes — a new upload gets a new id — so it can be cached for good.',
        params: idParamsSchema,
      },
    },
    async (request, reply) => {
      const { viewer } = request;
      const [photo] = await app.db.select().from(memberPhotos).where(eq(memberPhotos.id, request.params.id)).limit(1);
      const allowed = photo && (photo.kind !== 'car' || photo.userId === viewer.id || viewer.hasAccess);
      if (!photo || !allowed) throw notFound('Photo');
      try {
        await access(app.storage.path(photo.file));
      } catch {
        throw notFound('Photo');
      }
      return reply
        .header('Cache-Control', 'private, max-age=31536000, immutable')
        .type(photo.mime)
        .send(app.storage.open(photo.file));
    },
  );
};
