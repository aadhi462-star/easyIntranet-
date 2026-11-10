// Email goes through an outbox table: the row is the record of what was sent (or failed), so a
// provider outage never loses a message silently (REG-07, NTF-03). The transport is pluggable:
// development logs the message; a real SMTP transport is chosen before the pilot (decision D5).
const TEMPLATES = {
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

export function createMailer({ db, transport = logTransport, log = console }) {
  return {
    async send(to, template, data) {
      const { subject, body } = TEMPLATES[template](data);
      const { rows } = await db.query(
        `insert into email_outbox (to_email, template, subject, body) values ($1, $2, $3, $4) returning id`,
        [to, template, subject, body],
      );
      const id = rows[0].id;
      try {
        await transport({ to, subject, body }, log);
        await db.query(`update email_outbox set status = 'sent', attempts = attempts + 1, sent_at = now() where id = $1`, [id]);
      } catch (err) {
        await db.query(`update email_outbox set status = 'failed', attempts = attempts + 1, last_error = $2 where id = $1`, [id, String(err.message || err)]);
      }
      return id;
    },
  };
}

function logTransport({ to, subject, body }, log) {
  log.info?.({ to, subject }, 'email (development transport)');
  if (process.env.NODE_ENV !== 'test') console.log(`\n✉️  To: ${to}\n   ${subject}\n   ${body.replace(/\n/g, '\n   ')}\n`);
}
