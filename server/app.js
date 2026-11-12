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
import profileRoutes from './routes/profiles.js';
import connectionRoutes from './routes/connections.js';
import communityRoutes from './routes/communities.js';
import postRoutes from './routes/posts.js';
import eventRoutes from './routes/events.js';
import dashboardRoutes from './routes/dashboard.js';
import publicRoutes from './routes/public.js';
import searchRoutes from './routes/search.js';
import resourceRoutes from './routes/resources.js';
import topicRoutes from './routes/topics.js';
import notificationRoutes from './routes/notifications.js';
import learningRoutes from './routes/learning.js';
import moderationRoutes from './routes/moderation.js';
import manageRoutes from './routes/manage.js';
import platformRoutes, { announcementRoutes } from './routes/platform.js';
import healthRoutes from './routes/health.js';

export async function buildApp({ db, mailer, staticDir, logger = false, secureCookies = process.env.NODE_ENV === 'production', appOrigin, rateLimits = true } = {}) {
  const app = Fastify({
    logger, trustProxy: true, bodyLimit: 1024 * 1024,
    // Reject unknown fields instead of silently dropping them, so a request that tries to set
    // something it shouldn't (status, roles…) fails loudly (SET-08).
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, allErrors: false } },
  });
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
  await app.register(profileRoutes, { prefix: '/api', ctx });
  await app.register(connectionRoutes, { prefix: '/api', ctx });
  await app.register(communityRoutes, { prefix: '/api', ctx });
  await app.register(postRoutes, { prefix: '/api', ctx });
  await app.register(eventRoutes, { prefix: '/api', ctx });
  await app.register(dashboardRoutes, { prefix: '/api', ctx });
  await app.register(publicRoutes, { prefix: '/api', ctx });
  await app.register(searchRoutes, { prefix: '/api', ctx });
  await app.register(resourceRoutes, { prefix: '/api', ctx });
  await app.register(topicRoutes, { prefix: '/api', ctx });
  await app.register(notificationRoutes, { prefix: '/api', ctx });
  await app.register(learningRoutes, { prefix: '/api', ctx });
  await app.register(moderationRoutes, { prefix: '/api', ctx });
  await app.register(manageRoutes, { prefix: '/api', ctx });
  await app.register(platformRoutes, { prefix: '/api/admin', ctx });
  await app.register(healthRoutes, { prefix: '/api/admin', ctx });
  await app.register(announcementRoutes, { prefix: '/api', ctx });
  if (process.env.NODE_ENV !== 'production') await app.register(devRoutes, { prefix: '/api/dev', ctx });

  if (staticDir) {
    // `wildcard` looks files up per request, so a new build is served without a restart
    // (with wildcard: false the file list is fixed at startup and fresh chunks would 404).
    await app.register(fastifyStatic, { root: staticDir, wildcard: true });
    // The web app uses hash routing, so page paths serve index.html. A missing *file* (an old
    // build's chunk, a typo'd asset) must be a real 404: answering with index.html would make the
    // browser run HTML as a script, a blank page instead of the app's reload-on-new-build recovery.
    app.setNotFoundHandler((req, reply) => {
      const path = req.url.split('?')[0];
      if (path.startsWith('/api/')) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
      if (path.startsWith('/assets/') || /\.[a-z0-9]{1,8}$/i.test(path)) return reply.status(404).type('text/plain').send('Not found');
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    });
  }
  return app;
}
