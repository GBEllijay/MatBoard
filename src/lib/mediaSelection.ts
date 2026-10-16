/**
 * Shared multi-select for in-app photo and video grids.
 * Select all and Clear apply to the items on screen. Choices from another
 * folder stay until the sheet closes.
 */

export const SELECT_ALL_LABEL = 'Select all';
export const CLEAR_SELECTION_LABEL = 'Clear';

function itemId(item: { id: string }): string {
  return item.id.trim();
}

export function toggleSelection<T extends { id: string }>(selected: readonly T[], item: T): T[] {
  const id = itemId(item);
  if (!id) return [...selected];
  return selected.some((row) => itemId(row) === id)
    ? selected.filter((row) => itemId(row) !== id)
    : [...selected, item];
}

/** Add every visible item that is not already chosen. Earlier folders stay selected. */
export function selectAllVisible<T extends { id: string }>(selected: readonly T[], visible: readonly T[]): T[] {
  const seen = new Set(selected.map(itemId).filter(Boolean));
  const next = [...selected];
  for (const item of visible) {
    const id = itemId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push(item);
  }
  return next;
}

/** Drop the visible items. Choices from other folders stay. */
export function clearVisibleSelection<T extends { id: string }>(
  selected: readonly T[],
  visible: readonly T[],
): T[] {
  const drop = new Set(visible.map(itemId).filter(Boolean));
  if (drop.size === 0) return [...selected];
  return selected.filter((item) => !drop.has(itemId(item)));
}

export function visibleSelectionCounts(
  selected: readonly { id: string }[],
  visible: readonly { id: string }[],
): { chosen: number; total: number } {
  const ids = new Set(selected.map(itemId).filter(Boolean));
  let total = 0;
  let chosen = 0;
  for (const item of visible) {
    const id = itemId(item);
    if (!id) continue;
    total += 1;
    if (ids.has(id)) chosen += 1;
  }
  return { chosen, total };
}

export function allVisibleSelected(
  selected: readonly { id: string }[],
  visible: readonly { id: string }[],
): boolean {
  const counts = visibleSelectionCounts(selected, visible);
  return counts.total > 0 && counts.chosen === counts.total;
}

export function anyVisibleSelected(
  selected: readonly { id: string }[],
  visible: readonly { id: string }[],
): boolean {
  return visibleSelectionCounts(selected, visible).chosen > 0;
}
