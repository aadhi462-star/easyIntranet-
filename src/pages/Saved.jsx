// Saved (Stage 4): posts, events and resources kept on your account. Something you can no
// longer open stays listed so you know it's gone, but shows nothing of what it was.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSaved, importBookmarks, setSaved } from '../lib/engage.js';
import { accentOf, errorText } from '../lib/communities.js';
import { bookmarksOf, fmtDate, useStore } from '../lib/store.jsx';
import { toast } from '../lib/toast.js';
import { PageHeader, Tabs } from '../components/ui.jsx';

const TABS = [['post', 'Posts'], ['event', 'Events'], ['resource', 'Resources']];

export default function Saved() {
  const { state, me, dispatch } = useStore();
  const [tab, setTab] = useState('post');
  const [s, setS] = useState({ status: 'loading', items: [] });
  const load = useCallback(() => fetchSaved(tab).then((items) => setS({ status: 'ready', items }), (e) => setS({ status: 'error', message: errorText(e), items: [] })), [tab]);
  useEffect(() => { document.title = 'Saved · CommunityOne'; }, []);
  // Bookmarks kept in this browser before Stage 4 move to the account the first time Saved opens.
  useEffect(() => {
    const old = bookmarksOf(state, me.id);
    const done = () => { load(); };
    if (old.length) {
      importBookmarks(me.id, old, () => dispatch({ type: 'set', key: 'bookmarks', silent: true, value: (b) => ({ ...(b || {}), [me.id]: [] }) }))
        .then((n) => { if (n) toast(`${n} bookmark${n === 1 ? '' : 's'} from this browser moved to Saved`); done(); }, done);
    } else done();
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const remove = async (i) => {
    try { await setSaved(i.type, i.id, false); setS((p) => ({ ...p, items: p.items.filter((x) => !(x.type === i.type && x.id === i.id)) })); }
    catch (e) { toast(errorText(e), 'error'); }
  };

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6">
      <PageHeader title="Saved" subtitle="Only you see what you’ve saved." />
      <Tabs value={tab} onChange={setTab} tabs={TABS.map(([id, label]) => ({ id, label }))} />
      {s.status === 'loading' ? <div aria-busy="true" aria-label="Loading saved items" className="glass h-32 animate-pulse" />
        : s.status === 'error' ? <div role="alert" className="glass p-5 text-sm"><p className="text-rose-300">{s.message}</p><button className="btn btn-ghost mt-3" onClick={load}>Try again</button></div>
          : s.items.length === 0 ? <p className="band text-2 p-6 text-center">Nothing saved yet. Use Save on a post, event or resource to keep it here.</p>
            : (
              <ul className="list-rows -mt-2">
                {s.items.map((i) => (
                  <li key={`${i.type}:${i.id}`} className="flex items-center gap-3 py-4">
                    {i.available ? (
                      <Link to={i.href} className="min-w-0 flex-1">
                        <span className="t-small block"><span className={`cm-${accentOf(i.community)} cm-ink font-medium`}>{i.community.name}</span>{i.start ? ` · ${fmtDate(Date.parse(i.start), { day: 'numeric', month: 'short' })}` : ''}</span>
                        <span className="line-clamp-2 block text-[15px] leading-6 text-white">{i.title}</span>
                      </Link>
                    ) : (
                      <span className="min-w-0 flex-1"><span className="text-3 block text-[15px] italic">No longer available</span><span className="t-small">You can’t open this any more. It may have been deleted, or you left its community.</span></span>
                    )}
                    <button className="btn btn-ghost shrink-0" onClick={() => remove(i)} aria-label={i.available ? `Remove “${i.title}” from Saved` : 'Remove from Saved'}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
    </div>
  );
}
