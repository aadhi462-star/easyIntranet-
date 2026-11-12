import { Glyph, Icon } from '../components/icons.jsx';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore, uid } from '../lib/store.jsx';
import { confirmAction } from '../components/ui/Confirm.jsx';
import { Avatar, AvatarStack, Empty, Field, Modal, PageHeader, Tabs, UserLink } from '../components/ui.jsx';
import PeoplePicker from '../components/events/PeoplePicker.jsx';
import { useMedia, useRecorder } from '../components/events/useMedia.js';
import { ChatPanel, ControlButton, Elapsed, Video } from '../components/events/MediaBits.jsx';
import { fmtSize, fromInput, toInput } from '../components/events/eventUtils.js';

const SIMULATED_NOTE = 'Demo: there is no media server, so other people’s audio and video are simulated. Your own camera, microphone, screen share and recordings are real and stay on this device.';

export default function Live() {
  const { id } = useParams();
  const { state } = useStore();
  if (!id) return <LiveHome />;
  const bc = (state.broadcasts || []).find((b) => b.id === id);
  if (bc) return <Broadcast key={bc.id} bc={bc} />;
  const mt = (state.meetings || []).find((m) => m.id === id);
  if (mt) return <MeetingRoom key={mt.id} mt={mt} />;
  return <Empty icon="live" title="Room not found">Check the link or code. <Link to="/live" className="text-brand-400 underline">Back to Live</Link></Empty>;
}

function LiveHome() {
  const { state, me, dispatch } = useStore();
  const nav = useNavigate();
  const [tab, setTab] = useState('broadcasts');
  const [modal, setModal] = useState(null);
  const [code, setCode] = useState('');
  const broadcasts = [...(state.broadcasts || [])].sort((a, b) => ({ live: 0, scheduled: 1, ended: 2 }[a.status] - { live: 0, scheduled: 1, ended: 2 }[b.status]) || a.scheduledAt - b.scheduledAt);
  const meetings = [...(state.meetings || [])].filter((m) => m.participants.includes(me.id) || m.hostId === me.id || me.admin).sort((a, b) => a.scheduledAt - b.scheduledAt);

  const instant = () => {
    const id = uid('mt');
    dispatch({ type: 'add', col: 'meetings', item: { id, title: `${me.name.split(' ')[0]}’s meeting`, hostId: me.id, participants: [me.id], scheduledAt: Date.now(), chat: [] } });
    nav(`/live/${id}`);
  };

  return (
    <div>
      <PageHeader title="Live & Meetings" subtitle="Stream to the whole network or meet face to face."
        actions={<>
          <button className="btn btn-ghost" onClick={instant}><Glyph value="bolt" tile={false} size={16} /> Instant meeting</button>
          <button className="btn btn-ghost" onClick={() => setModal('meeting')}>Schedule meeting</button>
          <button className="btn btn-primary" onClick={() => setModal('broadcast')}><Glyph value="live" tile={false} size={16} /> New broadcast</button>
        </>} />
      <form className="glass mb-5 flex flex-wrap items-center gap-2 p-3" onSubmit={(e) => { e.preventDefault(); const c = code.trim().split('/').pop(); if (c) nav(`/live/${c}`); }}>
        <label htmlFor="code" className="px-1 text-sm font-semibold">Join with a link or code</label>
        <input id="code" className="input min-w-0 flex-1" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. mt1" />
        <button className="btn btn-primary" disabled={!code.trim()}>Join</button>
      </form>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'broadcasts', label: 'Broadcasts', count: broadcasts.length }, { id: 'meetings', label: 'My meetings', count: meetings.length }]} />
      {tab === 'broadcasts' ? (
        <div className="grid gap-4 md:grid-cols-2">
          {broadcasts.map((b) => (
            <Link key={b.id} to={`/live/${b.id}`} className="glass block p-5 transition hover:-translate-y-0.5">
              <span className={`chip ${b.status === 'live' ? '!bg-[var(--az-danger-soft)] !text-[var(--az-danger)]' : b.status === 'ended' ? '!bg-[var(--az-sunken)] !text-[var(--az-text-2)]' : ''}`}>
                {b.status === 'live' ? '● Live now' : b.status === 'ended' ? 'Ended' : 'Scheduled'}
              </span>
              <h3 className="mt-3 font-bold"><Glyph value="live" tile={false} size={16} /> {b.title}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-[var(--az-text-2)]">{b.description}</p>
              <p className="mt-3 text-xs text-[var(--az-text-2)]">
                {new Date(b.scheduledAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · Host {state.users.find((u) => u.id === b.hostId)?.name}
                {b.status === 'ended' && b.peakViewers ? ` · ${b.peakViewers} peak viewers` : ''}
              </p>
            </Link>
          ))}
          {!broadcasts.length && <Empty icon="live" title="No broadcasts yet" />}
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => (
            <Link key={m.id} to={`/live/${m.id}`} className="glass flex flex-wrap items-center gap-4 p-4">
              <div className="flex-1">
                <h3 className="font-bold"><Glyph value="video" tile={false} size={16} /> {m.title}</h3>
                <p className="text-xs text-[var(--az-text-2)]">{new Date(m.scheduledAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · code <code>{m.id}</code></p>
              </div>
              <AvatarStack ids={m.participants} />
              <span className="btn btn-primary">Join</span>
            </Link>
          ))}
          {!meetings.length && <Empty icon="video" title="No meetings">Start an instant meeting or schedule one.</Empty>}
        </div>
      )}
      {modal && <CreateModal kind={modal} onClose={() => setModal(null)} />}
    </div>
  );
}

