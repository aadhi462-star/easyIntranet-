import { useEffect, useState } from 'react';

// Visual effects level, per viewer: 'auto' | 'full' | 'lite'. Mirrored onto
// <html data-effects> so CSS can drop the costly backdrop blur (see index.css).
const KEY = 'alumnizone:effects';

function readPref() {
  try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; }
}

// Auto picks lite where blur is likely to stutter or isn't wanted.
function autoLite() {
  const mq = (q) => typeof matchMedia === 'function' && matchMedia(q).matches;
  return mq('(prefers-reduced-transparency: reduce)')
    || (navigator.deviceMemory && navigator.deviceMemory <= 4)
    || navigator.connection?.saveData === true;
}

export const resolveEffects = (pref) => (pref === 'auto' ? (autoLite() ? 'lite' : 'full') : pref);

export function applyEffects(pref = readPref()) {
  const mode = resolveEffects(pref);
  document.documentElement.dataset.effects = mode;
  return mode;
}

/** [pref, mode, setPref] */
export function useEffectsPref() {
  const [pref, setPrefState] = useState(readPref);
  const [mode, setMode] = useState(() => resolveEffects(pref));
  useEffect(() => { setMode(applyEffects(pref)); }, [pref]);
  const setPref = (next) => {
    try { localStorage.setItem(KEY, next); } catch { /* applies for this visit */ }
    setPrefState(next);
  };
  return [pref, mode, setPref];
}
