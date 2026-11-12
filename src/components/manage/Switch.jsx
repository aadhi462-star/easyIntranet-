// An on/off switch row on the v2 tokens (board V2EModules, "Sections settings"): the label and
// its hint on the left, the switch on the right, the whole row a full-width target on phones.
export default function Switch({ id, label, hint, checked, onChange, disabled = false }) {
  return (
    <div className="flex min-h-14 items-start gap-4 py-3">
      <span className="min-w-0 flex-1">
        <span id={`${id}-l`} className="block text-[15px] font-semibold text-[var(--az-text)]">{label}</span>
        {hint && <span id={`${id}-h`} className="t-small block">{hint}</span>}
      </span>
      <button type="button" role="switch" id={id} aria-checked={!!checked} aria-labelledby={`${id}-l`} aria-describedby={hint ? `${id}-h` : undefined}
        disabled={disabled} onClick={() => onChange(!checked)}
        style={checked && !disabled ? { backgroundImage: 'var(--az-fill)' } : undefined}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${checked && !disabled ? 'border-transparent' : 'border-[var(--az-control)] bg-[var(--az-sunken)]'}`}>
        <span aria-hidden="true" className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-[var(--az-surface)] shadow transition-[left] ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}
