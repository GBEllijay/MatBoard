import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCustomGlossaryCard,
  emptyGlossaryBaseCatalog,
  ensureGlossaryBaseCards,
  GLOSSARY_BASE_STORAGE_KEY,
  sanitizeGlossaryBaseCatalog,
  type GlossaryBaseCatalog,
} from './glossaryBaseCards.ts';
import {
  addLessonTechniqueToGlossary,
  canOfferAddToGlossary,
  lessonGlossaryHref,
  lessonGlossaryMatch,
} from './lessonGlossary.ts';
import { sanitizePlan } from './trainingNotesStore.ts';
import { applyTreeDoc, collectTreeDoc } from './techniqueTreeCloud.ts';
import { mergeTreeDocs, sameTreeContent, sanitizeTreeSyncDoc, treeSyncDocIsEmpty } from './techniqueTreeSync.ts';

function memory(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  };
}

const store = memory();
Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true });

function seeded(): GlossaryBaseCatalog {
  store.clear();
  return ensureGlossaryBaseCards(null).catalog;
}

test('match: a drill title that is a glossary term shows that card (case, spaces, plural, alias)', () => {
  const catalog = seeded();
  for (const title of ['Armbar', '  ARMBAR  ', 'armbars', 'Juji gatame']) {
    const match = lessonGlossaryMatch({ title }, catalog);
    assert.equal(match.card?.id, 'gbase.armbar', title);
    assert.equal(match.how, 'auto');
    assert.equal(canOfferAddToGlossary({ title }, catalog), false);
  }
});

test('match: works before the glossary was ever opened on this device (empty catalog)', () => {
  const match = lessonGlossaryMatch({ title: 'Armbar' }, emptyGlossaryBaseCatalog());
  assert.equal(match.card?.id, 'gbase.armbar');
});

test('no match: a new title offers Add to glossary; a blank title offers nothing', () => {
  const catalog = seeded();
  const match = lessonGlossaryMatch({ title: 'Zorro spin' }, catalog);
  assert.equal(match.card, null);
  assert.equal(match.how, 'none');
  assert.equal(canOfferAddToGlossary({ title: 'Zorro spin' }, catalog), true);
  assert.equal(canOfferAddToGlossary({ title: '   ' }, catalog), false);
  // Strict: a name that only starts the same is not the card.
  assert.equal(lessonGlossaryMatch({ title: 'Armb' }, catalog).card, null);
});

test('add and connect: the new card is saved in the glossary and connected to the drill', () => {
  const catalog = seeded();
  const result = addLessonTechniqueToGlossary(catalog, { title: '  Zorro   spin ', faceId: 'sweeps', definition: 'Spin under to the back.' }, 5000);
  assert.equal(result.status, 'added');
  assert.deepEqual(result.patch, { glossaryCardId: 'gbase.zorro-spin' });
  assert.equal(result.card?.title, 'Zorro spin');
  assert.equal(result.card?.faceId, 'sweeps');
  assert.equal(result.card?.custom, true);
  assert.equal(result.catalog.cards.length, catalog.cards.length + 1);
  assert.equal(catalog.cards.some((card) => card.id === 'gbase.zorro-spin'), false, 'input catalog is not mutated');

  // Connected: the drill keeps the id even when its title changes later.
  const linked = lessonGlossaryMatch({ title: 'Zorro (from De La Riva)', glossaryCardId: 'gbase.zorro-spin' }, result.catalog);
  assert.equal(linked.card?.id, 'gbase.zorro-spin');
  assert.equal(linked.how, 'linked');
  // Another drill with the same name (or plural) finds it by name.
  assert.equal(lessonGlossaryMatch({ title: 'zorro spins' }, result.catalog).card?.id, 'gbase.zorro-spin');

  // Adding again connects to the same card instead of a duplicate.
  const again = addLessonTechniqueToGlossary(result.catalog, { title: 'ZORRO SPIN', faceId: 'passing' });
  assert.equal(again.status, 'exists');
  assert.equal(again.catalog, result.catalog);
  assert.deepEqual(again.patch, { glossaryCardId: 'gbase.zorro-spin' });

  // A title that already is a built-in card connects to it; nothing is added.
  const builtIn = addLessonTechniqueToGlossary(result.catalog, { title: 'Armbars', faceId: 'sweeps' });
  assert.equal(builtIn.status, 'exists');
  assert.deepEqual(builtIn.patch, { glossaryCardId: 'gbase.armbar' });
});

