import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { useTheme } from '../lib/theme.js';
import { Glyph, Icon } from './icons.jsx';

// The CommunityOne logo (user-supplied artwork, redrawn as SVG): a "C" holding three people,
// and the wordmark "Community" + "One". The C's ends point right, open like a welcome. v2 brief:
// the C is the solid brand accent (#168C70) instead of the original lime gradient.
const C_ARC = 'M47.6 16.4A22 22 0 1 0 47.6 47.6';

/** The mark on its own. People are drawn in the text colour, so the mark works on both themes. */
export function LogoMark({ size = 40 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 64 64" className="shrink-0" style={{ color: 'var(--az-text)' }}>
      <path d={C_ARC} fill="none" stroke="#168c70" strokeWidth="13" strokeLinecap="round" />
      <g fill="currentColor" transform="translate(32 34) scale(.9) translate(-32 -34)">
        <g opacity=".62"><circle cx="22.6" cy="29.6" r="3.4" /><path d="M16.8 41a5.8 5.6 0 0 1 11.6 0z" /><circle cx="41.4" cy="29.6" r="3.4" /><path d="M35.6 41a5.8 5.6 0 0 1 11.6 0z" /></g>
        <circle cx="32" cy="27" r="4.6" /><path d="M23.6 41.4a8.4 8 0 0 1 16.8 0z" />
      </g>
    </svg>
  );
}

/** Mark and wordmark. `tagline` adds “One Platform. Every Community.” under the name. */
export function Logo({ size = 40, withText = true, tagline = false }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      {withText && (
        <span className="flex flex-col leading-none">
          <span className="font-bold tracking-tight text-[var(--az-text)]" style={{ fontSize: Math.max(16, size * 0.52) }}>Community<span className="text-[var(--az-link)]">One</span></span>
          {tagline && <span className="text-2 mt-1 text-[13px] font-medium">One Platform. Every Community.</span>}
        </span>
      )}
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
  return <Link to={`/people/${id}`} className={`font-semibold text-[var(--az-text)] hit hover:underline ${className}`}>{u?.name ?? 'Unknown'}</Link>;
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
    // First visible, enabled field (hidden file inputs and collapsed sections are skipped).
    const usable = (el) => el.offsetParent !== null && !el.disabled && el.type !== 'hidden' && !(el.type === 'file' && el.hidden);
    const inBody = (sel) => [...(bodyRef.current?.querySelectorAll(sel) ?? [])].find(usable);
    (inBody('input,textarea,select') ?? inBody(FOCUSABLE) ?? focusables().find(usable) ?? focusables()[0])?.focus();
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
  // Drawn at the top of the page (a portal), so no layer it's opened from can hide it under the
  // sidebar or the top bar.
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(23,33,31,.4)] p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={`panel max-h-[90vh] w-full overflow-y-auto p-6 shadow-[var(--az-shadow)] scroll-thin ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="t-h3">{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>
        <div ref={bodyRef}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[var(--az-text-2)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--az-text-3)]">{hint}</span>}
    </label>
  );
}

export function Empty({ icon = 'sparkle', title, children }) {
  return (
    <div className="glass p-10 text-center">
      <Glyph value={icon} size={56} className="mx-auto" />
      <p className="mt-3 font-semibold">{title}</p>
      {children && <p className="mt-1 text-sm text-[var(--az-text-2)]">{children}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="t-h1 text-[var(--az-text)]">{title}</h1>
        {subtitle && <p className="text-2 mt-1 text-[15px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="no-scrollbar mb-5 flex overflow-x-auto border-b border-[var(--az-hairline)]">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`min-h-11 shrink-0 border-b-2 px-3.5 text-sm transition ${value === t.id ? 'border-brand-400 font-semibold text-[var(--az-text)]' : 'text-2 border-transparent font-medium hover:text-[var(--az-text)]'}`}>
          {t.label}{t.count != null && <span className="text-3 ml-1.5 tabular-nums">{t.count}</span>}
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
