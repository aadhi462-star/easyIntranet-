import { Glyph } from '../icons.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { uid } from '../../lib/store.jsx';

// ---------- Document ----------

const TOOLS = [
  ['bold', 'B', 'Bold'], ['italic', 'I', 'Italic'], ['underline', 'U', 'Underline'],
  ['formatBlock:h2', 'H2', 'Heading'], ['formatBlock:p', '¶', 'Paragraph'],
  ['insertUnorderedList', '•', 'Bulleted list'], ['insertOrderedList', '1.', 'Numbered list'], ['formatBlock:blockquote', '❝', 'Quote'],
];

/** Strip scripts, event handlers and javascript: URLs from editor HTML. */
export function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((n) => [...n.attributes].forEach((a) => {
    if (a.name.startsWith('on') || (/^(href|src)$/.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name);
  }));
  return doc.body.firstChild.innerHTML;
}

export function DocEditor({ value, onChange, readOnly }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = sanitize(value || ''); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const run = (cmd) => {
    const [c, arg] = cmd.split(':');
    document.execCommand(c, false, arg ? `<${arg}>` : undefined);
    ref.current.focus();
    onChange(sanitize(ref.current.innerHTML));
  };
  const link = () => { const url = prompt('Link URL'); if (url && /^https?:\/\//.test(url)) { document.execCommand('createLink', false, url); onChange(sanitize(ref.current.innerHTML)); } };
  return (
    <div className="glass overflow-hidden">
      {!readOnly && (
        <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1 border-b border-white/5 p-2">
          {TOOLS.map(([cmd, label, name]) => (
            <button key={cmd} type="button" className="h-10 min-w-10 rounded-lg px-2 text-sm font-semibold hover:bg-white/10" aria-label={name} title={name}
              onMouseDown={(e) => { e.preventDefault(); run(cmd); }}>{label}</button>
          ))}
          <button type="button" className="h-10 min-w-10 rounded-lg px-2 text-sm hover:bg-white/10" aria-label="Insert link" onMouseDown={(e) => { e.preventDefault(); link(); }}><Glyph value="🔗" tile={false} size={16} /></button>
        </div>
      )}
      <div ref={ref} contentEditable={!readOnly} suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Document"
        onInput={() => onChange(sanitize(ref.current.innerHTML))}
        className="doc-body min-h-[60vh] space-y-3 bg-white/[0.02] p-6 leading-relaxed outline-none sm:p-10 [&_blockquote]:border-l-4 [&_blockquote]:border-brand-500 [&_blockquote]:pl-4 [&_a]:text-brand-400 [&_a]:underline [&_h2]:text-xl [&_h2]:font-bold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6" />
    </div>
  );
}

// ---------- Spreadsheet ----------

const COLS = 'ABCDEFGHIJ'.split('');
const ROWS = 20;
const refRe = /\b([A-J])([1-9]\d?)\b/g;

function rangeCells(a, b) {
  const [, c1, r1] = a.match(/([A-J])(\d+)/);
  const [, c2, r2] = b.match(/([A-J])(\d+)/);
  const out = [];
  for (let c = Math.min(COLS.indexOf(c1), COLS.indexOf(c2)); c <= Math.max(COLS.indexOf(c1), COLS.indexOf(c2)); c++)
    for (let r = Math.min(+r1, +r2); r <= Math.max(+r1, +r2); r++) out.push(`${COLS[c]}${r}`);
  return out;
}

/** Evaluate a cell: numbers, text, or =formulas with SUM/AVERAGE/MIN/MAX/COUNT and + - * /. */
export function evaluate(cells, key, seen = new Set()) {
  const raw = cells[key] ?? '';
  if (!String(raw).startsWith('=')) return raw;
  if (seen.has(key)) return '#CYCLE';
  const next = new Set(seen).add(key);
  const num = (k) => { const v = parseFloat(evaluate(cells, k, next)); return Number.isFinite(v) ? v : 0; };
  try {
    let expr = String(raw).slice(1).toUpperCase();
    expr = expr.replace(/(SUM|AVERAGE|AVG|MIN|MAX|COUNT)\(\s*([A-J]\d+)\s*:\s*([A-J]\d+)\s*\)/g, (_, fn, a, b) => {
      const vals = rangeCells(a, b).map((k) => [k, evaluate(cells, k, next)]).filter(([, v]) => v !== '' && Number.isFinite(parseFloat(v))).map(([k]) => num(k));
      if (fn === 'SUM') return vals.reduce((x, y) => x + y, 0);
      if (fn === 'COUNT') return vals.length;
      if (!vals.length) return 0;
      if (fn === 'MIN') return Math.min(...vals);
      if (fn === 'MAX') return Math.max(...vals);
      return vals.reduce((x, y) => x + y, 0) / vals.length;
    });
    expr = expr.replace(refRe, (_, c, r) => `(${num(`${c}${r}`)})`);
    if (!/^[\d+\-*/().\s]*$/.test(expr)) return '#ERROR';
    const v = Function(`"use strict";return (${expr || 0})`)();
    return Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : '#DIV/0';
  } catch { return '#ERROR'; }
}

export function sheetToCsv(cells) {
  let maxR = 0; let maxC = 0;
  Object.keys(cells).forEach((k) => { const m = k.match(/([A-J])(\d+)/); if (m && cells[k] !== '') { maxR = Math.max(maxR, +m[2]); maxC = Math.max(maxC, COLS.indexOf(m[1])); } });
  const rows = [];
  for (let r = 1; r <= maxR; r++) rows.push(COLS.slice(0, maxC + 1).map((c) => `"${String(evaluate(cells, `${c}${r}`)).replace(/"/g, '""')}"`).join(','));
  return rows.join('\n');
}

export function SheetEditor({ value, onChange, readOnly }) {
  const cells = value?.cells ?? {};
  const [sel, setSel] = useState('A1');
  const [editing, setEditing] = useState(null);
  const put = (k, v) => onChange({ ...value, cells: { ...cells, [k]: v } });
  const moveSel = (dc, dr) => {
    const [, c, r] = sel.match(/([A-J])(\d+)/);
    const nc = COLS[Math.min(COLS.length - 1, Math.max(0, COLS.indexOf(c) + dc))];
    const k = `${nc}${Math.min(ROWS, Math.max(1, +r + dr))}`;
    setSel(k);
    requestAnimationFrame(() => document.querySelector(`[data-cell="${k}"]`)?.focus());
  };
  return (
    <div className="glass overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/5 p-2 text-sm">
        <span className="w-12 rounded bg-white/5 px-2 py-1.5 text-center font-mono text-xs">{sel}</span>
        <input className="input !py-1.5 font-mono" value={cells[sel] ?? ''} readOnly={readOnly} onChange={(e) => put(sel, e.target.value)} aria-label={`Formula for ${sel}`}
          placeholder="Value or =SUM(A1:A3)" />
      </div>
      <div className="overflow-auto scroll-thin">
        <table className="border-collapse font-mono text-xs" role="grid" aria-label="Spreadsheet">
          <thead><tr><th className="sticky left-0 w-10 bg-ink-850" />{COLS.map((c) => <th key={c} className="min-w-24 bg-ink-850 p-1.5 text-slate-400">{c}</th>)}</tr></thead>
          <tbody>
            {Array.from({ length: ROWS }, (_, i) => i + 1).map((r) => (
              <tr key={r}>
                <th className="sticky left-0 bg-ink-850 p-1.5 text-slate-400">{r}</th>
                {COLS.map((c) => {
                  const k = `${c}${r}`;
                  const v = evaluate(cells, k);
                  return (
                    <td key={k} role="gridcell" aria-selected={sel === k} tabIndex={sel === k ? 0 : -1}
                      onClick={() => setSel(k)} onDoubleClick={() => !readOnly && setEditing(k)}
                      onKeyDown={(e) => {
                        if (editing) return;
                        const map = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
                        if (map[e.key]) { e.preventDefault(); moveSel(...map[e.key]); }
                        else if (e.key === 'Enter' && !readOnly) setEditing(k);
                        else if ((e.key === 'Delete' || e.key === 'Backspace') && !readOnly) put(k, '');
                      }}
                      data-cell={k}
                      className={`h-8 border border-white/5 px-1.5 ${sel === k ? 'outline outline-2 outline-brand-500' : ''} ${typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(v) ? 'text-right' : ''}`}>
                      {editing === k ? (
                        <input autoFocus className="w-full bg-transparent outline-none" defaultValue={cells[k] ?? ''} aria-label={`Edit ${k}`}
                          onBlur={(e) => { put(k, e.target.value); setEditing(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { put(k, e.target.value); setEditing(null); moveSel(0, 1); } if (e.key === 'Escape') setEditing(null); }} />
                      ) : String(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-white/5 p-2 text-[11px] text-slate-500">Double-click or press Enter to edit. Formulas: =SUM, =AVERAGE, =MIN, =MAX, =COUNT over ranges like B2:B4, and arithmetic like =B2*2+C3.</p>
    </div>
  );
}

// ---------- Presentation ----------

export function SlidesEditor({ value, onChange, readOnly }) {
  const slides = value?.slides?.length ? value.slides : [{ id: 'sl0', title: 'Title', body: '' }];
  const [cur, setCur] = useState(0);
  const [present, setPresent] = useState(false);
  const s = slides[Math.min(cur, slides.length - 1)];
  const setSlides = (next) => onChange({ ...value, slides: next });
  const patch = (p) => setSlides(slides.map((x, i) => (i === cur ? { ...x, ...p } : x)));

  return (
    <div className="grid gap-4 md:grid-cols-[180px_1fr]">
      <ol className="flex gap-2 overflow-x-auto md:flex-col" aria-label="Slides">
        {slides.map((x, i) => (
          <li key={x.id}>
            <button onClick={() => setCur(i)} aria-current={i === cur}
              className={`brand-gradient flex aspect-video w-36 flex-col justify-center rounded-lg p-2 text-left text-[10px] md:w-full ${i === cur ? 'ring-2 ring-white' : 'opacity-70'}`}>
              <span className="font-bold">{i + 1}. {x.title}</span>
            </button>
          </li>
        ))}
        {!readOnly && <li><button className="btn btn-ghost w-36 md:w-full" onClick={() => { setSlides([...slides, { id: uid('sl'), title: 'New slide', body: '' }]); setCur(slides.length); }}>＋ Slide</button></li>}
      </ol>
      <div>
        <div className="mb-2 flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => setPresent(true)}>▶ Present</button>
          {!readOnly && <>
            <button className="btn btn-ghost" disabled={!cur} onClick={() => { const a = [...slides]; [a[cur - 1], a[cur]] = [a[cur], a[cur - 1]]; setSlides(a); setCur(cur - 1); }}>↑ Move up</button>
            <button className="btn btn-ghost text-rose-300" disabled={slides.length < 2} onClick={() => { setSlides(slides.filter((_, i) => i !== cur)); setCur(Math.max(0, cur - 1)); }}>Delete slide</button>
          </>}
        </div>
        <div className="brand-gradient flex aspect-video flex-col justify-center gap-4 rounded-2xl p-6 sm:p-12">
          <input className="w-full bg-transparent text-2xl font-extrabold outline-none placeholder:text-white/50 sm:text-4xl" value={s.title} readOnly={readOnly}
            onChange={(e) => patch({ title: e.target.value })} aria-label="Slide title" placeholder="Slide title" />
          <textarea className="min-h-24 w-full resize-none bg-transparent text-base text-white/90 outline-none placeholder:text-white/50 sm:text-xl" value={s.body} readOnly={readOnly}
            onChange={(e) => patch({ body: e.target.value })} aria-label="Slide body" placeholder="Slide content" />
        </div>
      </div>
      {present && <Presenter slides={slides} start={cur} onClose={() => setPresent(false)} />}
    </div>
  );
}

function Presenter({ slides, start, onClose }) {
  const [i, setI] = useState(start);
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.requestFullscreen?.().catch(() => {});
    const key = (e) => {
      if (['ArrowRight', ' ', 'PageDown'].includes(e.key)) setI((x) => Math.min(slides.length - 1, x + 1));
      if (['ArrowLeft', 'PageUp'].includes(e.key)) setI((x) => Math.max(0, x - 1));
      if (e.key === 'Escape') onClose();
    };
    const fs = () => !document.fullscreenElement && onClose();
    window.addEventListener('keydown', key);
    document.addEventListener('fullscreenchange', fs);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('fullscreenchange', fs); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const s = slides[i];
  return (
    <div ref={ref} className="brand-gradient fixed inset-0 z-[60] flex flex-col justify-center p-10 sm:p-24" onClick={() => setI(Math.min(slides.length - 1, i + 1))}>
      <h2 className="text-4xl font-extrabold sm:text-6xl">{s.title}</h2>
      <p className="mt-8 whitespace-pre-wrap text-xl text-white/90 sm:text-3xl">{s.body}</p>
      <div className="absolute bottom-6 right-8 flex items-center gap-3 text-sm text-white/80">
        {i + 1} / {slides.length}
        <button className="btn bg-black/30" onClick={(e) => { e.stopPropagation(); onClose(); }}>Exit (Esc)</button>
      </div>
    </div>
  );
}

export function useObjectUrl(blob) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  return url;
}
