/**
 * Read-only view of the Technique Tree on this device, for the live D8 and the cards.
 * Nothing is written to the tree, the glossary card links, or the student's file here.
 * The tree is re-read when the page comes back into view or another tab saves it.
 */
import { useEffect, useMemo, useState } from 'react';
import { edgesFromArchive, edgesFromCards, edgesFromCatalog, type NamedEdge } from '../lib/d8TreeLinks.ts';
import { loadGlossaryBaseCatalog, GLOSSARY_BASE_STORAGE_KEY, type GlossaryBaseCatalog } from '../lib/glossaryBaseCards.ts';
import { TECHNIQUE_TREE_STORAGE_KEY, sanitizeArchive, type TechniqueTreeArchive } from '../lib/techniqueTreeStore.ts';
import type { LiveCard } from '../lib/indexCards.ts';
import { TREE_CLOUD_EVENT } from '../lib/techniqueTreeCloud.ts';
import { useIndexCardFile } from './store.ts';

export type DeviceTree = { archive: TechniqueTreeArchive | null; catalog: GlossaryBaseCatalog | null; stamp: string };

/** Parse without the repair write that loadTechniqueArchive does. */
export function readDeviceTree(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): DeviceTree {
  if (!storage) return { archive: null, catalog: null, stamp: '' };
  let rawTree: string | null = null;
  let rawCatalog: string | null = null;
  try {
    rawTree = storage.getItem(TECHNIQUE_TREE_STORAGE_KEY);
    rawCatalog = storage.getItem(GLOSSARY_BASE_STORAGE_KEY);
  } catch {
    return { archive: null, catalog: null, stamp: '' };
  }
  let archive: TechniqueTreeArchive | null = null;
  if (rawTree && rawTree.trim()) {
    try {
      archive = sanitizeArchive(JSON.parse(rawTree)).archive;
    } catch {
      archive = null;
    }
  }
  const catalog = rawCatalog && rawCatalog.trim() ? loadGlossaryBaseCatalog() : null;
  return { archive, catalog, stamp: `${rawTree?.length ?? 0}:${rawTree ?? ''}#${rawCatalog?.length ?? 0}` };
}

export function useDeviceTree(): DeviceTree {
  const [tree, setTree] = useState<DeviceTree>(() => readDeviceTree());
  useEffect(() => {
    const refresh = () => {
      const next = readDeviceTree();
      setTree((current) => (current.stamp === next.stamp ? current : next));
    };
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === TECHNIQUE_TREE_STORAGE_KEY || event.key === GLOSSARY_BASE_STORAGE_KEY) refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    window.addEventListener(TREE_CLOUD_EVENT, refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(TREE_CLOUD_EVENT, refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return tree;
}

/** Every saved link: the device Technique Tree, its glossary card links, and the student's card connections. */
export function useTreeEdges(cards: readonly LiveCard[]): { edges: NamedEdge[]; tree: DeviceTree } {
  const tree = useDeviceTree();
  const file = useIndexCardFile();
  const deviceEdges = useMemo(() => [...edgesFromArchive(tree.archive), ...edgesFromCatalog(tree.catalog, tree.archive)], [tree]);
  // Live cards are rebuilt on every render; key on what the edges read so the result stays the same object.
  const cardsKey = cards.map((card) => `${card.id}:${card.name}`).join('|');
  const edges = useMemo(() => [...edgesFromCards(file, cards), ...deviceEdges], [file, cardsKey, deviceEdges]);
  return { edges, tree };
}
