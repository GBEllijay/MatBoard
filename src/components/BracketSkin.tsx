import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { bracketLinkEdges } from '../lib/bracketSkins';
import type { PolishedTimerSlug } from '../lib/polishedSkins';
import { loadBracketSkin, loadedBracketSkin, type BracketSkinModule } from '../skins/bracket/load';

/** The bracket skin's CSS, fonts, and background art, loaded on first use. Null while loading. */
export function useBracketSkin(slug: PolishedTimerSlug | null): BracketSkinModule | null {
  const [mod, setMod] = useState<{ slug: PolishedTimerSlug; mod: BracketSkinModule } | null>(() => {
    const hit = slug ? loadedBracketSkin(slug) : null;
    return slug && hit ? { slug, mod: hit } : null;
  });
  useEffect(() => {
    if (!slug) return;
    let live = true;
    void loadBracketSkin(slug).then((loaded) => {
      if (live) setMod({ slug, mod: loaded });
    });
    return () => {
      live = false;
    };
  }, [slug]);
  if (!slug) return null;
  if (mod?.slug === slug) return mod.mod;
  return loadedBracketSkin(slug);
}

/** Background art, sparks, and confetti behind the bracket. Decorative only. */
export function BracketSkinDeco({ html }: { html: string }) {
  return <div className="bskin-deco" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}

type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/**
 * Connector lines between rounds, drawn from the live cards the way the mockups draw them:
 * an elbow from each match into its slot in the next round, lit once that match has a result.
 * Purely visual; it reads the tree and never changes it.
 */
export function BracketSkinLinks({ bracketRef, drawKey }: { bracketRef: RefObject<HTMLElement | null>; drawKey: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const bracket = bracketRef.current;
    const svg = svgRef.current;
    if (!bracket || !svg) return;
    let frame = 0;
    const draw = () => {
      frame = 0;
      if (getComputedStyle(svg).display === 'none' || bracket.classList.contains('bracket--three')) {
        svg.innerHTML = '';
        return;
      }
      const box = bracket.getBoundingClientRect();
      const scale = bracket.offsetWidth > 0 ? box.width / bracket.offsetWidth : 1;
      if (!(scale > 0)) return;
      const local = (el: Element): Rect => {
        const r = el.getBoundingClientRect();
        const left = (r.left - box.left) / scale;
        const top = (r.top - box.top) / scale;
        return { left, top, width: r.width / scale, height: r.height / scale, right: left + r.width / scale, bottom: top + r.height / scale };
      };
      const cs = getComputedStyle(bracket.closest('main') ?? bracket);
      const bu = parseFloat(cs.getPropertyValue('--bu')) || 10.8;
      const num = (name: string, fallback: number) => {
        const raw = parseFloat(cs.getPropertyValue(name));
        return Number.isFinite(raw) ? raw : fallback;
      };
      const lineW = num('--lw', 0.45) * bu;
      const underW = num('--uw', 1.1) * bu;
      const line = cs.getPropertyValue('--line').trim() || 'rgba(255,255,255,.5)';
      const under = cs.getPropertyValue('--under').trim() || 'transparent';
      const hot = cs.getPropertyValue('--hot').trim() || line;
      const cards = new Map<string, Element>();
      bracket.querySelectorAll('[data-match-id]').forEach((el) => cards.set(el.getAttribute('data-match-id') ?? '', el));
      const paths: { d: string; hot: boolean }[] = [];
      for (const edge of bracketLinkEdges([...cards.keys()])) {
        const fromCard = cards.get(edge.from);
        const toCard = cards.get(edge.to);
        if (!fromCard || !toCard) continue;
        const a = local(fromCard.querySelector('.t-match__bouts') ?? fromCard);
        let t: Rect;
        if (edge.slot === 'card') {
          t = local(toCard);
        } else {
          const slot = toCard.querySelectorAll('.t-match__bouts > .t-slot')[edge.slot];
          t = local(slot ?? toCard);
        }
        const y1 = a.top + a.height / 2;
        const y2 = t.top + t.height / 2;
        const x1 = edge.side === 'left' ? a.right : a.left;
        const x2 = edge.side === 'left' ? t.left : t.right;
        const xm = (x1 + x2) / 2;
        paths.push({ d: `M${x1.toFixed(1)} ${y1.toFixed(1)}H${xm.toFixed(1)}V${y2.toFixed(1)}H${x2.toFixed(1)}`, hot: fromCard.classList.contains('t-match--done') });
      }
      svg.setAttribute('viewBox', `0 0 ${bracket.offsetWidth} ${bracket.offsetHeight}`);
      svg.innerHTML =
        (underW > 0 ? paths.map((p) => `<path d="${p.d}" stroke="${under}" stroke-width="${underW.toFixed(2)}"/>`).join('') : '') +
        paths.map((p) => `<path d="${p.d}" stroke="${p.hot ? hot : line}" stroke-width="${lineW.toFixed(2)}"/>`).join('');
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(draw);
    };
    draw();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(bracket);
    bracket.querySelectorAll('.t-match, .bracket__champ').forEach((el) => observer?.observe(el));
    window.addEventListener('resize', schedule);
    void document.fonts?.ready.then(schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [bracketRef, drawKey]);
  return <svg ref={svgRef} className="bskin-links" aria-hidden="true" focusable="false" />;
}
