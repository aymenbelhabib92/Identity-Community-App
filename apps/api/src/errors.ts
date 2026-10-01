import type { TranslationParams } from '@identity/shared';

/**
 * An expected failure, sent to the client as `{ error: { code, message, details } }`.
 * Messages are English texts with `{placeholders}` filled from `params`; the error
 * handler translates them into the language of the request.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly params?: TranslationParams;

  constructor(statusCode: number, code: string, message: string, details?: unknown, params?: TranslationParams) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.params = params;
  }
}

export const unauthorized = (message = 'Please sign in') => new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You are not allowed to do this') => new AppError(403, 'FORBIDDEN', message);

export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);

export const conflict = (code: string, message: string, params?: TranslationParams) =>
  new AppError(409, code, message, undefined, params);

export const badRequest = (code: string, message: string) => new AppError(400, code, message);

/** A validation error on one field, shaped like schema validation errors so clients can show it inline. */
export const fieldError = (field: string, message: string, params?: TranslationParams) =>
  new AppError(400, 'VALIDATION', message, [{ path: [field], message }], params);

/** Same shape as schema validation errors, for input validated by hand (multipart forms). */
export function validationError(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }) {
  const details = error.issues.map((issue) => ({ path: issue.path.map(String), message: issue.message }));
  return new AppError(400, 'VALIDATION', details[0]?.message ?? 'Invalid request', details);
}

/** Postgres unique_violation, possibly wrapped by the query builder. */
export function isUniqueViolation(err: unknown): boolean {
  let current = err;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    if ((current as { code?: unknown }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
