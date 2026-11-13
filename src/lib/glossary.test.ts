import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { FACES } from '../preview/d8Subfactors/model.ts';
import { d8Catalog } from '../indexCards/catalog.ts';
import { GLOSSARY, GLOSSARY_FACE_LABELS, faceLabel, glossaryTag, glossaryTerm, glossaryTermFor, searchGlossary } from './glossary.ts';
import {
  GLOSSARY_ADDITIONS_KEY,
  additionsCsv,
  additionsForReview,
  classifyAddition,
  emptyAdditions,
  loadAdditions,
  mergeAdditionPools,
  myMoveNames,
  promotionCandidates,
  recordAddition,
  writeAdditions,
} from './glossaryAdditions.ts';
import {
  INDEX_FACE_IDS,
  assembleCards,
  emptyIndexCards,
  loadIndexCards,
  termIdFor,
  unsortedCards,
  withCardEdit,
  withCardReset,
  withCustomCard,
  withRating,
  writeIndexCards,
  INDEX_CARDS_STORAGE_KEY,
} from './indexCards.ts';

function memory() {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    },
  };
}

test('the core glossary is the 245-term D8-only list and every term has one of the eight faces', () => {
  assert.equal(GLOSSARY.length, 245);
  for (const term of GLOSSARY) {
    assert.ok((INDEX_FACE_IDS as readonly string[]).includes(term.faceId), `${term.term} has face ${term.faceId}`);
    assert.ok(term.definition.length > 0, `${term.term} has a definition`);
  }
  const csv = readFileSync('docs/glossary/BJJ_glossary_D8_only.csv', 'utf8');
  assert.ok(!/,Other,/i.test(csv), 'no Other face in the glossary');
  assert.ok(!GLOSSARY.some((term) => /^(advantage|awesome)$/i.test(term.term)), 'app words are not glossary terms');
  for (const face of INDEX_FACE_IDS) assert.ok(GLOSSARY.some((term) => term.faceId === face), `${face} has glossary terms`);
});

test('every D8 tile, its name, and its glossary key resolve to a glossary term on the same face', () => {
  let tiles = 0;
  for (const face of FACES) {
    for (const line of face.subfactors) {
      tiles += 1;
      for (const name of [line.tile, line.label, line.glossary].filter(Boolean) as string[]) {
        const term = glossaryTerm(name);
        assert.ok(term, `${face.label} tile "${name}" is in the glossary`);
        assert.equal(term.faceId, face.id, `${name} is under ${face.label} in the glossary, not ${term.faceId}`);
      }
    }
  }
  assert.equal(tiles, 48);
  for (const line of d8Catalog()) {
    const tag = glossaryTag([line.name, line.tile], line.faceId);
    assert.ok(tag?.sameFace, `${line.name} gets a same-face glossary tag`);
  }
});

test('Mindset tiles land on their glossary terms', () => {
  assert.equal(glossaryTerm('Calm and focused')?.term, 'Composure');
  assert.equal(glossaryTerm('Intentional roll')?.term, 'Intentionality');
  assert.equal(glossaryTerm('Prepared')?.term, 'Preparation');
  assert.equal(glossaryTerm("Coach's instructions")?.term, 'Coachability');
  assert.equal(glossaryTerm('Open mind')?.term, 'Open mind');
  assert.equal(glossaryTermFor([null, 'nothing here', 'Calm and focused'])?.term, 'Composure');
});

test('typeahead matches headwords before aliases and offers the student their own moves', () => {
  const kim = searchGlossary('kim');
  assert.equal(kim[0]?.name, 'Kimura');
  assert.equal(kim[0]?.faceId, 'submissions');
  assert.equal(searchGlossary('arm')[0]?.name, 'Armbar', 'the shorter headword comes first');
  assert.equal(searchGlossary('').length, 0);
  assert.ok(searchGlossary('rnc').length <= 6);
  const mine = searchGlossary('zom', [{ name: 'Zombie sweep', faceId: 'sweeps' }]);
  assert.deepEqual(mine.map((row) => [row.name, row.source]), [['Zombie sweep', 'mine']]);
  assert.equal(searchGlossary('zzzz-not-a-move').length, 0);
});

