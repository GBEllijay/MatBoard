import test from 'node:test';
import assert from 'node:assert/strict';
import { d8Catalog } from '../indexCards/catalog.ts';
import {
  CARD_LINKS_MAX,
  CARD_NOTES_MAX,
  INDEX_CARDS_STORAGE_KEY,
  assembleCards,
  cleanLinks,
  emptyIndexCards,
  loadIndexCards,
  withCardEdit,
  withCardLink,
  withCardNotes,
  withCustomCard,
  withRating,
  withVideo,
  withoutCardLink,
  writeIndexCards,
} from './indexCards.ts';
import { studentDocIsEmpty, type StudentSyncDoc } from './signedInSyncDocs.ts';

const catalog = d8Catalog();

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

function custom() {
  const added = withCustomCard(catalog, emptyIndexCards(), 'submissions', 'Wrist lock', 4, 1000);
  assert.ok(!('error' in added));
  return added;
}

test('notes save on a move the student added and survive a reload from storage', () => {
  const { file, id } = custom();
  const noted = withCardNotes(catalog, file, id, '  Grip the hand, elbow tight.\r\nFinish slow.  ');
  const store = memory();
  writeIndexCards(store, noted);
  const reloaded = loadIndexCards(store);
  const card = assembleCards(catalog, reloaded).find((row) => row.id === id)!;
  assert.equal(card.notes, 'Grip the hand, elbow tight.\nFinish slow.');
  assert.equal(card.rating, 4, 'rating stays');
  assert.ok(store.data.has(INDEX_CARDS_STORAGE_KEY));
});

test('notes on a built-in move keep its place: no rating or addedAt is invented', () => {
  const noted = withCardNotes(catalog, emptyIndexCards(), 'pos.mount', 'Heavy hips');
  assert.deepEqual(noted.cards, [{ id: 'pos.mount', faceId: 'guard-control', name: 'Mount', notes: 'Heavy hips', tree: null }]);
  const card = assembleCards(catalog, noted).find((row) => row.id === 'pos.mount')!;
  assert.equal(card.touched, false);
  assert.equal(card.addedAt, 0);
});

test('a blank note clears it, and notes are capped', () => {
  const { file, id } = custom();
  const noted = withCardNotes(catalog, file, id, 'x');
  const cleared = withCardNotes(catalog, noted, id, '   ');
  assert.equal(cleared.cards.find((row) => row.id === id)!.notes, undefined);
  const long = withCardNotes(catalog, file, id, 'a'.repeat(CARD_NOTES_MAX + 50));
  assert.equal(long.cards.find((row) => row.id === id)!.notes!.length, CARD_NOTES_MAX);
  assert.equal(withCardNotes(catalog, file, 'nope', 'x'), file, 'unknown card is a no-op');
});

test('rating, video, and rename keep notes and connections', () => {
  let file = withCardNotes(catalog, emptyIndexCards(), 'pos.mount', 'Heavy hips');
  file = withCardLink(catalog, file, 'pos.mount', { to: 'sub.armbar-mount', relation: 'leads' });
  file = withRating(catalog, file, 'pos.mount', 5);
  file = withVideo(catalog, file, 'pos.mount', { title: 'Mount', href: 'https://example.com/v' });
  const edited = withCardEdit(catalog, file, 'pos.mount', { name: 'Full mount', faceId: 'guard-control' });
  assert.ok(!('error' in edited));
  const card = assembleCards(catalog, edited.file).find((row) => row.id === 'pos.mount')!;
  assert.equal(card.notes, 'Heavy hips');
  assert.deepEqual(card.links, [{ to: 'sub.armbar-mount', relation: 'leads' }]);
  assert.equal(card.rating, 5);
  assert.equal(card.name, 'Full mount');
});

test('connections: add once, never to itself or a missing card, and remove', () => {
  const { file, id } = custom();
  const once = withCardLink(catalog, file, 'pos.mount', { to: id, relation: 'leads' });
  assert.equal(withCardLink(catalog, once, 'pos.mount', { to: id, relation: 'leads' }), once);
  assert.equal(withCardLink(catalog, file, 'pos.mount', { to: 'pos.mount', relation: 'leads' }), file);
  assert.equal(withCardLink(catalog, file, 'pos.mount', { to: 'missing', relation: 'leads' }), file);
  const both = withCardLink(catalog, once, 'pos.mount', { to: id, relation: 'defense' });
  assert.equal(both.cards.find((row) => row.id === 'pos.mount')!.links!.length, 2);
  const removed = withoutCardLink(catalog, both, 'pos.mount', { to: id, relation: 'leads' });
  assert.deepEqual(removed.cards.find((row) => row.id === 'pos.mount')!.links, [{ to: id, relation: 'defense' }]);
  const none = withoutCardLink(catalog, removed, 'pos.mount', { to: id, relation: 'defense' });
  assert.equal(none.cards.find((row) => row.id === 'pos.mount')!.links, undefined);
});

test('stored links are cleaned on load', () => {
  const rows = [
    { to: 'a', relation: 'leads' },
    { to: 'a', relation: 'leads' },
    { to: 'self', relation: 'leads' },
    { to: 'b', relation: 'sideways' },
    { to: '', relation: 'leads' },
    ...Array.from({ length: 40 }, (_, index) => ({ to: `c${index}`, relation: 'defense' })),
  ];
  const clean = cleanLinks(rows, 'self');
  assert.equal(clean[0].to, 'a');
  assert.equal(clean.length, CARD_LINKS_MAX);
  assert.ok(!clean.some((row) => row.to === 'self' || row.to === 'b'));
});

test('a card with only notes counts as student work for signed-in sync', () => {
  const doc: StudentSyncDoc = {
    v: 1,
    updatedAt: 1,
    profileId: 'default',
    indexCards: { version: 1, cards: [{ id: 'pos.mount', faceId: 'guard-control', name: 'Mount', notes: 'Heavy hips', tree: null }] },
    glossaryAdditions: { version: 1, additions: [] },
    assessments: { entries: [] },
  };
  assert.equal(studentDocIsEmpty(doc), false);
  const links: StudentSyncDoc = { ...doc, indexCards: { version: 1, cards: [{ id: 'pos.mount', links: [{ to: 'sub.kimura', relation: 'leads' }], tree: null }] } };
  assert.equal(studentDocIsEmpty(links), false);
  const blank: StudentSyncDoc = { ...doc, indexCards: { version: 1, cards: [{ id: 'pos.mount', tree: null }] } };
  assert.equal(studentDocIsEmpty(blank), true);
});

test('the sync server keeps card notes and connections, cleaned', async () => {
  const { sanitizeStudentDoc } = await import('../server/profileSync.ts');
  const doc = sanitizeStudentDoc(
    {
      updatedAt: 5,
      indexCards: {
        version: 1,
        cards: [
          {
            id: 'pos.mount',
            faceId: 'guard-control',
            name: 'Mount',
            notes: `  Heavy hips ${'x'.repeat(1200)}`,
            links: [
              { to: 'sub.kimura', relation: 'leads' },
              { to: 'sub.kimura', relation: 'leads' },
              { to: 'pos.mount', relation: 'leads' },
              { to: 'esc.x', relation: 'nope' },
            ],
          },
        ],
      },
      glossaryAdditions: { version: 1, additions: [] },
      assessments: { entries: [] },
    },
    'default',
  );
  const card = doc!.indexCards.cards[0];
  assert.equal(card.notes!.length, 1000);
  assert.ok(card.notes!.startsWith('Heavy hips'));
  assert.deepEqual(card.links, [{ to: 'sub.kimura', relation: 'leads' }]);
});
