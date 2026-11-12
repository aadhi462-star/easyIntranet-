// Create a community (v2 workstream F, decisions F1 to F8; boards V2FStart, V2FQuestionnaire,
// V2FConfigure and V2FPhone). A focused page at /communities/new?draft=<id>: Choose, Questions
// (templates only), Configure, Preview, Publish. The draft stays in this browser under its own id
// until Publish (F4), so two tabs never mix; nothing reaches the server before then except the
// read-only template, suggestion and validation calls. Logo and cover stay in memory and are
// uploaded once the community exists.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { communityPath, errorText } from '../lib/communities.js';
import { isOn, useFeatures } from '../lib/features.js';
import { toast } from '../lib/toast.js';
import { Icon } from '../components/icons.jsx';
import { Modal } from '../components/ui.jsx';
import { Button, IconButton } from '../components/ui/Controls.jsx';
import { confirmAction } from '../components/ui/Confirm.jsx';
import { useCommunityWrite } from '../components/groups/useCommunity.js';
import {
  applySuggestion, editedFields, FIELDS, fromSuggestion, hasProgress, latestOtherDraft, loadDraft, neutralConfig, newDraft, newDraftId,
  problemsByField, removeDraft, same, saveDraft, stepIndex, STEPS, storageWorks,
} from '../components/create/draft.js';
import StartStep, { CreationClosed } from '../components/create/StartStep.jsx';
import QuestionsStep, { suggest } from '../components/create/QuestionsStep.jsx';
import ConfigureStep from '../components/create/ConfigureStep.jsx';
import PreviewStep from '../components/create/PreviewStep.jsx';
import PublishStep from '../components/create/PublishStep.jsx';

const LEAVE_TO = '/communities';
const templateOf = (t) => ({ key: t.key, name: t.name, category: t.category, description: t.description ?? '', version: t.version ?? t.currentVersion,
  questionnaire: Array.isArray(t.questionnaire) ? t.questionnaire : [], blueprint: t.blueprint ?? null, samples: t.samples ?? null, setsUp: t.setsUp ?? null });

