// Administration → Templates (v2 workstream F, decision F11; board V2FTemplateAdmin). The list
// of community templates with their usage, and one template's page (?template=key) to edit its
// draft, publish the next version, deactivate or activate it and read older versions. Changing
// a template never changes a community already made from it (F6). The server checks every
// permission; this tab is shown to platform staff who manage communities.
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import TemplateList from './templates/TemplateList.jsx';
import TemplatePage from './templates/TemplatePage.jsx';

export default function Templates() {
  const [params, setParams] = useSearchParams();
  const open = params.get('template');
  const [s, setS] = useState({ state: 'loading' });

  const load = useCallback(() => {
    setS((x) => (x.templates ? x : { state: 'loading' }));
    api('/admin/templates')
      .then((d) => setS({ state: 'ready', templates: d.templates }))
      .catch((e) => setS({ state: 'error', message: errorText(e) }));
  }, []);
  useEffect(() => { load(); }, [load]);

  // A template's page or the list reports a change: the list's row follows without a reload.
  const updated = useCallback((t) => {
    const { current, draft, ...row } = t;
    setS((x) => (x.templates ? { ...x, templates: x.templates.some((r) => r.key === row.key) ? x.templates.map((r) => (r.key === row.key ? row : r)) : [...x.templates, row] } : x));
  }, []);

  const go = (key) => {
    const next = new URLSearchParams(params);
    if (key) next.set('template', key); else next.delete('template');
    setParams(next);
    window.scrollTo?.(0, 0);
  };

  if (open) return <TemplatePage key={open} templateKey={open} onBack={() => go(null)} onUpdated={updated} />;
  return <TemplateList s={s} onRetry={load} onOpen={go} onUpdated={updated} />;
}
