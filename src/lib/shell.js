// What the app shell needs to know about the signed-in person (v2 workstream D): whether they may
// start a community, and where they may post or create events, so Create only offers what works.
// Every action is checked again by the server.
import { useEffect, useState } from 'react';
import { api } from './api.js';

/** Whether creating a community is allowed for this person (communities.whoCanCreate, COM-07). */
export function useCanCreateCommunity(meId) {
  const [can, setCan] = useState(false);
  useEffect(() => {
    let live = true;
    api('/templates').then(() => live && setCan(true), () => live && setCan(false));
    return () => { live = false; };
  }, [meId]);
  return can;
}

/**
 * Community ids where this person may start a discussion or create an event right now, from
 * GET /dashboard (canPostIn, canCreateEventsIn). Refreshes when memberships change.
 */
export function useComposeTargets(meId) {
  const [t, setT] = useState({ post: [], event: [] });
  useEffect(() => {
    let live = true;
    const load = () => api('/dashboard').then((d) => live && setT({ post: d.canPostIn ?? [], event: d.canCreateEventsIn ?? [] }), () => {});
    load();
    window.addEventListener('c1-community-changed', load);
    return () => { live = false; window.removeEventListener('c1-community-changed', load); };
  }, [meId]);
  return t;
}

const MANAGING = ['owner', 'admin', 'moderator', 'instructor', 'teaching_assistant'];
/** Sidebar order (D1): the communities you manage first, then A to Z. */
export const sidebarOrder = (list) => [...list].sort((a, b) =>
  (MANAGING.includes(b.membership?.role) - MANAGING.includes(a.membership?.role)) || a.name.localeCompare(b.name));
