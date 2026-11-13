import assert from 'node:assert/strict';
import test from 'node:test';
import { GLOSSARY } from './glossary.ts';
import {
  EXCLUDED_GLOSSARY_FACES,
  GLOSSARY_BASE_CARD_TOTAL,
  GLOSSARY_BASE_FACE_COUNTS,
  GLOSSARY_BASE_FACE_IDS,
  GLOSSARY_BASE_STORAGE_KEY,
  buildGlossaryBaseCards,
  countCardsByFace,
  ensureGlossaryBaseCards,
  loadGlossaryBaseCatalog,
} from './glossaryBaseCards.ts';
import {
  TECHNIQUE_TREE_STORAGE_KEY,
  emptyTree,
  saveTechniqueArchive,
  setRoot,
  type TechniqueTreeArchive,
} from './techniqueTreeStore.ts';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    raw: store,
  };
}

const storage = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

test('six faces have 75, 44, 42, 28, 21, and 21 glossary base cards', () => {
  const { cards, skipped } = buildGlossaryBaseCards();
  const counts = countCardsByFace(cards);
  assert.equal(cards.length, GLOSSARY_BASE_CARD_TOTAL);
  assert.equal(counts['guard-control'], 75);
  assert.equal(counts.submissions, 44);
  assert.equal(counts.takedowns, 42);
  assert.equal(counts['escapes-defense'], 28);
  assert.equal(counts.passing, 21);
  assert.equal(counts.sweeps, 21);
  assert.deepEqual(counts, GLOSSARY_BASE_FACE_COUNTS);
  assert.equal(
    GLOSSARY_BASE_FACE_IDS.reduce((sum, face) => sum + counts[face], 0),
    231,
  );
  assert.equal(skipped.length, 0);
});

test('Mindset and Conditioning terms never become base cards', () => {
  const { cards } = buildGlossaryBaseCards();
  const excluded = GLOSSARY.filter((term) =>
    (EXCLUDED_GLOSSARY_FACES as readonly string[]).includes(term.faceId),
  );
  assert.equal(excluded.length, 14);
  assert.equal(excluded.filter((term) => term.faceId === 'mindset').length, 8);
  assert.equal(excluded.filter((term) => term.faceId === 'conditioning').length, 6);
  for (const term of excluded) {
    assert.equal(
      cards.some((card) => card.termKey === term.key || card.title === term.term),
      false,
      term.term,
    );
  }
  assert.equal(
    cards.some((card) => card.faceId === 'mindset' || (card.faceId as string) === 'conditioning'),
    false,
  );
});

test('every built card is a solo base with a glossary id and face, and there are no edges', () => {
  const { cards } = buildGlossaryBaseCards();
  const ids = new Set<string>();
  const termIds = new Set<string>();
  for (const card of cards) {
    assert.ok(card.title.trim(), card.termKey);
    assert.equal(card.id, `gbase.${card.termKey}`);
    assert.equal(card.slotId, `gslot.${card.termKey}`);
    assert.equal(card.glossaryTermId, `gl.${card.termKey}`);
    assert.ok(card.glossaryTermId.startsWith('gl.'));
    assert.ok(GLOSSARY_BASE_FACE_IDS.includes(card.faceId));
    assert.equal(ids.has(card.id), false);
    assert.equal(termIds.has(card.glossaryTermId), false);
    ids.add(card.id);
    termIds.add(card.glossaryTermId);
    const source = GLOSSARY.find((term) => term.key === card.termKey);
    assert.ok(source);
    assert.equal(card.title, source.term);
    assert.deepEqual(card.aliases, [...source.aliases]);
    assert.equal(card.definition, source.definition);
    assert.equal(card.subFactor, source.subFactor);
  }
  storage.clear();
  const seeded = ensureGlossaryBaseCards();
  assert.equal(seeded.catalog.links.length, 0);
  assert.equal(seeded.created, 231);
});

