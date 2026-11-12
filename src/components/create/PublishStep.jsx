// Step 5, Validate and publish (F5, board V2FConfigure "5 · Validate and publish"). The server
// checks the whole setup without saving (POST /communities/validate); problems link back to the
// field in Configure. Publish sends it once, with one Idempotency-Key per attempt that a retry
// reuses, so a double click or a dropped connection never makes a second community (COM-05/06).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api.js';
import { communityPath, errorText } from '../../lib/communities.js';
import { managePath } from '../../lib/manage.js';
import { Icon } from '../icons.jsx';
import { Badge, Button } from '../ui/Controls.jsx';
import { buildBody, countWord, DESCRIPTION_MAX, FIELDS, formField, lines, localProblems, MAX_TOPICS, publishKeyFor, VISIBILITY } from './draft.js';
import { uploadPictures } from './pictures.js';
import { StepBar, StepTitle } from './parts.jsx';

const TEMPLATE_CODES = ['TEMPLATE_INACTIVE', 'TEMPLATE_NOT_FOUND', 'TEMPLATE_VERSION_UNKNOWN', 'TEMPLATE_VERSION_CHANGED'];
const OWNER_LINE = {
  public: 'It’s Public: anyone can find it, read it and join at once.',
  private: 'It’s Private: people find it in Explore and ask to join, and you or your Admins approve them.',
  closed: 'It’s Closed: it’s hidden from Explore and search, and people join when you invite them.',
};

// Refusals about the setup itself (shown in the list with a link to the field), as opposed to
// conflicts and failures of the request.
const FIELD_CODES = ['DUPLICATE_NAME', 'INVALID_NAME', 'INVALID_CATEGORY', 'INVALID_INPUT', 'TOO_MANY_TOPICS', 'DUPLICATE_TOPIC', 'FIELD_NOT_ALLOWED', 'TOO_LONG', 'VALIDATION_ERROR', 'FST_ERR_VALIDATION'];
const isFieldProblem = (err) => err instanceof ApiError && (!!err.extra?.field || FIELD_CODES.includes(err.code) || (err.status === 400));

/** A server refusal → a problem linked to its field (or a general one). */
function problemFrom(err, c) {
  const field = formField(err?.extra?.field) ?? (err?.code === 'DUPLICATE_NAME' || err?.code === 'INVALID_NAME' ? 'name' : err?.code === 'INVALID_CATEGORY' ? 'category' : null);
  const label = field ? FIELDS[field]?.label ?? 'This field' : null;
  if (err?.code === 'DUPLICATE_NAME') return { field: 'name', title: `Name: ${c.name.trim()}`, message: errorText(err), fix: 'Change name' };
  return { field, title: label ?? 'Something needs a change', message: errorText(err), fix: field ? `Change ${label.toLowerCase()}` : null };
}

