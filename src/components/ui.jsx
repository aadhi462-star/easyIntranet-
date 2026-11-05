import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { useTheme } from '../lib/theme.js';
import { Glyph, Icon } from './icons.jsx';

/** SVG filter referenced by the `.glass::before` CSS rule for the refraction wobble. */
// Kept as a no-op so existing <GlassFilters /> mounts keep working; the SVG distortion
// filter it used to define is no longer used (see .glass in index.css).
export function GlassFilters() {
  return null;
}

export function Logo({ size = 40, withText = true }) {
  return (
    <span className="inline-flex items-center gap-3">
      <span className="bg-accent-fill grid place-items-center rounded-xl font-display font-extrabold shadow-lg shadow-brand-500/20"
        style={{ width: size, height: size, fontSize: size * 0.42 }}>
        AZ
      </span>
      {withText && <span className="font-display text-lg font-semibold tracking-tight">Alumni<span className="text-brand-gradient">Zone</span></span>}
    </span>
  );
}

export function Avatar({ user, size = 40, ring = false }) {
  if (!user) return null;
  const initials = (user.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('');
  return (
    <span title={user.name}
      // Initials sit on a saturated gradient in both modes, so they stay literal white.
      className={`inline-grid shrink-0 place-items-center rounded-full font-semibold text-[#fff] ${ring ? 'ring-2 ring-ink-900' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.38,
        background: `linear-gradient(135deg, hsl(${user.hue} 70% 55%), hsl(${(user.hue + 40) % 360} 70% 42%))` }}>
      {initials}
    </span>
  );
}

export function AvatarStack({ ids, max = 4, size = 26 }) {
  const { user } = useStore();
  return (
    <span className="flex -space-x-2">
      {ids.slice(0, max).map((id) => <Avatar key={id} user={user(id)} size={size} ring />)}
      {ids.length > max && <span className="grid place-items-center rounded-full bg-ink-700 text-[10px] font-semibold ring-2 ring-ink-900" style={{ width: size, height: size }}>+{ids.length - max}</span>}
    </span>
  );
}

export function UserLink({ id, className = '' }) {
  const { user } = useStore();
  const u = user(id);
  return <Link to={`/people/${id}`} className={`font-semibold text-white hover:underline ${className}`}>{u?.name ?? 'Unknown'}</Link>;
}

// Open modals, innermost last, so Esc and the focus trap only act on the topmost one.
const modalStack = [];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  const bodyRef = useRef(null);
  // Parents usually pass an inline onClose; keep the latest in a ref so the mount effect
  // doesn't re-run (and steal focus) on every parent render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const token = {};
    modalStack.push(token);
    const previous = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusables = () => [...(ref.current?.querySelectorAll(FOCUSABLE) ?? [])].filter((el) => el.offsetParent !== null || el === document.activeElement);
    (bodyRef.current?.querySelector('input,textarea,select') ?? bodyRef.current?.querySelector(FOCUSABLE) ?? focusables()[0])?.focus();
    const onKey = (e) => {
      if (modalStack[modalStack.length - 1] !== token) return;
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current?.(); return; }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0];
      const last = list[list.length - 1];
      const inside = ref.current?.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = modalStack.indexOf(token);
      if (i >= 0) modalStack.splice(i, 1);
      if (!modalStack.length) document.body.style.overflow = prevOverflow;
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={`glass glass-strong max-h-[90vh] w-full overflow-y-auto p-6 scroll-thin ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn btn-ghost h-9 w-9 !p-0" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div ref={bodyRef}>{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Empty({ icon = '✨', title, children }) {
  return (
    <div className="glass p-10 text-center">
      <Glyph value={icon} size={56} className="mx-auto" />
      <p className="mt-3 font-semibold">{title}</p>
      {children && <p className="mt-1 text-sm text-slate-400">{children}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="glass mb-5 inline-flex flex-wrap gap-1 !rounded-xl p-1">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`min-h-9 rounded-lg px-3.5 text-sm font-semibold transition ${value === t.id ? 'bg-brand-500 text-white shadow' : 'text-slate-300 hover:bg-white/5'}`}>
          {t.label}{t.count != null && <span className="ml-1.5 opacity-70">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

const THEME_NEXT = { system: 'light', light: 'dark', dark: 'system' };
const THEME_ICON = { light: 'sun', dark: 'moon', system: 'monitor' };
const THEME_LABEL = { light: 'Light', dark: 'Dark', system: 'System' };

/** Cycles Light → Dark → System. The label names the current choice. */
export function ThemeToggle({ withLabel = false, className = '' }) {
  const [pref, , setPref] = useTheme();
  return (
    <button type="button" onClick={() => setPref(THEME_NEXT[pref])}
      className={`btn btn-ghost h-10 ${withLabel ? '' : 'w-10 !p-0'} ${className}`}
      aria-label={`Colour theme: ${THEME_LABEL[pref]}. Switch to ${THEME_LABEL[THEME_NEXT[pref]]}`}
      title={`Theme: ${THEME_LABEL[pref]}`}>
      <Icon name={THEME_ICON[pref]} />{withLabel && THEME_LABEL[pref]}
    </button>
  );
}
