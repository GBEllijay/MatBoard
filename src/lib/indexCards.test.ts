import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { STUDENT_EDITION_STORAGE_KEY, addJournalEntry, blankStudentReport } from './studentEdition.ts';
import { ASSESSMENT_STORAGE_KEY } from './studentAssessment.ts';
import { d8Catalog } from '../indexCards/catalog.ts';
import {
  INDEX_CARDS_STORAGE_KEY,
  NEUTRAL_RATING,
  aliasesFor,
  assembleCards,
  emptyIndexCards,
  faceScore,
  journalMentions,
  loadIndexCards,
  mentionsPhrase,
  reviewCardName,
  splitIndexedTerms,
  termIdFor,
  termKey,
  videosForTerm,
  withCustomCard,
  withRating,
  writeIndexCards,
  type CatalogLine,
} from './indexCards.ts';

const catalog: CatalogLine[] = [
  { id: 'sweep.hip-bump', faceId: 'sweeps', faceLabel: 'Sweeps', name: 'Hip bump sweep', tile: 'Hip bump sweep' },
  { id: 'sweep.scissor', faceId: 'sweeps', faceLabel: 'Sweeps', name: 'Scissor sweep', tile: 'Scissor sweep' },
  { id: 'pos.mount', faceId: 'guard-control', faceLabel: 'Guard/Control', name: 'Mount', tile: 'Mount' },
];

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

test('a term key ignores case, spacing, and accents', () => {
  assert.equal(termKey('  Hip   bump sweep '), 'hip-bump-sweep');
  assert.equal(termKey('HIP BUMP SWEEP'), termKey('hip bump sweep'));
  assert.equal(termKey('São Paulo pass'), 'sao-paulo-pass');
  assert.equal(termIdFor(catalog, emptyIndexCards(), 'sweep.hip-bump'), 'sweep.hip-bump');
  assert.equal(termIdFor(catalog, emptyIndexCards(), 'HIP   bump sweep'), 'sweep.hip-bump');
});

test('untouched lines are 3 and the face averages every line', () => {
  const cards = assembleCards(catalog, emptyIndexCards());
  assert.equal(cards.length, 3);
  assert.ok(cards.every((card) => card.rating === NEUTRAL_RATING && card.touched === false && card.tree === null));
  assert.equal(faceScore(cards, 'sweeps'), 3);
  const rated = withRating(catalog, emptyIndexCards(), 'sweep.hip-bump', 5);
  const next = assembleCards(catalog, rated);
  assert.equal(next.find((card) => card.id === 'sweep.hip-bump')?.rating, 5);
  assert.equal(next.find((card) => card.id === 'sweep.scissor')?.rating, 3);
  assert.equal(faceScore(next, 'sweeps'), 4);
  assert.equal(faceScore(next, 'guard-control'), 3);
});

test('the real D8 catalog gives every face, including Mindset, a neutral 3', () => {
  const lines = d8Catalog();
  for (const faceId of ['guard-control', 'passing', 'sweeps', 'takedowns', 'escapes-defense', 'submissions', 'conditioning', 'mindset'] as const) {
    const mine = lines.filter((line) => line.faceId === faceId);
    assert.ok(mine.length >= 6, faceId);
    assert.equal(faceScore(assembleCards(lines, emptyIndexCards()), faceId), 3);
  }
  const hip = lines.find((line) => line.name === 'Hip bump sweep');
  assert.equal(hip?.id, 'sweep.hip-bump');
  assert.equal(lines.some((line) => line.name.length > 0 && /wikipedia|ibjjf/i.test(line.name)), false);
});

