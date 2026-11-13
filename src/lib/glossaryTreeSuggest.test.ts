import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addGlossaryBaseLink,
  ensureGlossaryBaseCards,
  findBaseCard,
  pickGlossaryBaseSuggestion,
  suggestGlossaryBaseCards,
} from './glossaryBaseCards.ts';

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
  };
}

const storage = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

test('connect suggestions filter by the typed prefix and include the face', () => {
  const matches = suggestGlossaryBaseCards('tri');
  assert.ok(matches.length > 0);
  assert.ok(matches.length <= 6);
  assert.ok(matches.some((match) => /triangle/i.test(match.term.name)));
  for (const match of matches) {
    assert.match(match.term.id, /^gl\./);
  }
  const closed = suggestGlossaryBaseCards('closed gu');
  assert.ok(closed.some((match) => /closed guard/i.test(match.term.name)));
  assert.equal(closed[0].via, 'name');
  const none = suggestGlossaryBaseCards('xyzxyzxyz');
  assert.deepEqual(none, []);
  const short = suggestGlossaryBaseCards('tr');
  assert.deepEqual(short, []);
});

test('an alias match offers the glossary headword and names the alias', () => {
  const gas = suggestGlossaryBaseCards('gas tank');
  assert.equal(gas[0].via, 'alias');
  assert.equal(gas[0].term.name, 'Stamina');
  assert.match(gas[0].matchedOn, /gas tank/i);
  assert.equal(gas[0].term.faceId, 'conditioning');

  const breath = suggestGlossaryBaseCards('breath control');
  assert.equal(breath[0].via, 'alias');
  assert.equal(breath[0].term.name, 'Breathing');
  assert.equal(breath[0].term.faceId, 'mindset');

  const upa = suggestGlossaryBaseCards('upa');
  assert.equal(upa.length > 0, true);
  assert.equal(upa[0].via, 'alias');
  assert.equal(upa[0].term.name, 'Bridge and Roll');
  assert.equal(upa[0].matchedOn, 'Upa');
  assert.equal(upa[0].term.faceId, 'escapes-defense');

  const zGuard = suggestGlossaryBaseCards('z-guard');
  assert.equal(zGuard[0].via, 'alias');
  assert.equal(zGuard[0].term.name, 'Knee Shield Half Guard');
  assert.match(zGuard[0].matchedOn, /z-guard/i);
});

test('picking a suggestion links to that glossary base card and creates no edges before the pick', () => {
  storage.clear();
  const seeded = ensureGlossaryBaseCards();
  assert.equal(seeded.catalog.links.length, 0);

  const closed = findBaseCard(seeded.catalog, 'closed guard');
  const triangleMatches = suggestGlossaryBaseCards('triangle');
  const triangle = triangleMatches.find((match) => /triangle/i.test(match.term.name));
  assert.ok(closed);
  assert.ok(triangle);

  const before = addGlossaryBaseLink(seeded.catalog, { type: 'card', cardId: closed.id }, 'missing-term-id');
  assert.equal(before.status, 'no-card');
  assert.equal(before.catalog.links.length, 0);

  const picked = pickGlossaryBaseSuggestion(
    seeded.catalog,
    { type: 'card', cardId: closed.id },
    triangle,
    'branch',
  );
  assert.equal(picked.status, 'linked');
  assert.ok(picked.link);
  assert.ok(picked.card);
  assert.equal(picked.card.glossaryTermId, triangle.term.id);
  assert.match(picked.card.title, /triangle/i);
  assert.equal(picked.link.from.type, 'card');
  if (picked.link.from.type === 'card') assert.equal(picked.link.from.cardId, closed.id);
  assert.equal(picked.link.toCardId, picked.card.id);
  assert.equal(picked.link.relation, 'branch');
  assert.equal(picked.catalog.links.length, 1);
  assert.equal(seeded.catalog.links.length, 0);

  const again = pickGlossaryBaseSuggestion(picked.catalog, { type: 'card', cardId: closed.id }, triangle, 'branch');
  assert.equal(again.status, 'already');
  assert.equal(again.catalog.links.length, 1);

  const fromTree = pickGlossaryBaseSuggestion(
    picked.catalog,
    { type: 'tree', treeId: 'tree-1', nodeId: 'node-1', slotId: 'slot-1', title: 'My closed guard' },
    triangle,
    'follow',
  );
  assert.equal(fromTree.status, 'linked');
  assert.equal(fromTree.card?.id, picked.card.id);
  assert.equal(fromTree.catalog.links.length, 2);
  assert.equal(fromTree.link?.relation, 'follow');
});
