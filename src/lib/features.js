// Which modules the platform has switched on (feature flags, v2 brief decision P4). Read once
// from GET /api/features and shared; a Platform Admin's change refreshes it. Until it loads,
// parked modules count as off and Learning as on (its usual state), so nothing flickers in.
import { useEffect, useState } from 'react';
import { api } from './api.js';

const DEFAULTS = { learning: true };
let current = null;
let loading = null;
const listeners = new Set();

export function loadFeatures() {
  loading ??= api('/features').then((d) => { current = d.features; listeners.forEach((fn) => fn(current)); return current; })
    .catch(() => { loading = null; return current; });
  return loading;
}

/** Call after changing a switch, so open pages pick it up. */
export function refreshFeatures() { loading = null; return loadFeatures(); }

export const isOn = (features, key) => (features ?? DEFAULTS)[key] ?? DEFAULTS[key] ?? false;

export function useFeatures() {
  const [f, setF] = useState(current);
  useEffect(() => { listeners.add(setF); loadFeatures(); return () => listeners.delete(setF); }, []);
  return f;
}
