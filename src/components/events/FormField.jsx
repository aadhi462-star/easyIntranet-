// A labelled form field on the v2 tokens, for the event and resource forms (the shared Field in
// ui.jsx still draws the old style). `error` shows under the control as .field-error.
export default function FormField({ label, hint, error, children, className = '' }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 block text-sm font-semibold text-[var(--az-text)]">{label}</span>
      {children}
      {hint && <span className="t-small mt-1 block">{hint}</span>}
      {error && <span role="alert" className="field-error block">{error}</span>}
    </label>
  );
}

/** A checkbox row with a 44 px target. */
export function CheckRow({ checked, onChange, children }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-[var(--az-text)]">
      <input type="checkbox" className="h-4 w-4 accent-[var(--az-focus)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}
