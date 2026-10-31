/**
 * Corner back on pages reached from many places (/products).
 * React Router stores the in-app history position as `idx` on `window.history.state`.
 * idx > 0 means an earlier in-app page exists, so go back one step.
 * Otherwise (direct visit, new tab, shared link) go to the fallback instead of leaving the site.
 */
export function historyBackStep(state: unknown): -1 | null {
  if (!state || typeof state !== 'object') return null;
  const idx = (state as { idx?: unknown }).idx;
  return typeof idx === 'number' && idx > 0 ? -1 : null;
}
