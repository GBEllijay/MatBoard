/** Ordered playlist helpers shared by Gallery, Videos, Pro Shop, Events, and Daily Techniques. */

export type PlaylistItem = {
  id: string;
  label: string;
  sortOrder: number;
  addedAt: number;
  folderId: string;
};

export function comparePlaylistItems(a: PlaylistItem, b: PlaylistItem): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (a.addedAt !== b.addedAt) return a.addedAt - b.addedAt;
  return a.id.localeCompare(b.id);
}

export function itemsInFolder<T extends PlaylistItem>(items: T[], folderId: string): T[] {
  return items.filter((item) => item.folderId === folderId).sort(comparePlaylistItems);
}

/**
 * Play queue for the TV loop.
 *
 * Default (no storyIds): enabled folders in `folderIds` order, items in each
 * folder’s `sortOrder`. That is today’s Gallery-then-Videos combined play.
 *
 * Later cross-folder story editor: pass `storyIds` (a single ordered id list
 * across folders). Disabled folders and unplayable items are still skipped;
 * ids missing from the story list append in the default folder order.
 */
export function buildPlayQueue<T extends PlaylistItem>(
  items: T[],
  options: {
    folderIds: readonly string[];
    folderEnabled: Record<string, boolean>;
    isPlayable: (item: T) => boolean;
    storyIds?: readonly string[] | null;
  },
): T[] {
  const eligible = items.filter(
    (item) => options.folderEnabled[item.folderId] !== false && options.isPlayable(item),
  );
  if (options.storyIds && options.storyIds.length > 0) {
    const byId = new Map(eligible.map((item) => [item.id, item]));
    const used = new Set<string>();
    const ordered: T[] = [];
    for (const id of options.storyIds) {
      const item = byId.get(id);
      if (!item || used.has(id)) continue;
      used.add(id);
      ordered.push(item);
    }
    for (const item of eligible.sort(comparePlaylistItems)) {
      if (!used.has(item.id)) ordered.push(item);
    }
    return ordered;
  }
  return options.folderIds.flatMap((folderId) =>
    options.folderEnabled[folderId] === false
      ? []
      : eligible.filter((item) => item.folderId === folderId).sort(comparePlaylistItems),
  );
}

export function moveItemIds(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) {
    return ids;
  }
  const next = ids.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function withFolderOrder<T extends PlaylistItem>(
  items: T[],
  folderId: string,
  orderedIds: string[],
  folderIds: readonly string[],
): T[] {
  const inFolder = items.filter((item) => item.folderId === folderId);
  const byId = new Map(inFolder.map((item) => [item.id, item]));
  const used = new Set<string>();
  const nextFolder: T[] = [];
  const push = (id: string) => {
    const item = byId.get(id);
    if (!item || used.has(id)) return;
    used.add(id);
    nextFolder.push({ ...item, sortOrder: nextFolder.length });
  };
  for (const id of orderedIds) push(id);
  for (const item of inFolder) push(item.id);
  return folderIds.flatMap((id) =>
    id === folderId ? nextFolder : items.filter((item) => item.folderId === id).sort(comparePlaylistItems),
  );
}