test('a move with no D8 face ("Other") never gets a glossary tag', () => {
  assert.equal(glossaryTag(['Kimura'], 'other'), null);
  assert.equal(glossaryTag(['Kimura'], ''), null);
  assert.equal(glossaryTag(['Kimura'], null), null);
  assert.equal(glossaryTag(['Kimura'], 'submissions')?.sameFace, true);
  assert.equal(glossaryTag(['Kimura'], 'sweeps')?.sameFace, false);
  assert.equal(faceLabel('other'), 'Other');
  assert.equal(Object.values(GLOSSARY_FACE_LABELS).includes('Other'), false);
});

test('a legacy card without a face is kept as unsorted, stays off the D8, and can be placed', () => {
  const box = memory();
  box.storage.setItem(
    INDEX_CARDS_STORAGE_KEY,
    JSON.stringify({ version: 1, cards: [{ id: 'term.kimura-trap', name: 'Kimura trap', tree: null }, { id: 'term.x', faceId: 'guard', name: 'Old guard', tree: null }] }),
  );
  const file = loadIndexCards(box.storage);
  assert.deepEqual(unsortedCards(file).map((card) => card.name), ['Kimura trap', 'Old guard']);
  const catalog = d8Catalog();
  assert.equal(assembleCards(catalog, file).some((card) => card.id === 'term.kimura-trap'), false);
  const placed = withCardEdit(catalog, file, 'term.kimura-trap', { name: 'Kimura trap', faceId: 'submissions' });
  assert.ok('file' in placed);
  const live = assembleCards(catalog, placed.file).find((card) => card.id === 'term.kimura-trap');
  assert.equal(live?.faceId, 'submissions');
  assert.equal(unsortedCards(placed.file).length, 1);
});

test('the student can rename and move a built-in move; the catalog keeps its own name and face', () => {
  const catalog = d8Catalog();
  const box = memory();
  let file = withRating(catalog, emptyIndexCards(), 'sub.kimura', 4, 10);
  const moved = withCardEdit(catalog, file, 'sub.kimura', { name: 'Figure four', faceId: 'guard-control' }, 20);
  assert.ok('file' in moved);
  file = writeIndexCards(box.storage, moved.file);
  file = loadIndexCards(box.storage);
  let card = assembleCards(catalog, file).find((item) => item.id === 'sub.kimura');
  assert.equal(card?.name, 'Figure four');
  assert.equal(card?.tile, 'Figure four');
  assert.equal(card?.faceId, 'guard-control');
  assert.equal(card?.rating, 4);
  assert.equal(card?.edited, true);
  assert.equal(card?.baseName, 'Kimura');
  assert.equal(card?.baseFaceId, 'submissions');
  assert.equal(catalog.find((line) => line.id === 'sub.kimura')?.name, 'Kimura');
  assert.equal(termIdFor(catalog, file, 'Figure four'), 'sub.kimura');
  assert.equal(glossaryTag([card!.name, card!.tile, card!.baseName], card!.faceId)?.term.term, 'Kimura');
  file = withRating(catalog, file, 'sub.kimura', 2, 30);
  card = assembleCards(catalog, file).find((item) => item.id === 'sub.kimura');
  assert.equal(card?.name, 'Figure four', 'a later rating keeps the student name');
  assert.equal(card?.faceId, 'guard-control');
  file = withCardReset(file, 'sub.kimura');
  card = assembleCards(catalog, file).find((item) => item.id === 'sub.kimura');
  assert.equal(card?.name, 'Kimura');
  assert.equal(card?.faceId, 'submissions');
  assert.equal(card?.rating, 2);
  assert.equal(card?.edited, false);
});

test('a rename cannot take another move name and a face is required', () => {
  const catalog = d8Catalog();
  const clash = withCardEdit(catalog, emptyIndexCards(), 'sub.kimura', { name: 'Americana', faceId: 'submissions' });
  assert.deepEqual(clash, { error: 'duplicate', faceLabel: 'Submissions' });
  assert.deepEqual(withCardEdit(catalog, emptyIndexCards(), 'sub.kimura', { name: '  ', faceId: 'submissions' }), { error: 'blank' });
  assert.deepEqual(withCardEdit(catalog, emptyIndexCards(), 'sub.kimura', { name: 'Kimura', faceId: 'other' as never }), { error: 'face' });
  const same = withCardEdit(catalog, emptyIndexCards(), 'sub.kimura', { name: 'kimura', faceId: 'submissions' });
  assert.ok('file' in same);
  assert.equal(same.file.cards[0]?.userName, undefined);
  assert.equal(same.file.cards[0]?.userFace, undefined);
});

