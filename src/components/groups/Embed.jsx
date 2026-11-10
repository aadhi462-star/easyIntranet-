import { lazy, Suspense } from 'react';

// Other builders' modules, resolved at build time. Missing files simply aren't in the map.
const files = import.meta.glob(['../feed/FeedList.jsx', '../events/EventList.jsx', '../events/TownHallList.jsx',
  '../collab/ForumList.jsx', '../collab/IdeaList.jsx', '../collab/TaskBoard.jsx', '../collab/FileList.jsx',
  '../collab/ManualList.jsx', '../collab/WebTabList.jsx']);

const cache = {};
const resolve = (path) => (files[path] ? (cache[path] ??= lazy(files[path])) : null);

export const APP_COMPONENTS = {
  feed: '../feed/FeedList.jsx',
  events: '../events/EventList.jsx',
  townhalls: '../events/TownHallList.jsx',
  forums: '../collab/ForumList.jsx',
  ideas: '../collab/IdeaList.jsx',
  tasks: '../collab/TaskBoard.jsx',
  files: '../collab/FileList.jsx',
  manuals: '../collab/ManualList.jsx',
  webtabs: '../collab/WebTabList.jsx',
};

export default function Embed({ app, group }) {
  const C = resolve(APP_COMPONENTS[app]);
  if (!C) return <div className="glass p-8 text-center text-sm text-slate-400">This app’s module is still loading into CommunityOne.</div>;
  const props = app === 'feed' ? { scope: { type: 'group', id: group.id }, groupId: group.id, readOnly: group.announceOnly } : { groupId: group.id };
  return <Suspense fallback={<div className="glass h-40 animate-pulse" />}><C {...props} /></Suspense>;
}
