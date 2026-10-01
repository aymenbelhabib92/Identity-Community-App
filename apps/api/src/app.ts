import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { DEFAULT_LANGUAGE, pickLanguage, PROOF_MAX_BYTES, translate, type TranslationParams } from '@identity/shared';
import Fastify, { type FastifyError } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  ResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { ensureBootstrapAdmin } from './bootstrap';
import { loadConfig, type Config } from './config';
import { openDatabase, type Database } from './db/client';
import { AppError } from './errors';
import { createLocalStorage, type Storage } from './lib/storage';
import { apiRoutes } from './routes';
import { SettingsStore } from './services/settings';
import type { Viewer } from './types';
import './types';

export interface BuildAppOptions {
  config?: Partial<Config>;
  /** Injected clock (tests). */
  now?: () => Date;
  database?: Database;
  storage?: Storage;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = loadConfig(options.config);

  const app = Fastify({
    logger:
      config.logLevel === 'silent'
        ? false
        : config.env === 'development'
          ? {
              level: config.logLevel,
              transport: {
                target: 'pino-pretty',
                options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname,reqId,req.hostname,req.remoteAddress,req.remotePort', singleLine: true },
              },
            }
          : { level: config.logLevel },
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const database = options.database ?? (await openDatabase(config));
  app.decorate('config', config);
  app.decorate('db', database.db);
  app.decorate('storage', options.storage ?? createLocalStorage(config.uploadDir));
  app.decorate('clubSettings', new SettingsStore(database.db));
  app.decorate('clock', { now: options.now ?? (() => new Date()) });
  app.decorateRequest('viewer', null as unknown as Viewer);
  app.decorateRequest('lang', DEFAULT_LANGUAGE);
  app.addHook('onRequest', async (request) => {
    request.lang = pickLanguage(request.headers['accept-language']) ?? DEFAULT_LANGUAGE;
  });
  app.addHook('onClose', async () => database.close());

  // JSON API only: the web app's CSP is set by the web server.
  await app.register(helmet, { contentSecurityPolicy: false });
  if (config.corsOrigins.length > 0) await app.register(cors, { origin: config.corsOrigins });
  if (config.env !== 'test') {
    await app.register(rateLimit, {
      global: false,
      errorResponseBuilder: (_request, context) =>
        new AppError(429, 'RATE_LIMITED', 'Too many attempts. Try again in {after}.', undefined, { after: context.after }),
    });
  }
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(multipart, {
    limits: { fileSize: PROOF_MAX_BYTES, files: 1, fields: 10, fieldSize: 4096, parts: 12 },
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Identity Community API',
        version: '1.0.0',
        description:
          'API of the Identity car community, shared by the web app / PWA and the native app. ' +
          'Authenticate with `POST /api/v1/auth/login` and send the token as `Authorization: Bearer <token>`. ' +
          'Amounts are integer millimes (1 DT = 1000).',
      },
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
      security: [{ bearerAuth: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  // Messages are answered in the language of the request (Accept-Language).
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const tr = (text: string, params?: TranslationParams) => translate(request.lang, text, params);
    const internal = () => reply.code(500).send({ error: { code: 'INTERNAL', message: tr('Something went wrong.') } });

    if (hasZodFastifySchemaValidationErrors(error)) {
      const details = error.validation.map((issue) => ({
        path: issue.instancePath.split('/').filter(Boolean),
        message: tr(issue.message ?? 'Invalid value'),
      }));
      return reply.code(400).send({ error: { code: 'VALIDATION', message: details[0]?.message ?? tr('Invalid request'), details } });
    }
    if (error instanceof AppError) {
      const details = Array.isArray(error.details)
        ? (error.details as { path: string[]; message: string }[]).map((issue) => ({
            ...issue,
            message: tr(issue.message, error.params),
          }))
        : error.details;
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: tr(error.message, error.params), ...(details !== undefined && { details }) },
      });
    }
    if (error instanceof ResponseSerializationError) {
      request.log.error({ issues: error.cause.issues, url: error.url }, 'response does not match its schema');
      return internal();
    }
    if (error.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({ error: { code: 'FILE_TOO_LARGE', message: tr('The file is too large (max 8 MB).') } });
    }
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error(error);
      return internal();
    }
    return reply.code(status).send({ error: { code: error.code ?? 'ERROR', message: error.message } });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: `No route for ${request.method} ${request.url}` } }),
  );

  app.get('/api/health', { schema: { hide: true } }, async () => ({ ok: true, database: database.kind }));
  await app.register(apiRoutes, { prefix: '/api/v1' });

  await app.ready();
  await ensureBootstrapAdmin(app);
  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