export default function PublishStep({ draft, learningAllowed, pictures, onUpdate, onFix, onBack, onStartOver, onRestricted, onPublished }) {
  const c = draft.config;
  const [check, setCheck] = useState({ status: 'checking', problems: [] });
  const [pub, setPub] = useState({ status: 'idle' });
  const [live, setLive] = useState(null); // { community, failed }
  const problemsRef = useRef(null);
  const sending = useRef(false);

  const body = buildBody(draft, { learningAllowed });
  const bodySig = JSON.stringify(body);

  const runCheck = useCallback(async () => {
    setCheck({ status: 'checking', problems: [] });
    const local = localProblems(c);
    if (local.length) { setCheck({ status: 'problems', problems: local }); return; }
    try {
      await api('/communities/validate', { method: 'POST', body });
      setCheck({ status: 'ok', problems: [], at: Date.now() });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'ERROR';
      if (code === 'CREATE_RESTRICTED') { setCheck({ status: 'idle', problems: [] }); setPub({ status: 'restricted' }); onRestricted?.(); return; }
      if (TEMPLATE_CODES.includes(code)) { setCheck({ status: 'idle', problems: [] }); setPub({ status: 'template', code, message: errorText(err) }); return; }
      if (code === 'NETWORK' || !(err instanceof ApiError) || err.status >= 500 || err.status === 404) { setCheck({ status: 'error', problems: [], message: errorText(err) }); return; }
      setCheck({ status: 'problems', problems: [problemFrom(err, c)] });
    }
  }, [bodySig]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { runCheck(); }, [runCheck]);
  useEffect(() => {
    if (check.status === 'problems') problemsRef.current?.querySelector('button, a')?.focus();
  }, [check.status, check.problems]);

  const publish = async () => {
    if (sending.current || check.status !== 'ok') return;
    sending.current = true;
    const key = publishKeyFor(draft, body);
    if (key !== draft.publishKey) onUpdate({ publishKey: key });
    setPub({ status: 'busy' });
    try {
      const { community } = await api('/communities', { method: 'POST', body, idempotencyKey: key.key });
      const failed = await uploadPictures(community.id, pictures);
      if (failed.length) setLive({ community, failed });
      onPublished(community, failed);
      setPub({ status: 'done' });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'ERROR';
      if (code === 'NETWORK') setPub({ status: 'network' });
      else if (code === 'CREATE_RESTRICTED') { setPub({ status: 'restricted' }); onRestricted?.(); }
      else if (TEMPLATE_CODES.includes(code)) setPub({ status: 'template', code, message: errorText(err) });
      else if (code === 'IN_PROGRESS') setPub({ status: 'network' });
      else if (isFieldProblem(err)) {
        setPub({ status: 'idle' });
        setCheck({ status: 'problems', problems: [problemFrom(err, c)] });
      } else setPub({ status: 'error', message: errorText(err) });
    } finally {
      sending.current = false;
    }
  };

  const withoutTemplate = () => { onUpdate({ withoutTemplate: true }); setPub({ status: 'idle' }); };

  if (live) return <Live community={live.community} name={c.name.trim()} visibility={c.visibility} failed={live.failed} />;

  const n = check.problems.length;
  const busy = pub.status === 'busy' || pub.status === 'done';
  const topics = body.topics.length;
  const rules = lines(c.guidelines).length;

  return (
    <div className="flex flex-col gap-5">
      <StepTitle sub="The server checks your setup without saving anything. Fix anything marked, then publish.">Validate and publish</StepTitle>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <section aria-labelledby="cp-checks-h" className="panel flex min-w-0 flex-1 flex-col gap-3 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="cp-checks-h" className="t-h3">Checks</h2>
            {check.status === 'ok' && <Badge tone="ok" icon="check">Ready to publish</Badge>}
            {check.status === 'problems' && <Badge tone="bad" icon="alert">{n} to fix</Badge>}
          </div>
          <p className="sr-only" role="status">{check.status === 'checking' ? 'Checking your setup' : check.status === 'ok' ? 'Ready to publish' : check.status === 'problems' ? `${n} to fix` : ''}</p>

          {check.status === 'checking' && <p className="t-small inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />Checking on the server…</p>}

          {check.status === 'error' && (
            <div role="alert" className="notice notice-bad flex flex-wrap items-center gap-3">
              <span className="min-w-0 flex-[1_1_220px]"><b>We couldn’t check your setup.</b> {check.message} Your draft is safe.</span>
              <Button size="sm" onClick={runCheck}>Try again</Button>
            </div>
          )}

          {check.status === 'problems' && (
            <ul ref={problemsRef} className="flex flex-col gap-2.5" aria-label="To fix">
              {check.problems.map((p, i) => (
                <li key={`${p.field}-${i}`} className="notice notice-bad flex flex-wrap items-start gap-3">
                  <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-[var(--az-danger)]" />
                  <span className="min-w-0 flex-[1_1_200px]"><strong>{p.title}</strong><span className="block">{p.message}</span></span>
                  {p.field && <Button size="sm" onClick={() => onFix(p.field, check.problems)}>{p.fix ?? 'Change it'}</Button>}
                </li>
              ))}
            </ul>
          )}

          {check.status === 'ok' && (
            <>
              <ul className="flex flex-col divide-y divide-[var(--az-divider)]">
                {[
                  ['Name is available', body.name],
                  ['Description', `${(body.description ?? '').length.toLocaleString('en')} of ${DESCRIPTION_MAX.toLocaleString('en')} characters`],
                  ['Category', body.category],
                  ['Visibility', `${VISIBILITY[c.visibility].label}: ${VISIBILITY[c.visibility].short}`],
                  ['Discussion topics', `${topics} of ${MAX_TOPICS}, no repeats`],
                  ['Event and resource categories', `${countWord(body.settings.eventCategories.length, 'event category', 'event categories')}, ${countWord(body.settings.resourceCategories.length, 'resource category', 'resource categories')}`],
                  ['Guidelines', rules ? countWord(rules, 'rule') : 'None yet'],
                  ...(body.template ? [['Template', `${draft.template.name}, version ${draft.template.version}, is active`]] : []),
                  ['Creating communities', 'Open to you on CommunityOne'],
                ].map(([k, v]) => (
                  <li key={k} className="flex items-start gap-3 py-2.5">
                    <Icon name="check" size={18} className="mt-0.5 text-[var(--az-ok)]" />
                    <span className="min-w-0"><span className="block text-sm font-semibold text-[var(--az-text)]">{k}</span><span className="t-small block [overflow-wrap:anywhere]">{v}</span></span>
                  </li>
                ))}
              </ul>
              {!pictures.logo && (
                <p className="notice notice-warn flex items-start gap-2"><Icon name="info" size={18} className="mt-0.5 shrink-0" /><span><b>No logo yet.</b> A lettered tile is used until you add one. This doesn’t stop you publishing.</span></p>
              )}
              <p className="t-small flex flex-wrap items-center gap-2">Checked on the server just now. Publishing checks everything again. <button type="button" className="link" onClick={runCheck}>Check again</button></p>
            </>
          )}
        </section>

        <section aria-labelledby="cp-pub-h" className="panel flex w-full flex-col gap-3 p-5 sm:p-6 lg:w-[380px] lg:shrink-0">
          <h2 id="cp-pub-h" className="t-h3">Publish</h2>
          <PublishState pub={pub} template={draft.template} onRetry={publish} onWithoutTemplate={withoutTemplate} onStartOver={onStartOver} />
          {pub.status !== 'restricted' && pub.status !== 'template' && (
            <>
              <p className="text-sm leading-[22px] text-[var(--az-text)]">
                You’ll be the Owner of <b>{c.name.trim() || 'this community'}</b>. {c.visibility ? OWNER_LINE[c.visibility] : ''}
              </p>
              <p className="t-small">Publishing creates the community with its sections, {countWord(topics, 'topic')}, categories, roles in use, permissions and guidelines. No sample content is created.</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" onClick={publish} busy={busy} disabled={check.status !== 'ok' || busy} aria-describedby={check.status === 'problems' ? 'cp-fix-first' : undefined}>
                  {busy ? 'Publishing…' : 'Publish community'}
                </Button>
                {check.status === 'problems' && <span id="cp-fix-first" className="t-small">Fix {n === 1 ? 'one thing' : `${n} things`} first</span>}
              </div>
            </>
          )}
        </section>
      </div>

      <StepBar back={{ label: 'Back to configure', onClick: onBack, disabled: busy }} />
    </div>
  );
}

function PublishState({ pub, template, onRetry, onWithoutTemplate, onStartOver }) {
  if (pub.status === 'busy') return <p className="t-small" role="status">Publishing… Clicking again does nothing.</p>;
  if (pub.status === 'network') {
    return (
      <div role="alert" className="notice notice-bad flex flex-col gap-2">
        <span><b>We couldn’t confirm it was published.</b> Your draft is safe. Trying again won’t make a second community.</span>
        <span><Button size="sm" onClick={onRetry}>Try again</Button></span>
      </div>
    );
  }
  if (pub.status === 'template') {
    const off = pub.code === 'TEMPLATE_INACTIVE' || pub.code === 'TEMPLATE_NOT_FOUND';
    return (
      <div role="alert" className="notice notice-warn flex flex-col gap-2">
        <span><b>{off ? `The ${template?.name ?? ''} template was turned off while you worked.` : `This version of the ${template?.name ?? ''} template can’t be used any more.`}</b> Your setup is kept exactly as it is.</span>
        <span className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={onWithoutTemplate}>Publish without the template</Button>
          <Button size="sm" onClick={onStartOver}>Back to start</Button>
        </span>
      </div>
    );
  }
  if (pub.status === 'restricted') {
    return (
      <div role="alert" className="notice notice-warn flex flex-col gap-1">
        <b>Only platform staff can create communities at the moment.</b>
        <span>This changed while you were working. Your draft stays in this browser.</span>
      </div>
    );
  }
  if (pub.status === 'error') return <p role="alert" className="notice notice-bad">{pub.message} Your draft is safe.</p>;
  return null;
}

/** Published, but a picture didn't upload: the community exists; say where to add it. */
function Live({ community, name, visibility, failed }) {
  const [copied, setCopied] = useState('');
  const path = communityPath(community);
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#${path}`); setCopied('Link copied.'); } catch { setCopied('The link couldn’t be copied. Open the community and copy it from the address bar.'); }
  };
  return (
    <div className="flex flex-col gap-5">
      <StepTitle>{name} is live</StepTitle>
      <div className="panel flex flex-col gap-3 p-5 sm:p-6">
        <p className="text-[15px] leading-6 text-[var(--az-text)]">You’re its Owner. It starts with no posts; the setup checklist on its Overview walks you through the first steps: a welcome post, an Admin to share the work, and a first event.</p>
        <p role="alert" className="notice notice-warn flex items-start gap-2">
          <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
          <span>The {failed.join(' and ')} didn’t upload. The community was created with everything else; add {failed.length > 1 ? 'them' : 'it'} from Manage, Branding.</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to={path} className="btn btn-primary">Open community</Link>
          {visibility === 'closed'
            ? <Link to={managePath(community, 'members')} className="btn btn-secondary">Invite people</Link>
            : <Button onClick={copy} icon="link">Copy link</Button>}
          <Link to={managePath(community, 'branding')} className="btn btn-ghost">Manage, Branding</Link>
        </div>
        {copied && <p className="t-small" role="status">{copied}</p>}
      </div>
    </div>
  );
}