test('seeding is idempotent and does not duplicate cards', () => {
  storage.clear();
  const first = ensureGlossaryBaseCards();
  assert.equal(first.catalog.cards.length, 231);
  assert.equal(first.created, 231);
  assert.equal(first.reused, 0);
  assert.equal(first.written, true);
  const snapshot = localStorage.getItem(GLOSSARY_BASE_STORAGE_KEY);
  assert.ok(snapshot);

  const second = ensureGlossaryBaseCards();
  assert.equal(second.catalog.cards.length, 231);
  assert.equal(second.created, 0);
  assert.equal(second.reused, 231);
  assert.equal(second.written, false);
  assert.equal(localStorage.getItem(GLOSSARY_BASE_STORAGE_KEY), snapshot);
  assert.equal(second.catalog.cards[0].id, first.catalog.cards[0].id);
  assert.equal(loadGlossaryBaseCatalog().cards.length, 231);
});

test('seeding leaves an existing user tree untouched and does not merge same-name steps', () => {
  storage.clear();
  const user = setRoot(emptyTree('My closed guard'), 'Closed guard', 'My own notes');
  const archive: TechniqueTreeArchive = { version: 2, activeId: user.id, trees: [user] };
  const saved = saveTechniqueArchive(archive);
  assert.equal(saved.saved, true);
  const treeJson = localStorage.getItem(TECHNIQUE_TREE_STORAGE_KEY);
  assert.ok(treeJson);

  const seeded = ensureGlossaryBaseCards(saved.archive);
  assert.equal(seeded.catalog.cards.length, 231);
  assert.equal(localStorage.getItem(TECHNIQUE_TREE_STORAGE_KEY), treeJson);
  const userAgain = JSON.parse(treeJson);
  assert.equal(userAgain.trees.length, 1);
  assert.equal(userAgain.trees[0].id, user.id);
  assert.equal(userAgain.trees[0].root.title, 'Closed guard');
  assert.equal(userAgain.trees[0].root.notes, 'My own notes');
  assert.equal(userAgain.trees[0].root.children.length, 0);
  assert.equal(userAgain.trees[0].links ?? undefined, undefined);

  const closed = seeded.catalog.cards.find((card) => card.termKey === 'closed-guard' || /closed guard/i.test(card.title));
  assert.ok(closed);
  assert.notEqual(closed.id, user.root?.id);
  assert.ok(seeded.catalog.collisions.some((row) => row.nodeId === user.root?.id && row.glossaryTermId === closed.glossaryTermId));
  assert.equal(
    seeded.catalog.cards.filter((card) => card.title === 'Closed Guard' || card.title === 'Closed guard' || card.termKey === closed.termKey).length,
    1,
  );
});

test('a missing card is restored on the next seed without dropping instructor links', () => {
  storage.clear();
  const first = ensureGlossaryBaseCards();
  const target = first.catalog.cards.find((card) => card.termKey.includes('triangle') || /triangle/i.test(card.title));
  assert.ok(target);
  const trimmed = {
    ...first.catalog,
    cards: first.catalog.cards.filter((card) => card.id !== target.id),
    links: [
      {
        id: 'glink-keep',
        from: { type: 'card' as const, cardId: first.catalog.cards.find((card) => card.id !== target.id)!.id },
        toCardId: first.catalog.cards.find((card) => card.id !== target.id && card.faceId === 'sweeps')?.id ?? first.catalog.cards[0].id,
        relation: 'branch' as const,
        label: 'keep me',
      },
    ],
  };
  // Point the sweep link at a card that still exists after the triangle is removed.
  const from = trimmed.cards.find((card) => card.faceId === 'guard-control') ?? trimmed.cards[0];
  const to = trimmed.cards.find((card) => card.faceId === 'submissions' && card.id !== from.id) ?? trimmed.cards[1];
  trimmed.links[0] = {
    id: 'glink-keep',
    from: { type: 'card', cardId: from.id },
    toCardId: to.id,
    relation: 'branch',
    label: 'keep me',
  };
  localStorage.setItem(GLOSSARY_BASE_STORAGE_KEY, JSON.stringify(trimmed));
  assert.equal(loadGlossaryBaseCatalog().cards.length, 230);

  const restored = ensureGlossaryBaseCards();
  assert.equal(restored.catalog.cards.length, 231);
  assert.equal(restored.created, 1);
  assert.ok(restored.catalog.cards.some((card) => card.termKey === target.termKey));
  assert.equal(restored.catalog.links.length, 1);
  assert.equal(restored.catalog.links[0].id, 'glink-keep');
  assert.equal(restored.catalog.links[0].label, 'keep me');
});