test('a rating reloads from the index-card key and leaves the journal and check-in alone', () => {
  const box = memory();
  box.storage.setItem(ASSESSMENT_STORAGE_KEY, 'kept-check-in');
  box.storage.setItem(STUDENT_EDITION_STORAGE_KEY, 'kept-journal');
  const saved = writeIndexCards(box.storage, withRating(catalog, emptyIndexCards(), 'sweep.hip-bump', 4));
  assert.equal(loadIndexCards(box.storage).cards.find((card) => card.id === 'sweep.hip-bump')?.rating, 4);
  assert.equal(saved.cards[0]?.tree, null);
  assert.equal(box.values.get(ASSESSMENT_STORAGE_KEY), 'kept-check-in');
  assert.equal(box.values.get(STUDENT_EDITION_STORAGE_KEY), 'kept-journal');
  assert.equal(box.values.size, 3);
  box.storage.setItem(INDEX_CARDS_STORAGE_KEY, '{');
  assert.deepEqual(loadIndexCards(box.storage), emptyIndexCards());
  assert.equal(box.values.get(ASSESSMENT_STORAGE_KEY), 'kept-check-in');
});

test('the same custom move keeps one id on any screen', () => {
  const added = withCustomCard(catalog, emptyIndexCards(), 'sweeps', 'De La Riva', 3, 50);
  assert.ok(!('error' in added));
  if ('error' in added) return;
  assert.equal(added.id, 'term.de-la-riva');
  assert.equal(termIdFor(catalog, added.file, 'de la riva'), added.id);
  const again = withCustomCard(catalog, added.file, 'passing', 'De La Riva', 5, 60);
  assert.deepEqual(again, { error: 'duplicate', faceLabel: 'Sweeps' });
  const blank = reviewCardName(assembleCards(catalog, added.file), 'sweeps', '   ');
  assert.deepEqual(blank, { error: 'blank' });
});

test('journal text and videos match the term, not a longer word', () => {
  assert.equal(mentionsPhrase('Tried a hip bump sweep today.', 'Hip bump sweep'), true);
  assert.equal(mentionsPhrase('mountain goat', 'Mount'), false);
  const report = addJournalEntry(
    blankStudentReport(1),
    {
      date: '2026-10-28',
      className: 'Gi',
      gameTag: '',
      techniques: [{ id: 'sweep.hip-bump', name: 'Hip bump sweep' }],
      partners: '',
      drills: '',
      rolls: '',
      notes: 'The hip bump sweep came up when they posted.',
    },
    2,
  );
  const hits = journalMentions(report.journal, ['Hip bump sweep']);
  assert.equal(hits.length, 1);
  assert.match(hits[0]?.line ?? '', /hip bump sweep/i);
  assert.equal(journalMentions(report.journal, ['Scissor sweep']).length, 0);
  const videos = videosForTerm(
    ['Hip bump sweep'],
    [
      { id: 'clip-1', url: 'https://example.com/hip', description: 'Hip bump sweep from open guard', note: '' },
      { id: 'clip-2', url: 'https://example.com/other', description: 'Armbar detail', note: '' },
    ],
    [{ id: 'film-1', fileName: 'roll.mp4', technique: 'Hip bump sweep', note: '', techniqueAnchor: { name: 'Hip bump sweep' } }],
    { title: 'Class clip', href: 'https://example.com/class' },
  );
  assert.deepEqual(
    videos.map((video) => video.id),
    ['card-video', 'clip-1', 'film-1'],
  );
  assert.equal(videos.find((video) => video.id === 'film-1')?.href, '');
});

test('prose links the whole move, and a shorter overlapping word does not take it', () => {
  const aliases = aliasesFor(assembleCards(catalog, emptyIndexCards()));
  const parts = splitIndexedTerms('From mount I hit a hip bump sweep.', aliases);
  const linked = parts.filter((part) => part.termId);
  assert.deepEqual(
    linked.map((part) => part.text),
    ['mount', 'hip bump sweep'],
  );
  assert.deepEqual(
    linked.map((part) => part.termId),
    ['pos.mount', 'sweep.hip-bump'],
  );
});

test('the demo guard keeps the index-card key off the real journal file', () => {
  const demo = readFileSync(new URL('./studentDemo.ts', import.meta.url), 'utf8');
  assert.ok(demo.includes(INDEX_CARDS_STORAGE_KEY));
  assert.match(demo, /STUDENT_INDEX_CARDS_GUARD_KEY/);
});
