import { useEffect, useState } from 'react';

// Per-viewer light/dark preference. Light is the default (v2 brief: light-first); 'system'
// follows the OS setting; dark is an option.
const KEY = 'alumnizone:theme';
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;

export function readPref() {
  try { return localStorage.getItem(KEY) || 'light'; } catch { return 'light'; }
}

export const resolve = (pref) => (pref === 'system' ? (media?.matches ? 'light' : 'dark') : pref);

export function applyTheme(pref = readPref()) {
  const mode = resolve(pref);
  document.documentElement.dataset.theme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'light' ? '#f7f8f6' : '#0e1311');
  return mode;
}

/** [pref, mode, setPref]: pref is 'light' | 'dark' | 'system', mode is what's applied. */
export function useTheme() {
  const [pref, setPrefState] = useState(readPref);
  const [mode, setMode] = useState(() => resolve(pref));

  useEffect(() => {
    setMode(applyTheme(pref));
    if (pref !== 'system' || !media) return undefined;
    const onChange = () => setMode(applyTheme('system'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [pref]);

  // Keep every mounted toggle in sync (e.g. auth header and app header).
  useEffect(() => {
    const onSync = (e) => setPrefState(e.detail);
    window.addEventListener('az-theme', onSync);
    return () => window.removeEventListener('az-theme', onSync);
  }, []);

  const setPref = (next) => {
    try { localStorage.setItem(KEY, next); } catch { /* private mode: still apply for this visit */ }
    setPrefState(next);
    window.dispatchEvent(new CustomEvent('az-theme', { detail: next }));
  };
  return [pref, mode, setPref];
}
