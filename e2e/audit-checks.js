// In-page checks for the workstream H audit (responsive + WCAG 2.2 AA). `pageChecks` runs inside
// the browser through page.evaluate, so it must not use anything from this module's scope.
// Names come from Chrome's accessibility tree (see audit.spec.js), not from these DOM checks.

export function pageChecks({ contrastOnly = false } = {}) {
  const out = [];
  const vw = document.documentElement.clientWidth;
  const sig = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 4).join('.') : '';
    const text = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}${text ? ` "${text}"` : ''}`;
  };
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    if (el.closest('[aria-hidden="true"], [inert]')) return false;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    }
    // Visually-hidden text (sr-only) is clipped to 1px and isn't seen, so it can't fail contrast.
    return !(r.width <= 1 && r.height <= 1);
  };

  // Colours: let a canvas turn any CSS colour (oklch, color-mix, color(srgb …)) into RGBA.
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = (c) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const over = (top, under) => {
    const a = top[3] + under[3] * (1 - top[3]);
    if (a === 0) return [0, 0, 0, 0];
    return [0, 1, 2].map((i) => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a).concat(a);
  };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  // Background behind an element: composite every ancestor's colour; give up on images/gradients.
  const background = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = rgba(s.backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    let bg = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    return bg;
  };

  // Contrast (1.4.3): every element with its own visible text.
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (!shown(el) || el.closest('[disabled], [aria-disabled="true"], svg, option')) continue;
    const s = getComputedStyle(el);
    const bg = background(el);
    if (!bg) continue;
    let opacity = 1;
    for (let n = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
    const fg = over([...rgba(s.color).slice(0, 3), rgba(s.color)[3] * opacity], bg);
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    const r = ratio(fg, bg);
    if (r < need - 0.01) out.push({ rule: 'contrast', el: sig(el), detail: `${r.toFixed(2)}:1 < ${need}:1 (${s.color} on rgb(${bg.slice(0, 3).map(Math.round)}) ${size}px)` });
  }
  if (contrastOnly) return out;

  // Reflow (1.4.10): nothing makes the page scroll sideways.
  if (document.documentElement.scrollWidth > vw + 1) {
    const wide = [...document.body.querySelectorAll('*')].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.right <= vw + 1 || r.width === 0) return false;
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return false;
      }
      return true;
    });
    // Report the outermost offenders only.
    const top = wide.filter((el) => !wide.includes(el.parentElement)).slice(0, 5);
    out.push({ rule: 'overflow', el: top.map(sig).join(' | ') || 'unknown', detail: `scrollWidth ${document.documentElement.scrollWidth} > ${vw}` });
  }

  // Target size (2.5.8 AA): at least 24 × 24 CSS px, except links inside running text.
  const targets = document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=link], [role=switch], [role=checkbox], [tabindex="0"]');
  for (const el of targets) {
    if (!shown(el) || el.disabled) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= 24 && r.height >= 24) continue;
    if (getComputedStyle(el).display === 'inline' && el.closest('p, li, td, label, span') && el.parentElement.textContent.trim().length > el.textContent.trim().length + 2) continue;
    if (/^(checkbox|radio)$/.test(el.type)) {
      const lab = el.closest('label') || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
      if (lab) { const lr = lab.getBoundingClientRect(); if (lr.height >= 24) continue; }
    }
    if (el.tagName === 'INPUT' && getComputedStyle(el).opacity === '0') continue; // styled control: the label is the target
    out.push({ rule: 'target-size', el: sig(el), detail: `${Math.round(r.width)}×${Math.round(r.height)}` });
  }

  // Structure (1.3.1, 2.4.6, 3.1.1).
  if (!document.documentElement.lang) out.push({ rule: 'lang', el: 'html', detail: 'no lang' });
  if (!document.querySelector('main, [role=main]')) out.push({ rule: 'landmark', el: 'body', detail: 'no <main>' });
  // Visually hidden headings (sr-only) still give the page its structure, so only headings that
  // are really absent (display none, hidden, aria-hidden) are left out here.
  const inTree = (el) => !el.closest('[aria-hidden="true"], [hidden], [inert]') && el.getClientRects().length > 0;
  const hs = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(inTree);
  if (!hs.some((h) => h.tagName === 'H1')) out.push({ rule: 'heading', el: 'page', detail: 'no visible h1' });
  for (let i = 1; i < hs.length; i++) {
    const a = Number(hs[i - 1].tagName[1]), b = Number(hs[i].tagName[1]);
    if (b > a + 1) out.push({ rule: 'heading', el: sig(hs[i]), detail: `h${a} → h${b}` });
  }
  for (const img of document.querySelectorAll('img:not([alt])')) if (shown(img)) out.push({ rule: 'img-alt', el: sig(img), detail: img.src.slice(-60) });
  for (const el of document.querySelectorAll('[aria-labelledby], [aria-describedby], label[for]')) {
    const ids = (el.getAttribute('aria-labelledby') || el.getAttribute('aria-describedby') || el.getAttribute('for')).split(/\s+/);
    for (const id of ids) if (id && !document.getElementById(id)) out.push({ rule: 'broken-ref', el: sig(el), detail: `#${id} missing` });
  }
  const ids = new Map();
  for (const el of document.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) || 0) + 1);
  for (const [id, n] of ids) if (n > 1) out.push({ rule: 'duplicate-id', el: `#${id}`, detail: `${n} elements` });
  return out;
}

/** Is the focused element's focus indicator visible (2.4.7)? Runs in the page. */
export function focusState() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  // Date and time fields: the last stop is Chrome's own calendar button inside the field, which
  // draws its own ring while the field itself stops matching :focus.
  if (/^(date|time|datetime-local|month|week)$/.test(el.type)) return null;
  const s = getComputedStyle(el);
  const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
  const ring = s.boxShadow && s.boxShadow !== 'none';
  const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 4).join('.') : '';
  return { visible: outline || ring, style: `outline ${s.outlineStyle} ${s.outlineWidth}; box-shadow ${s.boxShadow}; type ${el.type || ''}`, el: `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"` };
}
