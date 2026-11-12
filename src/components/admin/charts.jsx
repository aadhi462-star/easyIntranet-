// Small inline-SVG charts and file helpers shared by Admin and Custom Apps.

const PALETTE = ['#168c70', '#e879f9', '#22d3ee', '#fbbf24', '#34d399', '#f87171', '#a78bfa', '#168c70'];
export const colorAt = (i) => PALETTE[i % PALETTE.length];

export function LineChart({ points, height = 160, label }) {
  const w = 600;
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const xy = points.map((p, i) => [i * step, height - 20 - (p.value / max) * (height - 40)]);
  const path = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full" role="img" aria-label={label}>
      <defs><linearGradient id="lc-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#168c70" stopOpacity=".35" /><stop offset="1" stopColor="#168c70" stopOpacity="0" /></linearGradient></defs>
      {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={w} y1={20 + f * (height - 40)} y2={20 + f * (height - 40)} stroke="#fff" strokeOpacity=".05" />)}
      {xy.length > 1 && <path d={`${path} L${w},${height - 20} L0,${height - 20} Z`} fill="url(#lc-fill)" />}
      <path d={path} fill="none" stroke="#168c70" strokeWidth="2.5" strokeLinejoin="round" />
      {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" fill="#c7d2fe"><title>{`${points[i].label}: ${points[i].value}`}</title></circle>)}
      {points.map((p, i) => (i % Math.ceil(points.length / 7) === 0 || i === points.length - 1) && (
        <text key={i} x={Math.min(Math.max(i * step, 14), w - 14)} y={height - 4} textAnchor="middle" fontSize="11" fill="#94a3b8">{p.label}</text>
      ))}
    </svg>
  );
}

export function BarList({ data, unit = '' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2">
      {data.map((d, i) => (
        <li key={d.label} className="text-sm">
          <div className="mb-1 flex justify-between gap-2"><span className="truncate text-[var(--az-text)]">{d.label}</span><span className="font-semibold text-[var(--az-text)]">{d.value}{unit}</span></div>
          <div className="h-2 rounded-full bg-[var(--az-hairline)]"><div className="h-2 rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: colorAt(i) }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function PieChart({ data, size = 160, label }) {
  const total = data.reduce((n, d) => n + d.value, 0) || 1;
  let acc = 0;
  const r = size / 2 - 4;
  const c = size / 2;
  const arcs = data.map((d, i) => {
    const a0 = (acc / total) * Math.PI * 2;
    acc += d.value;
    const a1 = (acc / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a) => [c + r * Math.sin(a), c - r * Math.cos(a)];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    const dpath = data.length === 1 || d.value === total
      ? `M${c},${c - r} A${r},${r} 0 1 1 ${c - 0.01},${c - r} Z`
      : `M${c},${c} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`;
    return <path key={d.label} d={dpath} fill={colorAt(i)} style={{ stroke: 'var(--color-ink-900)' }} strokeWidth="2"><title>{`${d.label}: ${d.value}`}</title></path>;
  });
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label}>{arcs}<circle cx={c} cy={c} r={r * 0.55} style={{ fill: 'var(--color-ink-900)' }} /></svg>
      <ul className="space-y-1 text-sm">
        {data.map((d, i) => <li key={d.label} className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: colorAt(i) }} />{d.label} <span className="text-2">{d.value}</span></li>)}
      </ul>
    </div>
  );
}

export function Stat({ label, value, hint }) {
  return (
    <div className="panel p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-2">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-[var(--az-text)]">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-2">{hint}</div>}
    </div>
  );
}

export function download(name, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const cell = (v) => {
  const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Rows of objects → CSV text. Columns default to the union of keys. */
export function toCsv(rows, columns) {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return [cols.map(cell).join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}