test('a custom move can be renamed and moved to another face', () => {
  const catalog = d8Catalog();
  const made = withCustomCard(catalog, emptyIndexCards(), 'sweeps', 'Zombie sweep', 3, 1);
  assert.ok('file' in made);
  const moved = withCardEdit(catalog, made.file, made.id, { name: 'Zombie roll', faceId: 'escapes-defense' });
  assert.ok('file' in moved);
  const card = assembleCards(catalog, moved.file).find((item) => item.id === made.id);
  assert.equal(card?.name, 'Zombie roll');
  assert.equal(card?.faceId, 'escapes-defense');
});

test('the additions pool records new, renamed, and moved moves and skips core glossary moves', () => {
  assert.equal(classifyAddition({ name: 'Kimura', faceId: 'submissions' }), null);
  assert.equal(classifyAddition({ name: 'Kimura', faceId: 'sweeps' })?.kind, 'recategorized');
  assert.equal(classifyAddition({ name: 'Figure four', faceId: 'submissions', from: 'Kimura' })?.kind, 'renamed');
  assert.equal(classifyAddition({ name: 'Zombie sweep', faceId: 'sweeps' })?.kind, 'new');
  let pool = emptyAdditions();
  pool = recordAddition(pool, { name: 'Kimura', faceId: 'submissions', now: 1 });
  assert.equal(pool.additions.length, 0);
  pool = recordAddition(pool, { name: 'Zombie sweep', faceId: 'sweeps', now: 1 });
  pool = recordAddition(pool, { name: 'zombie  SWEEP', faceId: 'sweeps', now: 5 });
  pool = recordAddition(pool, { name: 'Figure four', faceId: 'submissions', from: 'Kimura', now: 3 });
  const box = memory();
  writeAdditions(box.storage, pool);
  assert.ok(box.values.get(GLOSSARY_ADDITIONS_KEY));
  assert.equal(box.values.has(INDEX_CARDS_STORAGE_KEY), false, 'the pool is its own key');
  const back = loadAdditions(box.storage);
  const rows = additionsForReview(back);
  assert.deepEqual(rows.map((row) => [row.name, row.kind, row.count]), [
    ['zombie SWEEP', 'new', 2],
    ['Figure four', 'renamed', 1],
  ]);
  assert.deepEqual(myMoveNames(back).map((row) => row.faceId).sort(), ['submissions', 'sweeps']);
  const csv = additionsCsv(back, (id) => GLOSSARY_FACE_LABELS[id]);
  assert.match(csv, /^name,d8_face,kind,count,glossary_term,glossary_face,first_added,last_added\r\n/);
  assert.match(csv, /Figure four,Submissions,renamed,1,Kimura,Submissions,/);
  box.storage.setItem(GLOSSARY_ADDITIONS_KEY, '{');
  assert.deepEqual(loadAdditions(box.storage), emptyAdditions());
});

test('pools from several students merge for review and only shared rows are proposed', () => {
  const one = recordAddition(emptyAdditions(), { name: 'Zombie sweep', faceId: 'sweeps', now: 1 });
  const two = recordAddition(recordAddition(emptyAdditions(), { name: 'Zombie Sweep', faceId: 'sweeps', now: 2 }), { name: 'Rare thing', faceId: 'passing', now: 2 });
  const three = recordAddition(emptyAdditions(), { name: 'zombie sweep', faceId: 'sweeps', now: 3 });
  const merged = mergeAdditionPools([one, two, three]);
  assert.equal(merged[0]?.students, 3);
  assert.equal(merged[0]?.faceId, 'sweeps');
  assert.deepEqual(promotionCandidates(merged).map((row) => row.students), [3]);
  assert.equal(promotionCandidates(merged, 1).length, 2);
});

test('the public demo keeps the additions pool in its overlay', () => {
  const demo = readFileSync('src/lib/studentDemo.ts', 'utf8');
  assert.ok(demo.includes(GLOSSARY_ADDITIONS_KEY));
});
