// Errors that map to a clean JSON response: { error: { code, message } }.
export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (code, message, extra) => new HttpError(400, code, message, extra);
export const unauthorized = (message = 'Sign in to continue.') => new HttpError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You don’t have permission to do that.', code = 'FORBIDDEN') => new HttpError(403, code, message);
export const notFound = (message = 'Not found.') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (code, message, extra) => new HttpError(409, code, message, extra);

/** Fastify error handler: known errors keep their message; anything else is logged, not leaked. */
export function errorHandler(err, req, reply) {
  if (err instanceof HttpError) {
    return reply.status(err.status).send({ error: { code: err.code, message: err.message, ...err.extra } });
  }
  if (err.validation) {
    return reply.status(400).send({ error: { code: 'INVALID_INPUT', message: 'Some fields are missing or invalid.', fields: err.validation.map((v) => v.instancePath || v.params?.missingProperty) } });
  }
  if (err.statusCode === 429) {
    return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many attempts. Wait a moment and try again.' } });
  }
  // Framework-level client errors (malformed JSON, empty JSON body, unsupported media type…)
  // keep their 4xx status; they are the caller's mistake, not a server fault.
  if (err.statusCode >= 400 && err.statusCode < 500) {
    return reply.status(err.statusCode).send({ error: { code: 'INVALID_REQUEST', message: 'The request was malformed. Refresh the page and try again.' } });
  }
  req.log.error(err);
  return reply.status(500).send({ error: { code: 'SERVER_ERROR', message: 'Something went wrong on our side. Try again.' } });
}
