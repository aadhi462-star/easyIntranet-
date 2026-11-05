import { Glyph } from '../icons.jsx';
import { useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { MODULES } from '../../lib/modules.js';
import { Field } from '../ui.jsx';

export default function Branding() {
  const { state, dispatch } = useStore();
  const s = state.settings;
  const set = (patch) => dispatch({ type: 'set', key: 'settings', value: (cur) => ({ ...cur, ...patch }) });
  const [css, setCss] = useState(s.customCss || '');
  const order = s.navOrder?.length ? [...s.navOrder, ...MODULES.map((m) => m.id).filter((id) => !s.navOrder.includes(id))] : MODULES.map((m) => m.id);
  const hidden = s.hiddenModules || [];
  const move = (i, d) => { const n = [...order]; [n[i], n[i + d]] = [n[i + d], n[i]]; set({ navOrder: n }); };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="glass space-y-4 p-5">
        <h3 className="font-bold">Branding</h3>
        <Field label="Network name"><input className="input" value={s.networkName} onChange={(e) => set({ networkName: e.target.value })} /></Field>
        <Field label="Tagline"><input className="input" value={s.tagline} onChange={(e) => set({ tagline: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Logo text" hint="Up to 3 characters"><input className="input" maxLength={3} value={s.logoText ?? 'AZ'} onChange={(e) => set({ logoText: e.target.value })} /></Field>
          <Field label="Accent colour">
            <div className="flex gap-2"><input type="color" className="h-11 w-14 cursor-pointer rounded-lg bg-transparent" value={s.accent} onChange={(e) => set({ accent: e.target.value })} aria-label="Accent colour picker" />
              <input className="input font-mono" aria-label="Accent colour hex code" value={s.accent} onChange={(e) => set({ accent: e.target.value })} /></div>
          </Field>
        </div>
        <button className="btn btn-ghost" onClick={() => setCss(`${css}\n.btn-primary { background-image: linear-gradient(90deg, ${s.accent}, ${s.accent}cc); }\n.bg-brand-500, .bg-brand-500\\/20 { background-color: ${s.accent}33; }`.trim())}>
          Insert CSS for accent colour
        </button>
        <Field label="Custom CSS" hint="Applied to the whole app when you click Apply.">
          <textarea className="input min-h-40 font-mono text-xs" value={css} onChange={(e) => setCss(e.target.value)} spellCheck={false} />
        </Field>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => set({ customCss: css })}>Apply CSS</button>
          <button className="btn btn-ghost" onClick={() => { setCss(''); set({ customCss: '' }); }}>Clear</button>
        </div>
        <div className="rounded-xl p-4" style={{ background: `linear-gradient(135deg, ${s.accent}, #a3e635)` }}>
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/20 font-extrabold">{s.logoText ?? 'AZ'}</span>
            <span><b>{s.networkName}</b><span className="block text-xs text-white/80">{s.tagline}</span></span></div>
        </div>
      </section>

      <section className="glass space-y-4 p-5">
        <h3 className="font-bold">Navigation</h3>
        <Field label="Landing page after sign-in">
          <select className="input" value={s.landing} onChange={(e) => set({ landing: e.target.value })}>
            {MODULES.filter((m) => !hidden.includes(m.id)).map((m) => <option key={m.id} value={m.path}>{s.moduleNames?.[m.id] || m.label}</option>)}
          </select>
        </Field>
        <ul className="divide-y divide-white/5">
          {order.map((id, i) => {
            const m = MODULES.find((x) => x.id === id);
            if (!m) return null;
            const isHidden = hidden.includes(id);
            return (
              <li key={id} className={`flex items-center gap-2 py-2 ${isHidden ? 'opacity-50' : ''}`}>
                <Glyph value={m.icon} size={26} />
                <input className="input !py-1.5" value={s.moduleNames?.[id] ?? ''} placeholder={m.label} aria-label={`Rename ${m.label}`}
                  onChange={(e) => set({ moduleNames: { ...s.moduleNames, [id]: e.target.value } })} />
                <button className="btn btn-ghost h-10 w-10 shrink-0 !p-0" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${m.label} up`}>↑</button>
                <button className="btn btn-ghost h-10 w-10 shrink-0 !p-0" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${m.label} down`}>↓</button>
                <button className="btn btn-ghost h-10 shrink-0 text-xs" disabled={id === 'admin'} onClick={() => set({ hiddenModules: isHidden ? hidden.filter((x) => x !== id) : [...hidden, id] })}
                  aria-label={`${isHidden ? 'Show' : 'Hide'} ${m.label}`}>{isHidden ? 'Show' : 'Hide'}</button>
              </li>
            );
          })}
        </ul>
        <button className="btn btn-ghost" onClick={() => set({ navOrder: [], moduleNames: {}, hiddenModules: ['orgchart'] })}>Reset navigation</button>
      </section>
    </div>
  );
}
