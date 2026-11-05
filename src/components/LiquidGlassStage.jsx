import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Full-bleed scene with a real WebGL liquid-glass pane (@ybouane/liquidglass).
 *
 * The library rasterises every non-glass child of its root and refracts it inside the glass
 * element, so interactive content must stay *outside* that root or it would be captured and
 * drawn twice. The root holds only `background` plus an empty glass layer; `children` render
 * on top, and the glass layer tracks the element marked `data-glass-target`. Without WebGL
 * the same layer falls back to the CSS `.glass` style.
 */
export default function LiquidGlassStage({ background, children, config, className = '' }) {
  const stageRef = useRef(null);
  const rootRef = useRef(null);
  const glassRef = useRef(null);
  const overlayRef = useRef(null);
  const [mode, setMode] = useState('pending'); // pending | webgl | css

  useLayoutEffect(() => {
    let target = null;
    const ro = new ResizeObserver(() => sync());
    const sync = () => {
      const next = overlayRef.current?.querySelector('[data-glass-target]');
      if (next !== target) {
        if (target) ro.unobserve(target);
        target = next;
        if (target) ro.observe(target);
      }
      const stage = stageRef.current?.getBoundingClientRect();
      const box = target?.getBoundingClientRect();
      if (!stage || !box || !glassRef.current) return;
      Object.assign(glassRef.current.style, {
        left: `${box.left - stage.left}px`, top: `${box.top - stage.top}px`,
        width: `${box.width}px`, height: `${box.height}px`,
      });
    };
    sync();
    ro.observe(stageRef.current);
    // Route changes swap the card inside the overlay; re-find the target when that happens.
    const mo = new MutationObserver(sync);
    mo.observe(overlayRef.current, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, []);

  useEffect(() => {
    let instance;
    let cancelled = false;
    const hasWebGL = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } })();
    if (!hasWebGL) { setMode('css'); return undefined; }
    glassRef.current.dataset.config = JSON.stringify(config);
    import('@ybouane/liquidglass')
      .then(({ LiquidGlass }) => LiquidGlass.init({ root: rootRef.current, glassElements: [glassRef.current] }))
      .then((inst) => { if (cancelled) inst.destroy(); else { instance = inst; setMode('webgl'); } })
      .catch((err) => { console.warn('LiquidGlass unavailable, using CSS glass', err); if (!cancelled) setMode('css'); });
    return () => { cancelled = true; instance?.destroy(); };
    // config is static per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={stageRef} className={`relative overflow-hidden ${className}`} data-glass-mode={mode}>
      <div ref={rootRef} className="absolute inset-0" aria-hidden="true">
        {background}
        <div ref={glassRef} style={{ position: 'absolute', borderRadius: config.cornerRadius }}
          className={mode === 'webgl' ? '' : 'glass glass-strong'} />
      </div>
      <div ref={overlayRef} className="relative z-10 min-h-full">{children}</div>
    </div>
  );
}