function CreateModal({ kind, onClose }) {
  const { me, dispatch } = useStore();
  const nav = useNavigate();
  const def = (() => { const d = new Date(Date.now() + 864e5); d.setHours(18, 0, 0, 0); return d.getTime(); })();
  const [f, setF] = useState({ title: '', description: '', when: toInput(def), people: [] });
  const [error, setError] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const when = fromInput(f.when);
    if (!f.title.trim()) return setError('Add a title.');
    if (Number.isNaN(when)) return setError('Choose a time.');
    const id = uid(kind === 'broadcast' ? 'bc' : 'mt');
    if (kind === 'broadcast') {
      dispatch({ type: 'add', col: 'broadcasts', item: { id, title: f.title.trim(), description: f.description.trim(), hostId: me.id, status: 'scheduled', scheduledAt: when, chat: [], subscribers: [], peakViewers: 0 } });
    } else {
      dispatch({ type: 'add', col: 'meetings', item: { id, title: f.title.trim(), hostId: me.id, participants: [me.id, ...f.people], scheduledAt: when, chat: [] } });
      for (const userId of f.people) dispatch({ type: 'notify', silent: true, notification: { userId, kind: 'event', text: `${me.name} invited you to a meeting: ${f.title.trim()}`, link: `/live/${id}` } });
    }
    onClose();
    nav(`/live/${id}`);
  };
  return (
    <Modal title={kind === 'broadcast' ? 'Schedule a live broadcast' : 'Schedule a meeting'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Title"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        {kind === 'broadcast' && <Field label="Description"><textarea className="input min-h-20" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>}
        <Field label="When"><input className="input" type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} /></Field>
        {kind === 'meeting' && <Field label="Invite"><PeoplePicker value={f.people} onChange={(people) => setF({ ...f, people })} exclude={[me.id]} /></Field>}
        {error && <p role="alert" className="text-sm text-[var(--az-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary">Create</button></div>
      </form>
    </Modal>
  );
}

/** Random-walk viewer count while a broadcast is live (there's no real audience). */
function useSimulatedViewers(live, base = 40) {
  const [n, setN] = useState(base);
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(() => setN((v) => Math.max(1, Math.round(v + (Math.random() - 0.35) * 8))), 3000);
    return () => clearInterval(t);
  }, [live]);
  return n;
}

