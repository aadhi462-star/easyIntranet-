// Client for the feed API (server/routes/posts.js). The server is the source of truth for posts,
// comments, reactions, votes and acknowledgements: every write returns (or is followed by) the
// fresh post, which is broadcast to every mounted list so a card never double-counts.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, newKey } from './api.js';

/** The old "network / Company Wall" scope. Group scopes keep their ids (g0…g7). */
export const NETWORK_ID = 'alumnizone';
export const PAGE = 15;

/** Server mood kinds → emoji. */
export const MOODS = { happy: '😊', neutral: '😐', sad: '😞' };

// ---- Change broadcast -------------------------------------------------------------------------
// {type:'post', post} a post changed · {type:'removed', id} gone for this viewer ·
// {type:'created', post} a new post (lists reload their first page).
const listeners = new Set();
export function onFeedEvent(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = (e) => listeners.forEach((fn) => fn(e));
const changed = (post) => { emit({ type: 'post', post }); return post; };

// ---- Reads ------------------------------------------------------------------------------------
export async function fetchFeed({ view = 'all', community, before, limit = PAGE, filters } = {}) {
  const q = new URLSearchParams({ view, limit: String(limit) });
  if (community) q.set('community', community);
  // Inside one community: { topic, q, sort: 'newest' | 'active' } (Stage 4 Discussions).
  for (const [k, v] of Object.entries(filters || {})) if (v) q.set(k, v);
  if (before) q.set('before', before);
  return api(`/feed?${q}`);
}

/** One post with its comments, or null when it doesn't exist / isn't visible (404). */
export async function fetchPost(id) {
  try {
    return (await api(`/posts/${encodeURIComponent(id)}`)).post;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Reads a post's comments and shares the fresh post (with `comments`) with every list. */
export async function loadComments(id) {
  const fresh = await fetchPost(id);
  if (fresh) changed(fresh); else emit({ type: 'removed', id });
  return fresh;
}

let communitiesCache = null;
// A different person signing in on the same tab must never see the previous person's list.
if (typeof window !== 'undefined') {
  window.addEventListener('c1-session-changed', () => { communitiesCache = null; });
  // Registered at import, before any page's listener, so those refetch fresh data.
  window.addEventListener('c1-community-changed', () => { communitiesCache = null; });
}
/** Communities you're an active member of, with your role. Cached for the page session. */
export async function fetchMyCommunities({ fresh = false } = {}) {
  if (!communitiesCache || fresh) {
    communitiesCache = api('/communities')
      .then(({ communities }) => communities.filter((c) => c.membership?.state === 'active'))
      .catch((e) => { communitiesCache = null; throw e; });
  }
  return communitiesCache;
}
const ADMIN_ROLES = ['admin', 'owner'];
const MOD_ROLES = ['moderator', 'admin', 'owner'];
export const isCommunityAdmin = (c) => ADMIN_ROLES.includes(c?.membership?.role);
export const isCommunityModerator = (c) => MOD_ROLES.includes(c?.membership?.role);

// ---- Writes -----------------------------------------------------------------------------------
/** `key` is an idempotency key kept by the caller for one submit, so a retry can't duplicate. */
export async function createPost(communityId, payload, key = newKey()) {
  const { post } = await api(`/communities/${encodeURIComponent(communityId)}/posts`, { method: 'POST', body: payload, idempotencyKey: key });
  emit({ type: 'created', post });
  return post;
}

export const editPost = async (post, { body, mentions }) =>
  changed((await api(`/posts/${post.id}`, { method: 'PATCH', body: { version: post.version, body, mentions } })).post);

export const publishPost = async (id) => changed((await api(`/posts/${id}/publish`, { method: 'POST' })).post);
export const approvePost = async (id) => changed((await api(`/posts/${id}/approve`, { method: 'POST' })).post);

export async function removePost(id, reason) {
  await api(`/posts/${id}/remove`, { method: 'POST', body: { reason } });
  emit({ type: 'removed', id });
}

export async function pinPost(id, pinned) {
  await api(`/posts/${id}/pin`, { method: 'POST', body: { pinned } });
  const fresh = await fetchPost(id);
  if (fresh) changed(fresh);
  return fresh;
}

export async function deletePost(id) {
  await api(`/posts/${id}`, { method: 'DELETE' });
  emit({ type: 'removed', id });
}

/** like | happy | neutral | sad. `on` false removes it. Choosing a mood replaces your old one. */
export const setReaction = async (id, kind, on) =>
  changed((await api(`/posts/${id}/reactions/${kind}`, { method: on ? 'PUT' : 'DELETE' })).post);

export const vote = async (id, optionId) => changed((await api(`/posts/${id}/vote`, { method: 'PUT', body: { optionId } })).post);
export const acknowledge = async (id) => changed((await api(`/posts/${id}/ack`, { method: 'POST' })).post);

/** Adds a comment, then reloads the post so counts and the thread come from the server. */
export async function addComment(postId, { body, parentId = null }, key = newKey()) {
  await api(`/posts/${postId}/comments`, { method: 'POST', body: { body, parentId }, idempotencyKey: key });
  const fresh = await fetchPost(postId);
  if (fresh) changed(fresh);
  return fresh;
}

export async function deleteComment(postId, commentId) {
  await api(`/comments/${commentId}`, { method: 'DELETE' });
  const fresh = await fetchPost(postId);
  if (fresh) changed(fresh);
  return fresh;
}

// ---- Helpers ----------------------------------------------------------------------------------
export const errorText = (e) => e?.message || 'Something went wrong. Try again.';

/** A user-like object for <Avatar>: the directory entry if known, else one built from the post. */
export function authorUser(author, lookup) {
  const known = author && !author.deleted ? lookup?.(author.id) : null;
  if (known) return known;
  const name = author?.name || 'Member';
  const hue = [...String(author?.id ?? name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return { id: author?.id, name, hue };
}

/**
 * A paged server feed. `keep(post)` decides whether a changed post still belongs in this list
 * (e.g. a published draft leaves My Drafts). Client-side filters (Following, Pinned, tags) are the caller's.
 */
export function useServerFeed({ view = 'all', community, keep, enabled = true, filters } = {}) {
  const [posts, setPosts] = useState([]);
  const [nextBefore, setNextBefore] = useState(null);
  const [status, setStatus] = useState(enabled ? 'loading' : 'idle'); // loading | ready | error | idle
  const [error, setError] = useState('');
  const [more, setMore] = useState(false);
  const keepRef = useRef(keep);
  keepRef.current = keep;
  const fkey = JSON.stringify(filters || {});
  const gen = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const g = ++gen.current;
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    try {
      const r = await fetchFeed({ view, community, filters });
      if (g !== gen.current) return;
      setPosts(r.posts); setNextBefore(r.nextBefore); setStatus('ready'); setError('');
    } catch (e) {
      if (g !== gen.current) return;
      setError(errorText(e)); setStatus('error');
    }
  }, [view, community, enabled, fkey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload(); }, [reload]);

  const loadMore = useCallback(async () => {
    if (!nextBefore || more) return;
    setMore(true);
    try {
      const r = await fetchFeed({ view, community, before: nextBefore, filters });
      setPosts((list) => [...list, ...r.posts.filter((p) => !list.some((x) => x.id === p.id))]);
      setNextBefore(r.nextBefore); setError('');
    } catch (e) {
      setError(errorText(e));
    } finally { setMore(false); }
  }, [view, community, nextBefore, more]);

  useEffect(() => onFeedEvent((e) => {
    if (e.type === 'created') { reload(); return; }
    if (e.type === 'removed') { setPosts((list) => list.filter((p) => p.id !== e.id)); return; }
    if (e.type === 'post') {
      setPosts((list) => list.flatMap((p) => {
        if (p.id !== e.post.id) return [p];
        const next = { ...p, ...e.post };
        return keepRef.current && !keepRef.current(next) ? [] : [next];
      }));
    }
  }), [reload]);

  return { posts, nextBefore, status, error, loadMore, loadingMore: more, reload };
}

/** Keeps a single post (detail page, bookmarks) in step with changes made elsewhere. */
export function useLivePost(initial) {
  const [post, setPost] = useState(initial);
  useEffect(() => setPost(initial), [initial]);
  useEffect(() => onFeedEvent((e) => {
    if (e.type === 'post') setPost((p) => (p && p.id === e.post.id ? { ...p, ...e.post } : p));
    if (e.type === 'removed') setPost((p) => (p && p.id === e.id ? null : p));
  }), []);
  return post;
}
