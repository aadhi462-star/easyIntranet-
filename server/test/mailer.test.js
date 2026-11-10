// Email delivery: transport choice, Catalyst Mail hand-off and failure recording (REG-07, NTF-03).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { catalystTransport, createMailer, defaultTransport, toHtml } from '../lib/mailer.js';

let env;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });
const quiet = { info() {}, warn() {} };

describe('mailer', () => {
  test('the log transport is the default; Catalyst needs a verified sender', () => {
    assert.equal(defaultTransport({}).name, 'logTransport');
    assert.throws(() => defaultTransport({ MAIL_TRANSPORT: 'catalyst' }), /MAIL_FROM/);
    assert.equal(typeof defaultTransport({ MAIL_TRANSPORT: 'catalyst', MAIL_FROM: 'noreply@example.com' }), 'function');
  });

  test('Catalyst Mail gets the request headers, admin scope and an HTML body', async () => {
    let init; let sent;
    const sdk = { initialize: (obj, opts) => { init = { obj, opts }; return { email: () => ({ sendMail: async (m) => { sent = m; } }) }; } };
    const mailer = createMailer({ db: env.db, log: quiet, transport: catalystTransport({ from: 'noreply@example.com', displayName: 'CommunityOne', sdk }) });
    const req = { headers: { 'x-zc-projectid': '1' } };
    await mailer.send('a@example.com', 'verify_email', { name: 'A', link: 'https://c1.example/#/verify?token=t1' }, { req });
    assert.equal(init.obj.headers, req.headers);
    assert.equal(init.opts.scope, 'admin');
    assert.deepEqual(sent.to_email, ['a@example.com']);
    assert.equal(sent.from_email, 'noreply@example.com');
    assert.equal(sent.html_mode, true);
    assert.ok(sent.content.includes('<a href="https://c1.example/#/verify?token=t1">'));
    const row = (await env.db.query(`select status from email_outbox where to_email = 'a@example.com'`)).rows[0];
    assert.equal(row.status, 'sent');
  });

  test('REG-07 a failed send is recorded as failed and doesn’t fail the request', async () => {
    const sdk = { initialize: () => ({ email: () => ({ sendMail: async () => { throw new Error('sender not verified'); } }) }) };
    const mailer = createMailer({ db: env.db, log: quiet, transport: catalystTransport({ from: 'x@example.com', sdk }) });
    await mailer.send('b@example.com', 'reset_password', { name: 'B', link: 'https://c1.example/#/reset?token=t2' }, { req: { headers: {} } });
    const row = (await env.db.query(`select status, last_error from email_outbox where to_email = 'b@example.com'`)).rows[0];
    assert.deepEqual(row, { status: 'failed', last_error: 'sender not verified' });
    // No request at all (e.g. a background job): refused clearly, still recorded.
    await mailer.send('c@example.com', 'password_changed', { name: 'C' });
    assert.match((await env.db.query(`select last_error from email_outbox where to_email = 'c@example.com'`)).rows[0].last_error, /incoming request/);
  });

  test('email HTML escapes content and keeps links and line breaks', () => {
    assert.equal(toHtml('Hi <b>&\nhttps://x.io/a'), 'Hi &lt;b&gt;&amp;<br><a href="https://x.io/a">https://x.io/a</a>');
  });
});