export default function CreateCommunity() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const draftId = params.get('draft');
  const features = useFeatures();
  const learningAllowed = isOn(features, 'learning');
  const { refresh } = useCommunityWrite();

  const [draft, setDraft] = useState(null);
  const [storageOk, setStorageOk] = useState(() => storageWorks());
  const [savedAt, setSavedAt] = useState(null);
  const [templates, setTemplates] = useState({ status: 'loading', list: [] });
  const [pictures, setPictures] = useState({ logo: null, cover: null });
  const [problems, setProblems] = useState([]);
  const [focus, setFocus] = useState(null);
  const [updated, setUpdated] = useState([]);
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState('');
  const [closing, setClosing] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [otherTick, setOtherTick] = useState(0);
  const finished = useRef(false);

  useEffect(() => { document.title = 'Create a community · CommunityOne'; }, []);

  // Every wizard has its own draft id in the address (COM-12).
  useEffect(() => {
    if (!draftId) { setParams({ draft: newDraftId() }, { replace: true }); return; }
    setDraft(loadDraft(draftId) ?? newDraft(draftId));
    setProblems([]); setUpdated([]); setFocus(null);
  }, [draftId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Kept in this browser once a path is chosen; a browser that can't store still works.
  useEffect(() => {
    if (!draft || finished.current || !hasProgress(draft)) return;
    const ok = saveDraft(draft);
    setStorageOk(ok);
    if (ok) setSavedAt(Date.now());
  }, [draft]);

  // Without storage, leaving loses the setup: the browser asks first.
  useEffect(() => {
    if (storageOk || !hasProgress(draft) || finished.current) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [storageOk, draft]);

  // Picture previews are object URLs: released when replaced and when the page closes.
  const pics = useRef(pictures);
  pics.current = pictures;
  useEffect(() => () => ['logo', 'cover'].forEach((k) => pics.current[k] && URL.revokeObjectURL(pics.current[k].url)), []);

  const loadTemplates = useCallback(() => {
    setTemplates((t) => ({ ...t, status: 'loading' }));
    api('/templates').then(({ templates: list }) => setTemplates({ status: 'ready', list: list ?? [] }), (err) => {
      if (err instanceof ApiError && err.code === 'CREATE_RESTRICTED') setTemplates({ status: 'restricted', list: [] });
      else setTemplates({ status: 'error', list: [] });
    });
  }, []);
  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const update = useCallback((patch) => setDraft((d) => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch), updatedAt: Date.now() })), []);
  const goto = useCallback((step) => { update({ step }); window.scrollTo({ top: 0 }); }, [update]);

  const other = useMemo(() => (draft?.step === 'choose' ? latestOtherDraft(draftId) : null), [draft?.step, draftId, otherTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const edited = useMemo(() => (draft ? editedFields(draft) : []), [draft]);
  const errors = useMemo(() => problemsByField(problems), [problems]);

  if (!draft) return <div className="min-h-screen bg-[var(--az-page)]" />;

  const step = draft.step;
  const hasQuestions = draft.path === 'template' && (draft.template?.questionnaire ?? []).length > 0;

  // ---- Choose --------------------------------------------------------------------------------
  const choose = async ({ path, template }) => {
    setStartError('');
    const switching = draft.config && (path !== draft.path || (path === 'template' && template?.key !== draft.template?.key));
    if (switching) {
      const ok = await confirmAction({ title: 'Start again with this choice?', body: 'Your answers and setup so far are replaced. This can’t be undone.', confirm: 'Start again' });
      if (!ok) return;
    }
    if (path === 'scratch') {
      update({ path: 'scratch', template: null, answers: {}, base: null, withoutTemplate: false, config: switching || !draft.config ? neutralConfig() : draft.config, step: 'configure' });
      setUpdated([]);
      window.scrollTo({ top: 0 });
      return;
    }
    if (!switching && draft.template?.key === template.key && draft.config) { goto(hasQuestions ? 'questions' : 'configure'); return; }
    setBusy(true);
    try {
      const { template: full } = await api(`/templates/${encodeURIComponent(template.key)}`);
      const t = templateOf({ ...template, ...full });
      if (!t.questionnaire.length) {
        const { config } = await suggest(t, {});
        const sug = fromSuggestion(config);
        update({ path: 'template', template: t, answers: {}, config: sug, base: sug, withoutTemplate: false, step: 'configure' });
      } else {
        update({ path: 'template', template: t, answers: {}, config: null, base: null, withoutTemplate: false, step: 'questions' });
      }
      setUpdated([]);
      window.scrollTo({ top: 0 });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'CREATE_RESTRICTED') setTemplates({ status: 'restricted', list: [] });
      else if (code === 'TEMPLATE_INACTIVE' || code === 'TEMPLATE_NOT_FOUND') { setStartError('That template isn’t offered any more. Choose another, or start from scratch.'); loadTemplates(); } else setStartError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const continueOther = () => { if (other) setParams({ draft: other.id }); };
  const discardOther = async () => {
    if (!other) return;
    const ok = await confirmAction({ title: 'Discard this draft?', body: `“${other.config?.name?.trim() || 'Untitled community'}” is removed from this browser. This can’t be undone.`, confirm: 'Discard', danger: true });
    if (ok) { removeDraft(other.id); setOtherTick((n) => n + 1); }
  };

  // ---- Questions -----------------------------------------------------------------------------
  const answersDone = (config, { skipped }) => {
    const sug = fromSuggestion(config);
    const next = applySuggestion(draft.config, draft.base, sug);
    update({ config: next.config, base: next.base, step: 'configure', ...(skipped ? { answers: {} } : {}) });
    setUpdated(next.updated);
    window.scrollTo({ top: 0 });
  };
  const templateChanged = async () => {
    try {
      const { template: full } = await api(`/templates/${encodeURIComponent(draft.template.key)}`);
      const t = templateOf({ ...draft.template, ...full });
      const keys = new Set(t.questionnaire.map((q) => q.key));
      update((d) => ({ template: t, answers: Object.fromEntries(Object.entries(d.answers ?? {}).filter(([k]) => keys.has(k))) }));
    } catch (err) {
      toast(errorText(err), 'error');
    }
  };

  // ---- Configure -----------------------------------------------------------------------------
  const configChange = (config) => {
    const changed = Object.keys(FIELDS).filter((f) => !same(config[f], draft.config[f]));
    if (changed.length && problems.length) setProblems((ps) => ps.filter((p) => !changed.includes(p.field)));
    update({ config });
  };
  const picture = (kind, file) => setPictures((p) => {
    if (p[kind]) URL.revokeObjectURL(p[kind].url);
    return { ...p, [kind]: file ? { file, url: URL.createObjectURL(file) } : null };
  });

  // ---- Publish -------------------------------------------------------------------------------
  const published = async (community, failed) => {
    finished.current = true;
    removeDraft(draft.id);
    await refresh(community.id);
    if (failed.length) return; // PublishStep shows the community with where to add the pictures
    const name = draft.config.name.trim();
    navigate(communityPath(community), { replace: true });
    setTimeout(() => toast(`${name} is live. You’re its Owner.`), 400);
  };
  const fix = (field, list) => { setProblems(list); setFocus(field); goto('configure'); };

  // ---- Close (F1) ----------------------------------------------------------------------------
  const close = () => {
    if (!hasProgress(draft) || finished.current) { navigate(LEAVE_TO); return; }
    setClosing(true);
  };
  const leave = (discard) => {
    if (discard) removeDraft(draft.id);
    finished.current = true;
    setClosing(false);
    navigate(LEAVE_TO);
  };

  const shown = restricted && step !== 'publish' ? 'closed' : step;
  const savedNote = !storageOk ? 'This browser isn’t keeping the draft. Nothing is on the server yet.'
    : savedAt ? `Draft saved in this browser at ${new Date(savedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}. Nothing is on the server yet.`
      : 'Nothing is on the server yet.';

  return (
    <div className="min-h-screen bg-[var(--az-page)] text-[var(--az-text)]">
      <TopBar draft={draft} step={step} onClose={close} storageOk={storageOk} saved={!!savedAt}
        reachable={(id) => id === 'choose' || (id === 'questions' && hasQuestions) || (['configure', 'preview', 'publish'].includes(id) && !!draft.config)}
        onStep={(id) => goto(id)} />

      <main className="mx-auto flex w-full max-w-[1340px] flex-col gap-5 px-4 pb-32 pt-6 md:px-6 md:pb-12 md:pt-8">
        {!storageOk && (
          <p role="alert" className="notice notice-warn flex items-start gap-2">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
            <span><b>This browser isn’t keeping your draft.</b> You can still finish and publish, but if you close or reload this page, your setup is lost.</span>
          </p>
        )}

        {shown === 'closed' && <CreationClosed changed />}
        {shown === 'choose' && (
          <StartStep key={draft.id} draft={draft} templates={{ ...templates, retry: loadTemplates }} other={other} busy={busy} error={startError}
            onContinueOther={continueOther} onDiscardOther={discardOther} onContinue={choose} onCancel={close} />
        )}
        {shown === 'questions' && draft.template && (
          <QuestionsStep draft={draft} onAnswers={(answers) => update({ answers })} onDone={answersDone} onBack={() => goto('choose')}
            onTemplateGone={() => { loadTemplates(); goto('choose'); }} onTemplateChanged={templateChanged} onRestricted={() => setRestricted(true)} />
        )}
        {shown === 'configure' && draft.config && (
          <ConfigureStep draft={draft} onChange={configChange} edited={draft.path === 'template' ? edited : []} pictures={pictures} onPicture={picture}
            errors={errors} focus={focus} onFocused={() => setFocus(null)} updated={updated} onDismissUpdated={() => setUpdated([])}
            learningAllowed={learningAllowed} savedNote={savedNote}
            onBack={() => goto(hasQuestions ? 'questions' : 'choose')} onPreview={() => goto('preview')} onPublish={() => goto('publish')}
            onChangeAnswers={() => goto('questions')} />
        )}
        {shown === 'preview' && draft.config && (
          <PreviewStep draft={draft} pictures={pictures} learningAllowed={learningAllowed} onBack={() => goto('configure')} onPublish={() => goto('publish')} />
        )}
        {shown === 'publish' && draft.config && (
          <PublishStep draft={draft} learningAllowed={learningAllowed} pictures={pictures} onUpdate={update} onFix={fix}
            onBack={() => goto('configure')} onStartOver={() => goto('choose')} onRestricted={() => setRestricted(true)} onPublished={published} />
        )}
      </main>

      {closing && <CloseDialog storageOk={storageOk} onKeep={() => leave(false)} onDiscard={() => leave(true)} onStay={() => setClosing(false)} />}
    </div>
  );
}

/** Close, the steps and whether the draft is saved; on phones "Step n of 5 · name" and a bar. */
function TopBar({ draft, step, onClose, storageOk, saved, reachable, onStep }) {
  const at = stepIndex(step);
  const scratch = draft.path === 'scratch';
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--az-hairline)] bg-[var(--az-surface)]">
      <div className="mx-auto flex max-w-[1340px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden md:inline-flex"><Button size="sm" variant="ghost" icon="x" onClick={onClose} aria-label="Close. You can keep or discard the draft">Close</Button></span>
          <span className="md:hidden"><IconButton icon="x" size="sm" label="Close. You can keep or discard the draft" onClick={onClose} /></span>
          <span className="truncate text-[15px] font-semibold">Create a community</span>
        </div>
        <nav aria-label="Steps" className="hidden lg:block">
          <ol className="flex flex-wrap gap-x-5 gap-y-2">
            {STEPS.map((s, i) => {
              const done = i < at;
              const skipped = s.id === 'questions' && scratch;
              const current = i === at;
              const can = !current && reachable(s.id) && !skipped;
              const mark = (
                <span aria-hidden="true" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-bold ${current ? 'border-transparent bg-[var(--az-ok)] text-[var(--az-on-fill)]' : done && !skipped ? 'border-[var(--az-ok)] bg-[var(--az-ok-soft)] text-[var(--az-ok)]' : 'border-[var(--az-control)] bg-[var(--az-surface)] text-[var(--az-text-3)]'}`}>
                  {done && !skipped ? <Icon name="check" size={14} /> : i + 1}
                </span>
              );
              const text = <>{s.label}{skipped && <span className="t-small">(not used)</span>}{done && !skipped && <span className="sr-only"> (done)</span>}</>;
              return (
                <li key={s.id} aria-current={current ? 'step' : undefined}
                  className={`flex items-center gap-2 text-sm ${current ? 'font-semibold text-[var(--az-text)]' : 'font-medium text-[var(--az-text-2)]'}`}>
                  {can ? <button type="button" onClick={() => onStep(s.id)} className="inline-flex min-h-9 items-center gap-2 rounded-md hover:underline">{mark}{text}</button> : <>{mark}{text}</>}
                </li>
              );
            })}
          </ol>
        </nav>
        <span className="t-small hidden items-center gap-1.5 md:inline-flex">
          {storageOk ? <><Icon name="check" size={14} />{saved ? 'Draft saved in this browser' : 'Nothing saved yet'}</> : <><Icon name="alert" size={14} />Draft not kept</>}
        </span>
      </div>
      <div className="mx-auto max-w-[1340px] px-4 pb-2.5 md:px-6 lg:hidden">
        <p className="text-sm font-medium text-[var(--az-text-2)]">Step {at + 1} of {STEPS.length} · {STEPS[at].label}</p>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--az-sunken)]" role="progressbar" aria-label="Progress" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={at + 1}
          aria-valuetext={`Step ${at + 1} of ${STEPS.length}, ${STEPS[at].label}`}>
          <div className="h-full rounded-full bg-[var(--az-ok)] transition-[width]" style={{ width: `${((at + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>
    </header>
  );
}

/** F1: closing asks whether to keep the draft. Escape or the X means "stay". */
function CloseDialog({ storageOk, onKeep, onDiscard, onStay }) {
  return (
    <Modal title={storageOk ? 'Keep this draft?' : 'Leave without your draft?'} onClose={onStay}>
      <p className="text-sm leading-[22px] text-[var(--az-text-2)]">
        {storageOk ? 'It stays in this browser, so you can finish it later from Create Community. Nothing is on the server yet.'
          : 'This browser can’t keep drafts, so leaving loses your setup. Nothing is on the server yet.'}
      </p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button onClick={onStay}>Stay here</Button>
        <Button variant={storageOk ? 'secondary' : 'danger'} onClick={onDiscard}>{storageOk ? 'Discard draft' : 'Leave and discard'}</Button>
        {storageOk && <Button variant="primary" onClick={onKeep}>Keep draft</Button>}
      </div>
    </Modal>
  );
}
