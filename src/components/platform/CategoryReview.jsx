// Administration → Category review (v2 decision D6). The server's dry run proposes one of the nine
// categories for every community from its old type; staff change any row that's wrong and apply
// the whole list once. Applying is logged and can be undone by an administrator
// (server/scripts/undo-data-migration.mjs d6-categories). Afterwards the list is read-only and
// Owners change their own category in community settings.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { dateTimeText } from '../../lib/platform.js';
import { toast } from '../../lib/toast.js';
import { CATEGORIES } from '../../../shared/categories.js';
import { Badge, Button, Skeleton } from '../ui/Controls.jsx';
import { confirmAction } from '../ui/Confirm.jsx';

const HEAD = ['Community', 'Type today', 'Proposed', 'Confirmed'];
// Below 768 px each row stacks, and every value carries its column's name.
const CELL = 'flex items-baseline justify-between gap-3 px-4 py-1.5 md:table-cell md:py-3';
const Label = ({ children }) => <span aria-hidden="true" className="t-label md:hidden">{children}</span>;

export default function CategoryReview() {
  const [s, setS] = useState({ state: 'loading' });
  const [chosen, setChosen] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setS({ state: 'loading' }); setError('');
    api('/admin/category-review')
      .then((d) => { setS({ state: 'ready', d }); setChosen(Object.fromEntries(d.rows.map((r) => [r.id, r.proposed]))); })
      .catch((e) => setS({ state: 'error', message: errorText(e) }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = s.d?.rows ?? [];
  const applied = s.d?.applied ?? null;
  const changed = useMemo(() => rows.filter((r) => chosen[r.id] && chosen[r.id] !== r.proposed).length, [rows, chosen]);

  const apply = async () => {
    const ok = await confirmAction({ title: `Apply categories to ${rows.length} communities?`, body: 'This is logged and can be undone by an administrator.', confirm: 'Apply' });
    if (!ok) return;
    setBusy(true); setError('');
    try {
      const d = await api('/admin/category-review', { method: 'POST', body: { rows: rows.map((r) => ({ id: r.id, category: chosen[r.id] })) } });
      setS({ state: 'ready', d });
      toast(`Categories applied to ${d.rows.length} communities`);
    } catch (e) {
      if (e?.code === 'ALREADY_APPLIED') { toast(errorText(e), 'error'); load(); } else setError(errorText(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-2 text-sm">Every community needs one of the nine categories: check the proposal for each, change any that are wrong, then apply the whole list once.</p>

      {s.state === 'loading' ? (
        <div className="panel p-5"><Skeleton lines={5} label="Loading the category review" /></div>
      ) : s.state === 'error' ? (
        <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3">
          <span><strong>The review didn’t load.</strong> {s.message}</span>
          <Button size="sm" onClick={load}>Try again</Button>
        </div>
      ) : !rows.length ? (
        <p className="notice notice-info">There are no communities to review yet.</p>
      ) : (
        <>
          {applied ? (
            <p role="status" className="notice notice-ok">
              Applied {dateTimeText(applied.at)}{applied.by ? ` by ${applied.by}` : ''} to {rows.length} communities. This list is the confirmed record; Owners can change their own category in community settings.
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="t-small" aria-live="polite">{changed ? `${changed} of ${rows.length} changed by staff` : `${rows.length} communities · none changed by staff yet`}</p>
              <Button variant="primary" busy={busy} onClick={apply}>Apply categories…</Button>
            </div>
          )}
          {error && (
            <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3">
              <span><strong>Nothing was applied.</strong> {error}</span>
              <Button size="sm" onClick={load}>Reload the review</Button>
            </div>
          )}

          <div className="panel overflow-hidden">
            <table className="block w-full border-collapse text-sm md:table" aria-label="Category review">
              <thead className="sr-only md:not-sr-only md:table-header-group">
                <tr className="bg-[var(--az-band)] text-left">
                  {HEAD.map((h) => <th key={h} scope="col" className="t-label whitespace-nowrap border-b border-[var(--az-hairline)] px-4 py-3">{h}</th>)}
                </tr>
              </thead>
              <tbody className="block md:table-row-group">
                {rows.map((r) => {
                  const value = applied ? r.confirmed : chosen[r.id];
                  const byStaff = value && value !== r.proposed;
                  return (
                    <tr key={r.id} className="block border-b border-[var(--az-divider)] py-2 last:border-0 md:table-row md:py-0">
                      <th scope="row" className={`${CELL} text-left font-semibold text-[var(--az-text)]`}><Label>{HEAD[0]}</Label><span>{r.name}</span></th>
                      <td className={`${CELL} text-2`}><Label>{HEAD[1]}</Label><span>{r.current || <span className="text-3">None</span>}</span></td>
                      <td className={`${CELL} text-2`}><Label>{HEAD[2]}</Label><span>{r.proposed}</span></td>
                      <td className={CELL}>
                        <Label>{HEAD[3]}</Label>
                        {applied ? (
                          <span className="flex flex-wrap items-center justify-end gap-2 md:justify-start">
                            <span className="text-[var(--az-text)]">{value}</span>{byStaff && <Badge tone="info">Changed by staff</Badge>}
                          </span>
                        ) : (
                          <span className="flex min-w-0 flex-wrap items-center justify-end gap-2 md:justify-start">
                            <select className="input min-w-0 max-w-56 py-1.5" aria-label={`Confirmed category for ${r.name}`} value={value}
                              onChange={(e) => setChosen((c) => ({ ...c, [r.id]: e.target.value }))} disabled={busy}>
                              {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                            {byStaff && <Badge tone="info">Changed</Badge>}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
