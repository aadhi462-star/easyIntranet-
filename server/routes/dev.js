// Development-only helpers. Not registered when NODE_ENV=production (see app.js).
// The mailbox lets you open verification and reset links without a real email provider.
export default async function devRoutes(app, { ctx }) {
  app.get('/outbox', async (req) => {
    const to = req.query.to ? String(req.query.to).toLowerCase() : null;
    const { rows } = await ctx.db.query(
      `select id, to_email, template, subject, body, status, created_at from email_outbox
        where ($1::text is null or lower(to_email) = $1) order by id desc limit 20`, [to]);
    return { emails: rows };
  });
}
