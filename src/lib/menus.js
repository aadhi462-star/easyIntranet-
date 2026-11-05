import { useEffect, useState } from 'react';

// Per-viewer menu layout: hide the main sidebar and/or the extended (second-column) menu.
// Mirrored onto <html data-main-menu data-ext-menu> so CSS can collapse grids marked with
// `.ext-grid` / `.ext-menu` (see index.css) without each page reading this state.
const KEY = 'alumnizone:menus';
const DEFAULTS = { mainHidden: false, extHidden: false };

function read() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return DEFAULTS; }
}

function apply(prefs) {
  const el = document.documentElement;
  el.dataset.mainMenu = prefs.mainHidden ? 'hidden' : 'shown';
  el.dataset.extMenu = prefs.extHidden ? 'hidden' : 'shown';
}

apply(read());

export function useMenus() {
  const [prefs, setPrefs] = useState(read);
  useEffect(() => { apply(prefs); }, [prefs]);
  useEffect(() => {
    const onSync = (e) => setPrefs(e.detail);
    window.addEventListener('az-menus', onSync);
    return () => window.removeEventListener('az-menus', onSync);
  }, []);
  const update = (patch) => {
    const next = { ...prefs, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* still applies for this visit */ }
    setPrefs(next);
    window.dispatchEvent(new CustomEvent('az-menus', { detail: next }));
  };
  return {
    ...prefs,
    toggleMain: () => update({ mainHidden: !prefs.mainHidden }),
    toggleExt: () => update({ extHidden: !prefs.extHidden }),
    setAll: (hidden) => update({ mainHidden: hidden, extHidden: hidden }),
  };
}