test('add and connect: blank names are refused; the custom card survives a save/reload', () => {
  const catalog = seeded();
  assert.equal(addLessonTechniqueToGlossary(catalog, { title: '  ', faceId: 'sweeps' }).patch, null);
  const added = addCustomGlossaryCard(catalog, { title: 'Zorro spin', faceId: 'sweeps' }, 7000);
  const reloaded = sanitizeGlossaryBaseCatalog(JSON.parse(JSON.stringify(added.catalog)));
  const card = reloaded.cards.find((row) => row.id === 'gbase.zorro-spin');
  assert.equal(card?.custom, true);
  assert.equal(card?.addedAt, 7000);
  // Seeding the built-in cards again keeps it.
  store.setItem(GLOSSARY_BASE_STORAGE_KEY, JSON.stringify(reloaded));
  assert.ok(ensureGlossaryBaseCards(null).catalog.cards.some((row) => row.id === 'gbase.zorro-spin'));
});

test('lesson plan keeps the glossary connection on save and drops junk ids', () => {
  const base = sanitizePlan({}).plan;
  const raw = {
    ...base,
    techniques: [
      { ...base.techniques[0], title: 'Zorro spin', glossaryCardId: 'gbase.zorro-spin' },
      { ...base.techniques[0], id: 't2', slotId: 's2', title: 'Other', glossaryCardId: 'javascript:alert(1)' },
    ],
  };
  const { plan } = sanitizePlan(JSON.parse(JSON.stringify(raw)));
  assert.equal(plan.techniques[0].glossaryCardId, 'gbase.zorro-spin');
  assert.equal(plan.techniques[1].glossaryCardId, undefined);
});

test('custom glossary cards ride the existing account tree sync doc and merge across devices', () => {
  const phone = memory();
  const added = addCustomGlossaryCard(emptyGlossaryBaseCatalog(), { title: 'Zorro spin', faceId: 'sweeps' }, 9000);
  phone.setItem(GLOSSARY_BASE_STORAGE_KEY, JSON.stringify(sanitizeGlossaryBaseCatalog(added.catalog)));
  const fromPhone = collectTreeDoc(phone, 9000);
  assert.equal(treeSyncDocIsEmpty(fromPhone), false);
  assert.deepEqual(fromPhone.cards?.map((row) => row.card.id), ['gbase.zorro-spin'], 'built-in cards never upload');

  // Server-side clean keeps it; junk and built-in rows are dropped.
  const cleaned = sanitizeTreeSyncDoc({
    ...fromPhone,
    cards: [...(fromPhone.cards ?? []), { card: { id: 'gbase.armbar', title: 'Armbar', faceId: 'submissions' }, at: 1 }, { card: { id: 'bad id', custom: true }, at: 1 }],
  });
  assert.deepEqual(cleaned?.cards?.map((row) => row.card.id), ['gbase.zorro-spin']);

  const laptop = memory();
  const merged = mergeTreeDocs(collectTreeDoc(laptop, 9000), fromPhone);
  applyTreeDoc(merged, laptop);
  const laptopCatalog = JSON.parse(laptop.getItem(GLOSSARY_BASE_STORAGE_KEY) ?? '{}') as GlossaryBaseCatalog;
  const card = laptopCatalog.cards.find((row) => row.id === 'gbase.zorro-spin');
  assert.equal(card?.title, 'Zorro spin');
  assert.equal(card?.custom, true);
  assert.ok(sameTreeContent(collectTreeDoc(laptop, 9000), merged));

  // Older docs without cards still merge.
  const old = sanitizeTreeSyncDoc({ v: 1, updatedAt: 1, activeId: '', trees: [], removedTrees: {}, links: [], removedLinks: {} });
  assert.deepEqual(mergeTreeDocs(old, fromPhone).cards?.length, 1);
});

test('glossary links from a lesson open the overall glossary or one card', () => {
  assert.equal(lessonGlossaryHref(), '/technique-tree?glossary=1');
  assert.equal(lessonGlossaryHref('gbase.armbar'), '/technique-tree?card=gbase.armbar');
});
