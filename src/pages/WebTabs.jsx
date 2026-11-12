import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { PageHeader } from '../components/ui.jsx';
import WebTabList, { WebTabForm, WebTabFrame, visibleTab } from '../components/collab/WebTabList.jsx';
import { Menu, ScopeBadge } from '../components/collab/common.jsx';
import { confirmAction } from '../components/ui/Confirm.jsx';

export default function WebTabs() {
  const { id } = useParams();
  const { state, dispatch, me } = useStore();
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);
  if (!id) {
    return (
      <>
        <PageHeader title="Web Tabs" subtitle="Websites the community uses often, embedded at network, group or private level." />
        <WebTabList />
      </>
    );
  }
  const tab = (state.webTabs ?? []).find((t) => t.id === id);
  if (!tab || !visibleTab(state, me, tab)) return <div className="glass p-8">Web tab not found. <Link to="/webtabs" className="text-brand-400 underline">Back to web tabs</Link></div>;
  const mine = tab.ownerId === me.id || me.admin;
  return (
    <>
      <Link to="/webtabs" className="text-sm text-brand-400 hover:underline">← Web tabs</Link>
      <PageHeader title={tab.name} subtitle={<ScopeBadge scope={tab.scope} groupId={tab.groupId} />}
        actions={mine && <Menu label="Web tab actions" items={[
          { label: 'Edit', onClick: () => setEdit(true) },
          { label: 'Delete', danger: true, onClick: async () => { if (await confirmAction('Delete this web tab?')) { dispatch({ type: 'remove', col: 'webTabs', id: tab.id }); nav('/webtabs'); } } },
        ]} />} />
      <WebTabFrame tab={tab} />
      {edit && <WebTabForm tab={tab} onClose={() => setEdit(false)} />}
    </>
  );
}
