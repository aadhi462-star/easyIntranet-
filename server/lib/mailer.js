// Email goes through an outbox table: the row is the record of what was sent (or failed), so a
// provider outage never loses a message silently (REG-07, NTF-03). The transport is pluggable:
// development logs the message; on Catalyst AppSail, MAIL_TRANSPORT=catalyst sends through Catalyst
// Mail (the SMTP/sender settings configured in the Catalyst console) — decision D5.
import catalyst from 'zcatalyst-sdk-node';

const TEMPLATES = {
  // Stage 4 notifications. Only who did what and where: never the post's text, so a private
  // discussion is never quoted in an inbox (NTF-06, CNT-15).
  notification: ({ name, line, link }) => ({
    subject: line,
    body: `Hi ${name},\n\n${line}.\n\nOpen CommunityOne to see it:\n${link}\n\nChoose which emails you get in Notifications → Settings.`,
  }),
  verify_email: ({ name, link }) => ({
    subject: 'Confirm your CommunityOne email',
    body: `Hi ${name},\n\nConfirm your email to finish setting up your CommunityOne account:\n${link}\n\nThis link expires in 24 hours. If you didn't sign up, ignore this email.`,
  }),
  reset_password: ({ name, link }) => ({
    subject: 'Reset your CommunityOne password',
    body: `Hi ${name},\n\nUse this link to choose a new password:\n${link}\n\nIt expires in 1 hour and works once. If you didn't ask for this, you can ignore it — your password stays the same.`,
  }),
  change_email: ({ name, link }) => ({
    subject: 'Confirm your new CommunityOne email',
    body: `Hi ${name},\n\nConfirm this address to make it your CommunityOne sign-in email:\n${link}\n\nUntil you confirm, your current email stays in use.`,
  }),
  password_changed: ({ name }) => ({
    subject: 'Your CommunityOne password was changed',
    body: `Hi ${name},\n\nYour password was just changed and your other sessions were signed out. If this wasn't you, reset your password now.`,
  }),
  // Stage 7 (D3): the reason is the platform's own words to the account holder.
  account_suspended: ({ name, reason }) => ({
    subject: 'Your CommunityOne account has been suspended',
    body: `Hi ${name},\n\nYour CommunityOne account has been suspended, and you've been signed out.\n\nReason: ${reason}\n\nYour posts stay where they are unless they're removed separately. If you think this is a mistake, contact the CommunityOne team.`,
  }),
  account_reactivated: ({ name, link }) => ({
    subject: 'Your CommunityOne account is active again',
    body: `Hi ${name},\n\nYour CommunityOne account has been reactivated. You can sign in again:\n${link}`,
  }),
  // Event emails name the event and its community only: the recipient is already a registrant
  // who can see it, and the details live behind sign-in (NTF privacy).
  event_changed: ({ name, title, community, link }) => ({
    subject: `Updated: ${title}`,
    body: `Hi ${name},\n\nThe time or place of “${title}” in ${community} changed. See the new details:\n${link}`,
  }),
  event_cancelled: ({ name, title, community, reason, link }) => ({
    subject: `Cancelled: ${title}`,
    body: `Hi ${name},\n\n“${title}” in ${community} was cancelled.\nReason: ${reason}\n\n${link}`,
  }),
};

/** Picks the transport from the environment: Catalyst Mail when configured, else the log. */
export function defaultTransport(env = process.env) {
  if (env.MAIL_TRANSPORT !== 'catalyst') return logTransport;
  if (!env.MAIL_FROM) throw new Error('MAIL_TRANSPORT=catalyst needs MAIL_FROM (a sender verified in the Catalyst console).');
  return catalystTransport({ from: env.MAIL_FROM, displayName: env.MAIL_FROM_NAME || 'CommunityOne' });
}

/**
 * `send(to, template, data, { req })`: the request is passed through to the transport, because
 * the Catalyst SDK authenticates with the headers AppSail adds to each incoming request.
 */
export function createMailer({ db, transport = defaultTransport(), log = console }) {
  return {
    async send(to, template, data, { req } = {}) {
      const { subject, body } = TEMPLATES[template](data);
      const { rows } = await db.query(
        `insert into email_outbox (to_email, template, subject, body) values ($1, $2, $3, $4) returning id`,
        [to, template, subject, body],
      );
      const id = rows[0].id;
      try {
        await transport({ to, subject, body }, log, { req });
        await db.query(`update email_outbox set status = 'sent', attempts = attempts + 1, sent_at = now() where id = $1`, [id]);
      } catch (err) {
        // The request still succeeds (the outbox row is the record and can be retried); the
        // failure is logged without the message body, which may hold a sign-in link.
        log.warn?.({ to, template, err: String(err.message || err) }, 'email not sent');
        await db.query(`update email_outbox set status = 'failed', attempts = attempts + 1, last_error = $2 where id = $1`, [id, String(err.message || err).slice(0, 500)]);
      }
      return id;
    },
    // Re-sends one failed outbox row (NTF-03). The row records every attempt.
    async retry(row, { req } = {}) {
      try {
        await transport({ to: row.to_email, subject: row.subject, body: row.body }, log, { req });
        await db.query(`update email_outbox set status = 'sent', attempts = attempts + 1, sent_at = now(), last_error = null where id = $1`, [row.id]);
        return true;
      } catch (err) {
        await db.query(`update email_outbox set attempts = attempts + 1, last_error = $2 where id = $1`, [row.id, String(err.message || err).slice(0, 500)]);
        return false;
      }
    },
  };
}

// Development only shows the body (it holds sign-in and reset links). In production the log is
// readable by anyone with console access, so a misconfigured host logs only that a mail was skipped.
function logTransport({ to, subject, body }, log) {
  if (process.env.NODE_ENV === 'production') {
    log.warn?.({ to, subject }, 'email not sent: no mail transport configured (set MAIL_TRANSPORT=catalyst and MAIL_FROM)');
    throw new Error('No mail transport configured.');
  }
  log.info?.({ to, subject }, 'email (development transport)');
  if (process.env.NODE_ENV !== 'test') console.log(`\n✉️  To: ${to}\n   ${subject}\n   ${body.replace(/\n/g, '\n   ')}\n`);
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** Plain-text template → simple HTML: escaped, links clickable, line breaks kept. */
export const toHtml = (text) => escapeHtml(text)
  .replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`)
  .replace(/\n/g, '<br>');

export function catalystTransport({ from, displayName, sdk = catalyst }) {
  return async ({ to, subject, body }, log, { req } = {}) => {
    if (!req?.headers) throw new Error('Catalyst Mail needs the incoming request to authenticate.');
    const app = sdk.initialize({ headers: req.headers }, { scope: 'admin' });
    await app.email().sendMail({ from_email: from, display_name: displayName, to_email: [to], subject, content: toHtml(body), html_mode: true });
  };
}
