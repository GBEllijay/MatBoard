import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { INSTRUCTOR_D12_FACES, INSTRUCTOR_D12_STORAGE_KEY, saveInstructorD12Scores } from './instructorD12.ts';
import {
  INSTRUCTOR_D12_CARDS_STORAGE_KEY,
  INSTRUCTOR_D12_STARTER_CARDS,
  editInstructorD12Card,
  instructorD12StarterCards,
  loadInstructorD12Cards,
  removeInstructorD12Card,
  saveInstructorD12Cards,
  withD12CardNotes,
  withD12CardVideo,
  withoutD12CardVideo,
  type InstructorD12Card,
} from './instructorD12Cards.ts';
import { INSTRUCTOR_GLOSSARY, instructorFaceDefinition, instructorGlossaryTerm } from './instructorGlossary.ts';
import {
  D12_RELATION_CHOICES,
  INSTRUCTOR_D12_LINKS_STORAGE_KEY,
  INSTRUCTOR_D12_SAMPLE_LINKS,
  PATH_TO_MASTERY,
  PATH_TO_MASTERY_EMPTY,
  VIEW_ON_PATH_TO_MASTERY,
  d12CardMastery,
  d12ChainForCard,
  d12ConnectionOptions,
  d12EndpointTile,
  d12FaceEndpoint,
  d12MasteryBranches,
  d12MasteryChains,
  d12MasteryState,
  loadInstructorD12Links,
  saveInstructorD12Links,
  withD12Link,
  withoutD12Link,
  type D12Link,
} from './instructorD12Mastery.ts';
import { buildD12Topo } from './instructorD12Topo.ts';

