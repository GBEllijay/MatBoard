/**
 * How many bottom sheets are open. The bracket win-method sheet is portaled,
 * so a CSS :has(.sheet) check on the page cannot see it. Skin chrome and the
 * mascot ask this count before they paint over Decision.
 */

const listeners = new Set<() => void>();
let openCount = 0;

function emit(): void {
  listeners.forEach((fn) => fn());
}

export function pushSheetLayer(): void {
  openCount += 1;
  emit();
}

export function popSheetLayer(): void {
  openCount = Math.max(0, openCount - 1);
  emit();
}

export function isSheetLayerOpen(): boolean {
  return openCount > 0;
}

export function subscribeSheetLayer(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
