// Builds the CommunityOne API (and, when `staticDir` is given, serves the built web app).
// Kept separate from index.js so tests can build an app on an in-memory database.
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { errorHandler } from './lib/errors.js';
import { checkCsrf, ensureCsrfCookie, loadSession } from './lib/session.js';
import { createMailer } from './lib/mailer.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import devRoutes from './routes/dev.js';

export async function buildApp({ db, mailer, staticDir, logger = false, secureCookies = process.env.NODE_ENV === 'production', appOrigin, rateLimits = true } = {}) {
  const app = Fastify({ logger, trustProxy: true, bodyLimit: 1024 * 1024 });
  const ctx = { db, mailer: mailer ?? createMailer({ db, log: app.log }), secure: secureCookies, appOrigin, rateLimits };
  app.decorate('ctx', ctx);

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // The pre-paint theme script in index.html is inline; fonts come from Google Fonts.
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        // The glass effect re-reads the page's stylesheets, including the Google Fonts one.
        connectSrc: ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
        mediaSrc: ["'self'", 'blob:'],
        frameSrc: ["'self'", 'https:'],
        workerSrc: ["'self'", 'blob:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(rateLimit, { global: false });
  app.setErrorHandler(errorHandler);

  // Every API request: identify the caller from the session, issue a CSRF cookie if missing,
  // and reject state-changing requests without a matching CSRF header.
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    reply.header('cache-control', 'no-store'); // never cache personal or protected data (VIS-08)
    ensureCsrfCookie(req, reply, { secure: ctx.secure });
    checkCsrf(req);
    await loadSession(db, req);
  });

  app.get('/api/health', async () => ({ ok: true, db: db.kind }));
  await app.register(authRoutes, { prefix: '/api', ctx });
  await app.register(adminRoutes, { prefix: '/api/admin', ctx });
  if (process.env.NODE_ENV !== 'production') await app.register(devRoutes, { prefix: '/api/dev', ctx });

  if (staticDir) {
    await app.register(fastifyStatic, { root: staticDir, wildcard: false });
    // The web app uses hash routing, so every non-API path serves index.html.
    app.setNotFoundHandler((req, reply) => (req.url.startsWith('/api/')
      ? reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found.' } })
      : reply.sendFile('index.html')));
  }
  return app;
}