function Broadcast({ bc }) {
  const { me, state, dispatch } = useStore();
  const isHost = bc.hostId === me.id;
  const live = bc.status === 'live';
  const viewers = useSimulatedViewers(live, Math.max(12, Math.round(state.users.length * 6)));
  const setBc = (patch) => dispatch({ type: 'update', col: 'broadcasts', id: bc.id, patch });

  useEffect(() => {
    if (live && viewers > (bc.peakViewers || 0)) dispatch({ type: 'update', col: 'broadcasts', id: bc.id, patch: { peakViewers: viewers }, silent: true });
  }, [viewers]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <Link to="/live" className="text-sm text-[var(--az-text-2)] hover:text-[var(--az-text)]">← Live & Meetings</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight"><Glyph value="live" tile={false} size={16} /> {bc.title}</h1>
        <span className={`chip ${live ? '!bg-[var(--az-danger-soft)] !text-[var(--az-danger)]' : bc.status === 'ended' ? '!bg-[var(--az-sunken)] !text-[var(--az-text-2)]' : ''}`}>{live ? '● Live' : bc.status === 'ended' ? 'Ended' : 'Scheduled'}</span>
        {live && <span className="chip !bg-[var(--az-sunken)] !text-[var(--az-text)]"><Glyph value="eye" tile={false} size={16} /> {viewers} watching <span className="opacity-60">(simulated)</span></span>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {isHost ? <Studio bc={bc} setBc={setBc} viewers={viewers} /> : <Viewer bc={bc} />}
        <ChatPanel col="broadcasts" id={bc.id} chat={bc.chat} disabled={bc.status === 'ended'} />
      </div>
    </div>
  );
}

function Studio({ bc, setBc, viewers }) {
  const { state, dispatch, me } = useStore();
  const media = useMedia();
  const recorder = useRecorder();
  const [layout, setLayout] = useState('auto');
  const live = bc.status === 'live';
  const ended = bc.status === 'ended';
  const showScreen = media.screen && layout !== 'camera';
  const showCam = media.stream && media.cam && (layout !== 'screen' || !media.screen);

  const recordStream = () => {
    const video = media.screen?.getVideoTracks() ?? media.stream?.getVideoTracks() ?? [];
    const audio = media.stream?.getAudioTracks() ?? [];
    return video.length || audio.length ? new MediaStream([...video, ...audio]) : null;
  };

  const goLive = () => {
    setBc({ status: 'live', startedAt: Date.now() });
    for (const userId of new Set([...(bc.subscribers || []), ...state.users.map((u) => u.id)])) {
      if (userId !== me.id) dispatch({ type: 'notify', silent: true, notification: { userId, kind: 'event', text: `${me.name} is live: ${bc.title}`, link: `/live/${bc.id}` } });
    }
  };
  const end = async () => {
    if (!(await confirmAction('End the broadcast for everyone?'))) return;
    recorder.stop();
    media.stopAll();
    setBc({ status: 'ended', endedAt: Date.now(), peakViewers: Math.max(bc.peakViewers || 0, viewers) });
  };

  return (
    <section className="space-y-3" aria-label="Broadcast studio">
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#0e1311] text-[#fff] ring-1 ring-[var(--az-hairline)]">
        {showScreen && <Video stream={media.screen} className="!object-contain" />}
        {showCam && (
          <div className={showScreen ? (layout === 'side' ? 'absolute inset-y-0 right-0 w-1/3 border-l border-[#ffffff1a]' : 'absolute bottom-3 right-3 aspect-video w-1/4 overflow-hidden rounded-xl ring-2 ring-[#ffffff4d]') : 'absolute inset-0'}>
            <Video stream={media.stream} mirror />
          </div>
        )}
        {!showScreen && !showCam && (
          <div className="absolute inset-0 grid place-items-center text-center">
            <div><Avatar user={me} size={88} /><p className="mt-3 text-sm text-[#fff]/70">{media.stream ? 'Camera is off' : ended ? 'This broadcast has ended.' : 'Start your camera to preview the stage.'}</p></div>
          </div>
        )}
        {live && <span className="absolute left-3 top-3 rounded-md bg-[#b42318] px-2 py-1 text-xs font-bold text-[#fff]">● LIVE <Elapsed since={bc.startedAt || Date.now()} /></span>}
        {recorder.recording && <span className="absolute right-3 top-3 rounded-md bg-black/70 px-2 py-1 text-xs font-bold text-[#f08a80]"><Glyph value="record" tile={false} size={16} /> REC <Elapsed since={recorder.startedAt} /></span>}
      </div>

      {(media.error || recorder.error) && <p role="alert" className="notice notice-bad">{media.error || recorder.error}</p>}

      {!ended && (
        <div className="glass flex flex-wrap items-center justify-center gap-3 p-3">
          {!media.stream ? <button className="btn btn-primary" onClick={media.start} disabled={media.starting}>{media.starting ? 'Starting…' : 'Start camera & mic'}</button> : <>
            <ControlButton on={media.mic} onClick={media.toggleMic} label={media.mic ? 'Mute microphone' : 'Unmute microphone'} icon="mic" offIcon="micoff" />
            <ControlButton on={media.cam} onClick={media.toggleCam} label={media.cam ? 'Turn camera off' : 'Turn camera on'} icon="camera" offIcon="cameraoff" />
          </>}
          <ControlButton on={!media.screen} onClick={media.shareScreen} label={media.screen ? 'Stop sharing screen' : 'Share screen'} icon="screen" offIcon="screenoff" />
          <select className="input !w-auto" value={layout} onChange={(e) => setLayout(e.target.value)} aria-label="Stage layout">
            <option value="auto">Layout: Screen + camera</option><option value="side">Layout: Side by side</option><option value="screen">Layout: Screen only</option><option value="camera">Layout: Camera only</option>
          </select>
          {recorder.recording ? <button className="btn btn-ghost !text-[var(--az-danger)]" onClick={recorder.stop}>Stop recording</button>
            : <button className="btn btn-ghost" onClick={() => recorder.start(recordStream())} disabled={!media.stream && !media.screen}><Glyph value="record" tile={false} size={16} /> Record</button>}
          {live ? <button className="btn btn-danger" onClick={end}>End broadcast</button>
            : <button className="btn btn-primary" onClick={goLive}>● Go live</button>}
        </div>
      )}

      {recorder.clips.length > 0 && (
        <div className="glass p-4">
          <h3 className="mb-2 font-bold">Recordings</h3>
          <ul className="space-y-2 text-sm">
            {recorder.clips.map((c) => <li key={c.url} className="flex items-center gap-3"><span className="flex-1 truncate">{c.name}</span><span className="text-xs text-[var(--az-text-3)]">{fmtSize(c.size)}</span><a className="btn btn-ghost !py-1.5" href={c.url} download={c.name}>Download</a></li>)}
          </ul>
        </div>
      )}
      {ended && <p className="text-sm text-[var(--az-text-2)]">Ended {new Date(bc.endedAt).toLocaleString()} · peak {bc.peakViewers} viewers (simulated).</p>}
      <p className="text-xs text-[var(--az-text-3)]">{SIMULATED_NOTE}</p>
    </section>
  );
}

function Viewer({ bc }) {
  const { state, me, dispatch } = useStore();
  const host = state.users.find((u) => u.id === bc.hostId);
  const subscribed = (bc.subscribers || []).includes(me.id);
  return (
    <section className="space-y-3" aria-label="Broadcast">
      <div className="relative grid aspect-video place-items-center overflow-hidden rounded-2xl bg-[#0e1311] bg-gradient-to-br from-[#062c23]/60 via-black to-[#141614]/50 text-[#fff] ring-1 ring-[var(--az-hairline)]">
        <div className="text-center">
          <Avatar user={host} size={96} />
          <p className="mt-3 font-semibold">{host?.name}</p>
          <p className="mt-1 max-w-sm px-4 text-sm text-[#fff]/70">
            {bc.status === 'live' ? 'Live now. The host’s video isn’t available in this demo because there’s no media server.'
              : bc.status === 'ended' ? 'This broadcast has ended.'
                : `Starts ${new Date(bc.scheduledAt).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`}
          </p>
        </div>
        {bc.status === 'live' && <span className="absolute left-3 top-3 rounded-md bg-[#b42318] px-2 py-1 text-xs font-bold text-[#fff]">● LIVE</span>}
      </div>
      <div className="glass p-4">
        <p className="text-[var(--az-text)]">{bc.description}</p>
        <p className="mt-2 text-sm text-[var(--az-text-2)]">Hosted by <UserLink id={bc.hostId} /></p>
        {bc.status === 'scheduled' && (
          <button className="btn btn-ghost mt-3" aria-pressed={subscribed}
            onClick={() => dispatch({ type: 'update', col: 'broadcasts', id: bc.id, patch: (x, m) => ({ ...x, subscribers: subscribed ? x.subscribers.filter((s) => s !== m) : [...(x.subscribers || []), m] }) })}>
            {subscribed ? '✓ You’ll be notified' : 'Notify me when live'}
          </button>
        )}
      </div>
    </section>
  );
}

function MeetingRoom({ mt }) {
  const { state, me, dispatch } = useStore();
  const nav = useNavigate();
  const media = useMedia();
  const [joined, setJoined] = useState(false);
  const [panel, setPanel] = useState('people');
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(null);
  const others = mt.participants.filter((p) => p !== me.id).map((id) => state.users.find((u) => u.id === id)).filter(Boolean);

  // Simulated active speaker among the other participants.
  useEffect(() => {
    if (!joined || !others.length) return undefined;
    const t = setInterval(() => setSpeaking(Math.random() < 0.3 ? null : others[Math.floor(Math.random() * others.length)].id), 2500);
    return () => clearInterval(t);
  }, [joined, others.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const join = async () => {
    await media.start(); // joining without media is fine if permission is denied
    if (!mt.participants.includes(me.id)) dispatch({ type: 'update', col: 'meetings', id: mt.id, patch: (x, m) => ({ ...x, participants: [...x.participants, m] }) });
    setJoined(true);
  };
  const leave = () => { media.stopAll(); setJoined(false); nav('/live'); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  if (!joined) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Link to="/live" className="text-sm text-[var(--az-text-2)] hover:text-[var(--az-text)]">← Live & Meetings</Link>
        <section className="glass p-6 text-center">
          <h1 className="text-2xl font-extrabold"><Glyph value="video" tile={false} size={16} /> {mt.title}</h1>
          <p className="mt-1 text-sm text-[var(--az-text-2)]">Hosted by {state.users.find((u) => u.id === mt.hostId)?.name} · code <code>{mt.id}</code></p>
          <div className="mt-5 flex justify-center"><AvatarStack ids={mt.participants} max={6} size={36} /></div>
          <p className="mt-2 text-sm text-[var(--az-text-2)]">{mt.participants.length} invited</p>
          <button className="btn btn-primary mt-6 h-12 px-8" onClick={join} disabled={media.starting}>{media.starting ? 'Starting camera…' : 'Join meeting'}</button>
          <p className="mt-4 text-xs text-[var(--az-text-3)]">{SIMULATED_NOTE}</p>
        </section>
      </div>
    );
  }

  const tiles = [
    { id: 'me', user: me, local: true },
    ...(media.screen ? [{ id: 'screen', screen: true }] : []),
    ...others.map((u) => ({ id: u.id, user: u })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold"><Glyph value="video" tile={false} size={16} /> {mt.title}</h1>
        <button className="btn btn-ghost" onClick={copy}>{copied ? '✓ Link copied' : 'Copy invite link'}</button>
      </div>
      {media.error && <p role="alert" className="notice notice-bad">{media.error} You’re in the meeting without audio or video.</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section aria-label="Participants video" className={`grid gap-3 ${tiles.length > 4 ? 'grid-cols-2 md:grid-cols-3' : tiles.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
          {tiles.map((t) => (
            <div key={t.id} className={`relative aspect-video overflow-hidden rounded-2xl bg-[#0e1311] text-[#fff] ring-2 transition ${speaking === t.id ? 'ring-[var(--az-ok)]' : 'ring-[var(--az-hairline)]'} ${t.screen ? 'col-span-full' : ''}`}>
              {t.screen ? <Video stream={media.screen} className="!object-contain" />
                : t.local && media.stream && media.cam ? <Video stream={media.stream} mirror />
                  : <div className="grid h-full place-items-center"><Avatar user={t.user} size={72} /></div>}
              <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs">
                {t.screen ? 'Your screen' : t.local ? <>{me.name} (you){!media.mic && <> · <Icon name="micoff" size={12} label="Muted" className="inline align-[-2px]" /></>}</> : `${t.user.name} · simulated`}
              </span>
            </div>
          ))}
        </section>
        <aside className="flex flex-col gap-3">
          <Tabs value={panel} onChange={setPanel} tabs={[{ id: 'people', label: 'People', count: mt.participants.length }, { id: 'chat', label: 'Chat', count: (mt.chat || []).length }]} />
          {panel === 'people' ? (
            <ul className="glass space-y-2 p-4">
              {[me, ...others].map((u) => (
                <li key={u.id} className="flex items-center gap-2 text-sm">
                  <Avatar user={u} size={30} /><span className="flex-1">{u.name}{u.id === me.id && ' (you)'}{u.id === mt.hostId && <span className="ml-1 text-xs text-brand-400">Host</span>}</span>
                  {u.id === me.id && !media.mic ? <Icon name="micoff" size={16} label="Muted" />
                    : speaking === u.id ? <Icon name="speaker" size={16} label="Speaking" /> : <Icon name="mic" size={16} className="text-[var(--az-text-3)]" />}
                </li>
              ))}
            </ul>
          ) : <ChatPanel col="meetings" id={mt.id} chat={mt.chat} title="Meeting chat" />}
        </aside>
      </div>
      <div className="glass sticky bottom-3 flex flex-wrap items-center justify-center gap-3 p-3">
        {media.stream ? <>
          <ControlButton on={media.mic} onClick={media.toggleMic} label={media.mic ? 'Mute' : 'Unmute'} icon="mic" offIcon="micoff" />
          <ControlButton on={media.cam} onClick={media.toggleCam} label={media.cam ? 'Stop video' : 'Start video'} icon="camera" offIcon="cameraoff" />
        </> : <button className="btn btn-ghost" onClick={media.start}><Glyph value="video" tile={false} size={16} /> Enable camera & mic</button>}
        <ControlButton on={!media.screen} onClick={media.shareScreen} label={media.screen ? 'Stop sharing' : 'Share screen'} icon="screen" offIcon="screenoff" />
        <ControlButton danger onClick={leave} label="Leave meeting" icon="hangup" />
      </div>
      <p className="text-xs text-[var(--az-text-3)]">{SIMULATED_NOTE}</p>
    </div>
  );
}
