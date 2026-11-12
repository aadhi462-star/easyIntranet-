import { Glyph } from '../components/icons.jsx';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { PageHeader } from '../components/ui.jsx';
import ForumList from '../components/collab/ForumList.jsx';
import { CategoryModal, ForumPostView } from '../components/collab/forum.jsx';
import { canSeeGroupItem } from '../components/collab/common.jsx';

export default function Forums() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { state, dispatch, me, can } = useStore();
  const nav = useNavigate();
  const [catModal, setCatModal] = useState(null); // null | 'new' | category
  const [more, setMore] = useState(false);

  const category = id && state.forumCategories.find((c) => c.id === id || c.slug === id);
  // Drafts are only for their author; private-group posts only for that group's members.
  const post = id && !category && state.forumPosts.find((f) => f.id === id
    && (f.status === 'draft' ? f.authorId === me.id : canSeeGroupItem(state, me, f)));
  const view = params.get('view') || 'all';
  const follows = state.forumFollows?.[me.id] ?? [];
  const toggleFollow = (cid) => dispatch({ type: 'set', key: 'forumFollows', value: (prev = {}, uid) => {
    const mine = prev[uid] ?? [];
    return { ...prev, [uid]: mine.includes(cid) ? mine.filter((x) => x !== cid) : [...mine, cid] };
  } });

  const link = (v) => `px-3 min-h-10 flex items-center gap-2 rounded-xl text-sm ${v ? 'bg-brand-500/20 text-white ring-1 ring-brand-500/40' : 'text-slate-300 hover:bg-white/5'}`;
  const count = (cid) => state.forumPosts.filter((f) => f.status !== 'draft' && f.categories.includes(cid) && canSeeGroupItem(state, me, f)).length;

  return (
    <div className="ext-grid grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside aria-label="Forum menu" className="ext-menu glass h-fit p-3 lg:sticky lg:top-24">
        <nav className="space-y-1">
          <Link to="/forums" className={link(!id && view === 'all')}><Glyph value="forums" tile={false} size={16} /> All posts</Link>
          <Link to="/forums?view=following" className={link(!id && view === 'following')}><Glyph value="star" tile={false} size={16} /> Following</Link>
          <Link to="/forums?view=unanswered" className={link(!id && view === 'unanswered')}><Glyph value="questions" tile={false} size={16} /> Unanswered</Link>
          <button className={`${link(false)} w-full`} onClick={() => setMore(!more)} aria-expanded={more}>⋯ See more</button>
          {more && <Link to="/forums?view=drafts" className={link(view === 'drafts')}><Glyph value="drafts" tile={false} size={16} /> My Drafts</Link>}
        </nav>
        <div className="mt-4 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Categories</div>
        <nav className="space-y-1">
          {state.forumCategories.map((c) => (
            <Link key={c.id} to={`/forums/${c.slug || c.id}`} className={link(category?.id === c.id)}>
              <span className="flex-1 truncate">{c.name}</span>
              {(follows.includes(c.id) || c.autoFollow) && <span aria-label="Following" title="Following"><Glyph value="star" tile={false} size={16} /></span>}
              <span className="text-xs text-slate-500">{count(c.id)}</span>
            </Link>
          ))}
        </nav>
        {can('forum.category') && <button className="btn btn-ghost mt-3 w-full" onClick={() => setCatModal('new')}>＋ New Category</button>}
      </aside>

      <section>
        {post ? <ForumPostView post={post} /> : id && !category ? (
          <div className="glass p-8">This forum post was not found. <Link to="/forums" className="text-brand-400 underline">Back to forums</Link></div>
        ) : (
          <>
            <PageHeader
              title={category ? category.name : view === 'drafts' ? 'My Drafts' : view === 'following' ? 'Following' : view === 'unanswered' ? 'Unanswered' : 'Forums'}
              subtitle={category ? `${count(category.id)} posts${category.autoFollow ? ' · shown in everyone’s feed' : ''}${category.whoCanPost === 'admins' ? ' · admins post only' : ''}` : 'Questions, ideas and long-form discussions.'}
              actions={category && (
                <>
                  <button className="btn btn-ghost" onClick={() => toggleFollow(category.id)} disabled={category.autoFollow}>
                    {category.autoFollow ? 'Auto-followed' : follows.includes(category.id) ? 'Following' : '☆ Follow'}
                  </button>
                  {can('forum.category') && <button className="btn btn-ghost" onClick={() => setCatModal(category)}>Edit</button>}
                  {can('forum.category') && (
                    <button className="btn btn-ghost text-rose-300" onClick={() => {
                      if (!confirm(`Delete the “${category.name}” category? Posts stay but lose this category.`)) return;
                      dispatch({ type: 'remove', col: 'forumCategories', id: category.id });
                      nav('/forums');
                    }}>Delete</button>
                  )}
                </>
              )} />
            <ForumList categoryId={category?.id} view={category ? 'all' : view} />
          </>
        )}
      </section>
      {catModal && <CategoryModal category={catModal === 'new' ? null : catModal} onClose={() => setCatModal(null)} />}
    </div>
  );
}
