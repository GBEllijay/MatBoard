import test from 'node:test';
import assert from 'node:assert/strict';
import type { TechniqueNode, TechniqueTreeDoc } from './techniqueTreeStore.ts';
import { TECHNIQUE_TREE_STORAGE_KEY } from './techniqueTreeStore.ts';
import { GLOSSARY_BASE_STORAGE_KEY } from './glossaryBaseCards.ts';
import {
  diffLinkStamps,
  diffTreeStamps,
  emptyTreeStamps,
  glossaryLinkKey,
  readTreeStamps,
  TREE_STAMPS_STORAGE_KEY,
} from './techniqueTreeStamps.ts';
import {
  emptyTreeSyncDoc,
  mergeTreeDocs,
  sameTreeContent,
  sanitizeTreeSyncDoc,
  treeSyncDocIsEmpty,
  TREE_SYNC_MAX_TREES,
  type GlossaryBaseLink,
  type TreeSyncDoc,
} from './techniqueTreeSync.ts';
import { applyTreeDoc, collectTreeDoc } from './techniqueTreeCloud.ts';

function memory(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

function step(id: string, title: string, children: TechniqueNode[] = [], kind: TechniqueNode['kind'] = 'branch'): TechniqueNode {
  return { id, slotId: `slot-${id}`, kind, title, notes: '', collapsed: false, children };
}

function tree(id: string, name: string, base: string, child?: string): TechniqueTreeDoc {
  return { id, name, root: step(`${id}-root`, base, child ? [step(`${id}-c`, child)] : [], 'root') };
}

function link(id: string, from: string, to: string): GlossaryBaseLink {
  return { id, from: { type: 'card', cardId: from }, toCardId: to, relation: 'branch', label: '' };
}

function doc(partial: Partial<TreeSyncDoc>): TreeSyncDoc {
  return { ...emptyTreeSyncDoc(), ...partial };
}

test('merge: union of trees by id; the newer edit of the same tree wins', () => {
  const a = doc({ updatedAt: 10, activeId: 't1', trees: [{ tree: tree('t1', 'Guard', 'Closed guard'), at: 10 }] });
  const b = doc({
    updatedAt: 20,
    activeId: 't2',
    trees: [
      { tree: tree('t1', 'Guard', 'Closed guard', 'Triangle'), at: 20 },
      { tree: tree('t2', 'Passing', 'Half guard'), at: 5 },
    ],
  });
  const merged = mergeTreeDocs(a, b);
  assert.deepEqual(merged.trees.map((row) => row.tree.id), ['t1', 't2']);
  assert.equal(merged.trees[0].tree.root?.children[0]?.title, 'Triangle', 'newer edit of t1');
  assert.equal(merged.activeId, 't1', 'keeps this device open tree');
  assert.equal(merged.updatedAt, 20);
  assert.ok(sameTreeContent(merged, mergeTreeDocs(b, a)), 'order does not matter');
});

test('merge: glossary links are a union; removals win only over older links', () => {
  const l1 = link('l1', 'gbase.closed-guard', 'gbase.triangle-choke');
  const l2 = link('l2', 'gbase.mount', 'gbase.kimura');
  const a = doc({ links: [{ link: l1, at: 5 }] });
  const b = doc({ links: [{ link: l2, at: 6 }] });
  assert.deepEqual(mergeTreeDocs(a, b).links.map((row) => row.link.id), ['l1', 'l2']);

  const removed = doc({ removedLinks: { [glossaryLinkKey(l1)]: 9 } });
  assert.deepEqual(mergeTreeDocs(a, removed).links, [], 'removed after it was added');
  const readded = doc({ links: [{ link: { ...l1, id: 'l1b' }, at: 12 }] });
  const back = mergeTreeDocs(mergeTreeDocs(a, removed), readded);
  assert.deepEqual(back.links.map((row) => row.link.id), ['l1b'], 'added again later, so it stays');
  assert.equal(back.removedLinks[glossaryLinkKey(l1)], undefined);
});

test('merge: a deleted tree stays deleted unless edited after the delete', () => {
  const a = doc({ trees: [{ tree: tree('t1', 'Guard', 'Closed guard'), at: 10 }] });
  const gone = doc({ removedTrees: { t1: 15 } });
  assert.deepEqual(mergeTreeDocs(a, gone).trees, []);
  const edited = doc({ trees: [{ tree: tree('t1', 'Guard', 'Closed guard', 'Armbar'), at: 20 }] });
  assert.equal(mergeTreeDocs(gone, edited).trees.length, 1);
});

test('sanitize: junk, oversized, and foreign data are dropped; limits hold', () => {
  assert.equal(sanitizeTreeSyncDoc(null), null);
  const many = Array.from({ length: TREE_SYNC_MAX_TREES + 5 }, (_, index) => ({ tree: tree(`t${index}`, `T${index}`, 'Mount'), at: index + 1 }));
  const clean = sanitizeTreeSyncDoc({
    updatedAt: 5,
    trees: [...many, { tree: { name: 'no id' }, at: 3 }],
    links: [
      { link: link('ok', 'gbase.mount', 'gbase.kimura'), at: 2 },
      { link: link('self', 'gbase.mount', 'gbase.mount'), at: 2 },
      { link: { ...link('bad', 'gbase.mount', 'https://evil'), toCardId: 'https://evil' }, at: 2 },
    ],
    removedTrees: { t1: 'soon' },
  });
  assert.ok(clean);
  assert.equal(clean!.trees.length, TREE_SYNC_MAX_TREES);
  assert.deepEqual(clean!.links.map((row) => row.link.id), ['ok']);
  assert.deepEqual(clean!.removedTrees, {});
  const long = sanitizeTreeSyncDoc({ trees: [{ tree: { ...tree('t1', 'x'.repeat(500), 'y'.repeat(500)) }, at: 1 }] });
  assert.ok(long!.trees[0].tree.name.length <= 80);
  assert.ok(long!.trees[0].tree.root!.title.length <= 120);
  assert.ok(treeSyncDocIsEmpty(emptyTreeSyncDoc()));
});

test('stamps: changed, new, and removed trees and links get times; unchanged old data gets the oldest time', () => {
  const t1 = tree('t1', 'Guard', 'Closed guard');
  const t2 = tree('t2', 'Passing', 'Half guard');
  let result = diffTreeStamps(emptyTreeStamps(), { trees: [t1, t2] }, { trees: [t1, { ...t2, name: 'Pass' }] }, 100);
  assert.equal(result.stamps.trees.t1, 1);
  assert.equal(result.stamps.trees.t2, 100);
  assert.equal(result.changed, true);
  result = diffTreeStamps(result.stamps, { trees: [t1, t2] }, { trees: [t1] }, 200);
  assert.equal(result.stamps.removedTrees.t2, 200);
  assert.equal(result.stamps.trees.t2, undefined);

  const l1 = link('l1', 'gbase.mount', 'gbase.kimura');
  let links = diffLinkStamps(emptyTreeStamps(), [], [l1], 300);
  assert.equal(links.stamps.links[glossaryLinkKey(l1)], 300);
  links = diffLinkStamps(links.stamps, [l1], [], 400);
  assert.equal(links.stamps.removedLinks[glossaryLinkKey(l1)], 400);
});

test('device round trip: collect on one device, apply on another, nothing lost on either', () => {
  const l1 = link('l1', 'gbase.closed-guard', 'gbase.triangle-choke');
  const guard = tree('t1', 'Guard game', 'Base Position', 'Scissor sweep');
  guard.root!.glossaryCardId = 'gbase.closed-guard';
  const phone = memory({
    [TECHNIQUE_TREE_STORAGE_KEY]: JSON.stringify({ version: 2, activeId: 't1', trees: [guard] }),
    [GLOSSARY_BASE_STORAGE_KEY]: JSON.stringify({ version: 1, cards: [], links: [l1], collisions: [], skipped: [] }),
    [TREE_STAMPS_STORAGE_KEY]: JSON.stringify({ v: 1, trees: { t1: 50 }, removedTrees: {}, links: { [glossaryLinkKey(l1)]: 60 }, removedLinks: {} }),
  });
  const fromPhone = collectTreeDoc(phone, 1000);
  assert.equal(fromPhone.trees[0].at, 50);
  assert.equal(fromPhone.updatedAt, 60);

  const laptop = memory({
    [TECHNIQUE_TREE_STORAGE_KEY]: JSON.stringify({ version: 2, activeId: 't9', trees: [tree('t9', 'Takedowns', 'Double leg')] }),
  });
  const merged = mergeTreeDocs(collectTreeDoc(laptop, 1000), fromPhone);
  applyTreeDoc(merged, laptop);
  const archive = JSON.parse(laptop.getItem(TECHNIQUE_TREE_STORAGE_KEY)!);
  assert.deepEqual(archive.trees.map((row: TechniqueTreeDoc) => row.id).sort(), ['t1', 't9']);
  assert.equal(archive.activeId, 't9', 'the laptop keeps its open tree');
  assert.equal(archive.trees.find((row: TechniqueTreeDoc) => row.id === 't1').root.glossaryCardId, 'gbase.closed-guard', 'explicit glossary link travels');
  const catalog = JSON.parse(laptop.getItem(GLOSSARY_BASE_STORAGE_KEY)!);
  assert.equal(catalog.cards.length, 245, 'built-in cards are rebuilt, not uploaded');
  assert.deepEqual(catalog.links.map((row: GlossaryBaseLink) => row.id), ['l1']);
  assert.equal(readTreeStamps(laptop).trees.t1, 50);
  assert.ok(sameTreeContent(collectTreeDoc(laptop, 1000), merged), 'collecting again gives the same doc');
});

test('a brand-new device with only the empty default tree uploads nothing and keeps its default until a cloud copy arrives', () => {
  const fresh = memory({
    [TECHNIQUE_TREE_STORAGE_KEY]: JSON.stringify({ version: 2, activeId: 'd', trees: [{ id: 'd', name: 'Technique Tree', root: null }] }),
  });
  assert.ok(treeSyncDocIsEmpty(collectTreeDoc(fresh, 5)));
  applyTreeDoc(emptyTreeSyncDoc(), fresh);
  assert.equal(JSON.parse(fresh.getItem(TECHNIQUE_TREE_STORAGE_KEY)!).trees[0].id, 'd');
});