function memoryStorage(start: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> & { map: Map<string, string> } {
  const map = new Map(Object.entries(start));
  return {
    map,
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

const LESSON = 'starter.preparation.lesson-plan-video-review';
const INTRO = 'starter.public-speaking.intro-end-of-class-message';
const MAT = 'starter.preparation.mat-inspection';
const PARENTS = 'starter.public-speaking.communicating-with-parents-off-the-mat';

test('Path to Mastery is one renamable name, with instructor connection chips', () => {
  assert.equal(PATH_TO_MASTERY, 'Path to Mastery');
  assert.equal(VIEW_ON_PATH_TO_MASTERY, 'View on Path to Mastery');
  assert.match(PATH_TO_MASTERY_EMPTY, /Path to Mastery/);
  assert.deepEqual(
    D12_RELATION_CHOICES.map((choice) => [choice.id, choice.label]),
    [
      ['connects', 'Connects to'],
      ['builds-on', 'Builds on'],
      ['supports', 'Supports'],
    ],
  );
  assert.equal(INSTRUCTOR_D12_LINKS_STORAGE_KEY, 'matboard.instructor.d12.links.v1');
  assert.notEqual(INSTRUCTOR_D12_LINKS_STORAGE_KEY, INSTRUCTOR_D12_CARDS_STORAGE_KEY);
  assert.notEqual(INSTRUCTOR_D12_LINKS_STORAGE_KEY, INSTRUCTOR_D12_STORAGE_KEY);
});

test('the instructor glossary covers all twelve faces and every starter card, with no brand names', () => {
  for (const face of INSTRUCTOR_D12_FACES) {
    const term = instructorGlossaryTerm(face.label);
    assert.ok(term, face.label);
    assert.equal(term.kind, 'face');
    assert.equal(term.faceId, face.id);
    assert.ok(instructorFaceDefinition(face.id).length > 10);
  }
  for (const card of INSTRUCTOR_D12_STARTER_CARDS) {
    const term = instructorGlossaryTerm(card.name);
    assert.ok(term, card.name);
    assert.equal(term.kind, 'card');
    assert.equal(term.faceId, card.faceId);
    assert.ok(term.definition.length > 10);
  }
  assert.equal(INSTRUCTOR_GLOSSARY.length, 18);
  assert.equal(instructorGlossaryTerm('Kimura'), null, 'the BJJ technique glossary is not used here');
  const text = readFileSync('src/lib/instructorGlossary.ts', 'utf8');
  assert.doesNotMatch(text, /gracie|barra/i);
});

test('Builds on is the same arrow seen from the other end, and duplicates or self links are ignored', () => {
  let links: readonly D12Link[] = [];
  links = withD12Link(links, INTRO, 'connects', d12FaceEndpoint('time-management'));
  links = withD12Link(links, INTRO, 'builds-on', LESSON);
  links = withD12Link(links, MAT, 'supports', d12FaceEndpoint('safety'));
  assert.deepEqual(links, [
    { from: INTRO, to: 'face:time-management', relation: 'connects' },
    { from: LESSON, to: INTRO, relation: 'connects' },
    { from: MAT, to: 'face:safety', relation: 'supports' },
  ]);
  assert.equal(withD12Link(links, INTRO, 'builds-on', LESSON), links);
  assert.equal(withD12Link(links, INTRO, 'connects', INTRO), links);

  const cards = instructorD12StarterCards();
  const intro = cards.find((card) => card.id === INTRO)!;
  const view = d12CardMastery(intro, cards, links);
  assert.deepEqual(view.connectsTo.map((row) => row.name), ['Time Management']);
  assert.deepEqual(view.buildsOn.map((row) => row.name), ['Lesson plan / video review']);
  const lesson = d12CardMastery(cards.find((card) => card.id === LESSON)!, cards, links);
  assert.deepEqual(lesson.connectsTo.map((row) => row.name), ['Intro / end-of-class message']);
  const mat = d12CardMastery(cards.find((card) => card.id === MAT)!, cards, links);
  assert.deepEqual(mat.supports.map((row) => [row.name, row.kind]), [['Safety', 'face']]);

  const removed = withoutD12Link(links, { from: LESSON, to: INTRO, relation: 'connects' });
  assert.equal(removed.length, 2);
  assert.equal(d12CardMastery(intro, cards, removed).buildsOn.length, 0);
});

test('a deleted card drops out of its connections without rewriting the links', () => {
  const cards = instructorD12StarterCards();
  const links = [...INSTRUCTOR_D12_SAMPLE_LINKS];
  const fewer = removeInstructorD12Card(cards, LESSON);
  const intro = fewer.find((card) => card.id === INTRO)!;
  assert.equal(d12CardMastery(intro, fewer, links).buildsOn.length, 0);
  assert.equal(links.length, INSTRUCTOR_D12_SAMPLE_LINKS.length);
});

test('connection search finds cards and other faces, never the card itself or its own face', () => {
  const cards = instructorD12StarterCards();
  const intro = cards.find((card) => card.id === INTRO)!;
  const options = d12ConnectionOptions('mat', cards, intro);
  assert.ok(options.some((option) => option.endpoint === MAT && option.kind === 'card'));
  assert.ok(options.some((option) => option.endpoint === 'face:on-mat-presence' && option.kind === 'face'));
  assert.equal(d12ConnectionOptions('intro', cards, intro).some((option) => option.endpoint === INTRO), false);
  assert.equal(d12ConnectionOptions('public speaking', cards, intro).some((option) => option.endpoint === 'face:public-speaking'), false);
  assert.deepEqual(d12ConnectionOptions('  ', cards, intro), []);
});

test('links save under their own key and never touch the card file or the check-in', () => {
  const storage = memoryStorage();
  saveInstructorD12Cards(instructorD12StarterCards(), storage, 'owner');
  saveInstructorD12Scores({ energy: 4 }, storage, 'owner');
  const cardsRaw = storage.map.get(INSTRUCTOR_D12_CARDS_STORAGE_KEY);
  const scoresRaw = storage.map.get(INSTRUCTOR_D12_STORAGE_KEY);
  saveInstructorD12Links([...INSTRUCTOR_D12_SAMPLE_LINKS, { from: INTRO, to: INTRO, relation: 'connects' }], storage, 'owner');
  assert.equal(storage.map.get(INSTRUCTOR_D12_CARDS_STORAGE_KEY), cardsRaw);
  assert.equal(storage.map.get(INSTRUCTOR_D12_STORAGE_KEY), scoresRaw);
  assert.deepEqual(loadInstructorD12Links(storage, 'owner'), [...INSTRUCTOR_D12_SAMPLE_LINKS]);
  assert.deepEqual(loadInstructorD12Links(storage, 'seat-2'), []);
  assert.deepEqual(loadInstructorD12Links(memoryStorage({ [INSTRUCTOR_D12_LINKS_STORAGE_KEY]: '{bad' })), []);
});

test('branches run between faces, chains follow Connects to only, and a card finds its chain', () => {
  const cards = instructorD12StarterCards();
  const links = [...INSTRUCTOR_D12_SAMPLE_LINKS, { from: INTRO, to: PARENTS, relation: 'connects' as const }];
  const model = buildD12Topo(null, { cards });
  const lessonTile = d12EndpointTile(model, LESSON)!;
  const introTile = d12EndpointTile(model, INTRO)!;
  const timeTile = d12EndpointTile(model, 'face:time-management')!;
  assert.ok(lessonTile != null && introTile != null && timeTile != null);
  const timeFace = model.faces.findIndex((face) => (face.id as string) === 'time-management');
  assert.equal(model.tiles[timeTile]!.faceIndex, timeFace);

  const branches = d12MasteryBranches(model, cards, links);
  // Intro → Parents stays on Public Speaking, so it is not drawn through the D12.
  assert.equal(branches.length, 4);
  assert.ok(branches.every((branch) => model.tiles[branch.from]!.faceIndex !== model.tiles[branch.to]!.faceIndex));

  const chains = d12MasteryChains(model, cards, links);
  assert.ok(chains.length >= 1);
  const first = chains[0]!;
  assert.equal(first.tiles[0], lessonTile, 'a card nothing connects into starts the chain');
  assert.equal(first.tiles[1], introTile);
  assert.equal(first.tiles[2], timeTile, 'the next step prefers another face');
  assert.deepEqual(first.names.slice(0, 3), ['Lesson plan / video review', 'Intro / end-of-class message', 'Time Management']);
  assert.equal(chains.some((chain) => chain.tiles.includes(d12EndpointTile(model, 'face:safety')!)), false, 'Supports is never chained');

  const hit = d12ChainForCard(model, INTRO, chains);
  assert.ok(hit);
  assert.ok(hit.chain.tiles.includes(introTile));
  assert.equal(d12ChainForCard(model, MAT, chains), null);

  assert.equal(d12MasteryState(model, cards, []).kind, 'empty');
  assert.equal(d12MasteryState(model, cards, [{ from: INTRO, to: PARENTS, relation: 'connects' }]).kind, 'same-face');
  assert.equal(d12MasteryState(model, cards, links).kind, 'ready');
});

test('rename or move keeps the card id, so its connections follow it', () => {
  const cards = instructorD12StarterCards();
  const renamed = editInstructorD12Card(cards, MAT, { name: 'Mat check', faceId: 'preparation' }, 999);
  assert.ok(!('error' in renamed));
  const mat = renamed.cards.find((card) => card.id === MAT)!;
  assert.equal(mat.name, 'Mat check');
  assert.equal(mat.addedAt, 5, 'a rename keeps its seat');
  const moved = editInstructorD12Card(cards, MAT, { name: 'Mat inspection', faceId: 'safety' }, 999);
  assert.ok(!('error' in moved));
  const movedCard = moved.cards.find((card) => card.id === MAT)!;
  assert.equal(movedCard.faceId, 'safety');
  assert.equal(movedCard.addedAt, 999, 'a moved card takes the next open seat on its new face');
  const link: D12Link = { from: MAT, to: 'face:safety', relation: 'supports' };
  assert.equal(d12CardMastery(movedCard, moved.cards, [link]).supports.length, 1);
  assert.deepEqual(editInstructorD12Card(cards, MAT, { name: 'Lesson plan / video review', faceId: 'preparation' }), { error: 'duplicate' });
  assert.deepEqual(editInstructorD12Card(cards, MAT, { name: '  ', faceId: 'preparation' }), { error: 'blank' });
  assert.deepEqual(editInstructorD12Card(cards, MAT, { name: 'x', faceId: null }), { error: 'face' });
});

test('notes and videos save on the card, under the card key only', () => {
  const storage = memoryStorage();
  saveInstructorD12Scores({ energy: 2 }, storage, 'owner');
  const scoresRaw = storage.map.get(INSTRUCTOR_D12_STORAGE_KEY);
  let cards: InstructorD12Card[] = instructorD12StarterCards();
  cards = withD12CardNotes(cards, INTRO, '  Keep it under two minutes.  ');
  const added = withD12CardVideo(cards, INTRO, 'Warm-up talk', 'https://example.com/talk');
  assert.ok(!('error' in added));
  cards = added.cards;
  assert.deepEqual(withD12CardVideo(cards, INTRO, 'bad', 'javascript:alert(1)'), { error: 'link' });
  saveInstructorD12Cards(cards, storage, 'owner');
  const loaded = loadInstructorD12Cards(storage, 'owner').find((card) => card.id === INTRO)!;
  assert.equal(loaded.notes, 'Keep it under two minutes.');
  assert.deepEqual(loaded.videos, [{ title: 'Warm-up talk', href: 'https://example.com/talk' }]);
  assert.equal(storage.map.get(INSTRUCTOR_D12_STORAGE_KEY), scoresRaw);
  assert.equal(storage.map.has(INSTRUCTOR_D12_LINKS_STORAGE_KEY), false);
  const cleared = withoutD12CardVideo(withD12CardNotes(cards, INTRO, ''), INTRO, 'https://example.com/talk').find((card) => card.id === INTRO)!;
  assert.equal('notes' in cleared, false);
  assert.equal('videos' in cleared, false);
});
