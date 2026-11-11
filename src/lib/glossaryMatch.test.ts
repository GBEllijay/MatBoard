import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { d8Catalog } from '../indexCards/catalog.ts';
import { GLOSSARY } from './glossary.ts';
import { GLOSSARY_ROWS } from './glossaryData.ts';
import { emptyAdditions, myMoveNames, recordAddition } from './glossaryAdditions.ts';
import { INDEX_CARDS_STORAGE_KEY, emptyIndexCards, loadIndexCards, termIdFor, withCardEdit, withCustomCard, writeIndexCards } from './indexCards.ts';
import { resolveGlossaryCard } from './glossaryCards.ts';
import {
  GLOSSARY_DEBOUNCE_MS,
  GLOSSARY_MIN_CHARS,
  activeGlossaryQuery,
  glossaryTermById,
  glossaryTerms,
  hiddenGlossaryTerms,
  insertGlossaryTerm,
  matchGlossary,
  myGlossaryNames,
} from './glossaryMatch.ts';
import { bindStudentProfileStorage, isPerStudentStorageKey, studentProfileStorageKey } from './studentProfiles.ts';
import { blankStudentReport } from './studentEdition.ts';
import { setBeltMode } from './beltBook.ts';

const names = (query: string, options = {}) => matchGlossary(query, options).map((hit) => hit.term.name);

test('the suggestion pool is the PR 500 core glossary, not the old 56-name list', () => {
  const terms = glossaryTerms();
  assert.equal(terms.length, GLOSSARY.length);
  assert.equal(terms.length, GLOSSARY_ROWS.length);
  assert.equal(terms.length, 245);
  assert.deepEqual(
    terms.map((term) => term.name),
    GLOSSARY.map((term) => term.term),
  );
  for (const term of terms) assert.equal(term.source, 'glossary');
  const pool = new Set(terms.map((term) => term.name));
  // None of these were in the 56 fundamentals + D8 names PR 486 used.
  for (const name of ['Berimbolo', 'De La Riva guard', 'Gogoplata', 'Calf slicer', 'Anaconda choke', 'Uchi mata']) {
    assert.ok(pool.has(name), name);
  }
  assert.equal(existsSync(new URL('./glossarySource.ts', import.meta.url)), false, 'the old word list is gone');
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.equal(/glossaryMatch|GlossaryField/.test(app), false, 'no glossary screen or route');
  const field = readFileSync(new URL('../glossary/GlossaryField.tsx', import.meta.url), 'utf8');
  assert.equal(field.includes('<Route'), false);
  assert.equal(/fetch\(|coachSync|studentToCoach|inbox/i.test(field), false, 'nothing is sent off the phone');
});

test('every D8 line is linked from the glossary the same way PR 500 tags a card', () => {
  const linked = new Set(glossaryTerms().map((term) => term.cardId).filter(Boolean));
  for (const line of d8Catalog()) assert.ok(linked.has(line.id), line.id);
  assert.equal(glossaryTermById('sub.kimura')?.name, 'Kimura');
  assert.equal(glossaryTermById('Kimura')?.cardId, 'sub.kimura');
  assert.equal(glossaryTermById('Mata Leão')?.name, 'Rear naked choke');
});

test('prefix, alias, and light fuzzy matching', () => {
  assert.equal(GLOSSARY_MIN_CHARS, 3);
  assert.ok(GLOSSARY_DEBOUNCE_MS >= 300);
  assert.deepEqual(names('ki'), []);
  assert.deepEqual(names('bar'), []);
  assert.deepEqual(names('zzzzzz'), []);

  const kimura = matchGlossary('kimura');
  assert.equal(kimura[0]?.term.name, 'Kimura');
  assert.equal(kimura[0]?.via, 'name');
  assert.equal(kimura[0]?.term.cardId, 'sub.kimura');

  for (const typed of ['armbar', 'arm bar', 'arm-bar', 'ARMBAR']) {
    assert.equal(names(typed)[0], 'Armbar', typed);
  }
  assert.equal(matchGlossary('arm bar')[0]?.term.cardId, 'sub.armbar-mount');

  const juji = matchGlossary('juji gatame');
  assert.equal(juji[0]?.term.name, 'Armbar');
  assert.equal(juji[0]?.via, 'alias');
  assert.equal(juji[0]?.matchedOn, 'Juji gatame');

  const triangle = matchGlossary('triangle');
  assert.equal(triangle[0]?.term.name, 'Triangle choke');
  assert.equal(triangle[0]?.via, 'alias');
  assert.equal(triangle[0]?.matchedOn, 'Triangle');

  const fuzzy = matchGlossary('kimmura');
  assert.equal(fuzzy[0]?.term.name, 'Kimura');
  assert.equal(fuzzy[0]?.via, 'fuzzy');
  assert.equal(matchGlossary('omoplatta')[0]?.term.name, 'Omoplata');
  // Fuzzy needs five letters and the same first three.
  assert.deepEqual(names('kimra').includes('Kimura'), true);
  assert.equal(names('jimura').includes('Kimura'), false);

  assert.equal(names('berimbolo')[0], 'Berimbolo');
  assert.equal(names('de la riva')[0], 'De La Riva guard');
});

test('matching the larger list stays fast', () => {
  matchGlossary('kimmura');
  const started = performance.now();
  for (let i = 0; i < 500; i += 1) matchGlossary(i % 2 ? 'kimmura' : 'de la riva');
  const each = (performance.now() - started) / 500;
  assert.ok(each < 5, `took ${each.toFixed(2)}ms a query`);
});

test('a trailing space does not keep suggesting, and the canonical name replaces the span', () => {
  const typed = 'worked an arm bar';
  assert.equal(activeGlossaryQuery(`${typed} `, typed.length + 1), null);
  const live = activeGlossaryQuery(typed, typed.length);
  assert.equal(live?.query, 'arm bar');
  assert.equal(live?.matches[0]?.term.name, 'Armbar');
  const next = insertGlossaryTerm(typed, live!, 'Armbar');
  assert.equal(next.text, 'worked an Armbar');
  assert.equal(next.caret, next.text.length);

  const middle = 'hit a kimmura then reset';
  const caret = 'hit a kimmura'.length;
  const span = activeGlossaryQuery(middle, caret);
  assert.equal(span?.matches[0]?.term.name, 'Kimura');
  assert.equal(insertGlossaryTerm(middle, span!, 'Kimura').text, 'hit a Kimura then reset');

  assert.equal(activeGlossaryQuery('ki', 2), null);
});

test('tagging opens the existing index card and does not create a second one', () => {
  const kimura = glossaryTermById('sub.kimura');
  assert.ok(kimura);
  const catalog = d8Catalog();
  const first = resolveGlossaryCard(kimura!, catalog, emptyIndexCards());
  if ('error' in first) assert.fail('kimura should already be a card');
  assert.equal(first.created, false);
  assert.equal(first.id, 'sub.kimura');
  assert.equal(first.file.cards.length, 0);
  const again = resolveGlossaryCard(kimura!, catalog, first.file);
  if ('error' in again) assert.fail('second lookup failed');
  assert.equal(again.created, false);
  assert.equal(again.id, first.id);

  const armbar = glossaryTermById('Armbar');
  const opened = resolveGlossaryCard(armbar!, catalog, emptyIndexCards());
  if ('error' in opened) assert.fail('armbar lookup failed');
  assert.equal(opened.id, 'sub.armbar-mount');
});

test('a glossary move with no card is created once and the next tag reuses it', () => {
  const guillotine = glossaryTermById('Guillotine');
  assert.ok(guillotine);
  assert.equal(guillotine?.cardId, null);
  const catalog = d8Catalog();
  const created = resolveGlossaryCard(guillotine!, catalog, emptyIndexCards());
  if (!('file' in created) || created.created !== true) assert.fail('expected a new card');
  assert.equal(created.file.cards.length, 1);
  assert.equal(created.file.cards[0]?.name, 'Guillotine');
  assert.equal(created.file.cards[0]?.faceId, 'submissions');
  assert.equal(created.id, 'term.guillotine');
  const reused = resolveGlossaryCard(guillotine!, catalog, created.file);
  if ('error' in reused) assert.fail('reuse failed');
  assert.equal(reused.created, false);
  assert.equal(reused.id, created.id);
  assert.equal(reused.file.cards.length, 1);
  // Typing the alias later still finds the same card.
  const viaAlias = matchGlossary('high-elbow guillotine')[0]?.term;
  assert.equal(viaAlias?.name, 'Guillotine');
  const aliasHit = resolveGlossaryCard(viaAlias!, catalog, created.file);
  if ('error' in aliasHit) assert.fail('alias lookup failed');
  assert.equal(aliasHit.id, created.id);
});

test('a glossary move the student renamed opens their renamed card', () => {
  const catalog = d8Catalog();
  const made = withCustomCard(catalog, emptyIndexCards(), 'submissions', 'Guillotine', 3);
  if ('error' in made) assert.fail('setup failed');
  const renamed = withCardEdit(catalog, made.file, made.id, { name: 'Mr. Guillotine', faceId: 'submissions' });
  if ('error' in renamed) assert.fail('rename failed');
  const pool = recordAddition(emptyAdditions(), { name: 'Mr. Guillotine', faceId: 'submissions', from: 'Guillotine', now: 1 });
  const hit = resolveGlossaryCard(glossaryTermById('Guillotine')!, catalog, renamed.file, pool.additions);
  if ('error' in hit) assert.fail('lookup failed');
  assert.equal(hit.created, false);
  assert.equal(hit.id, made.id);
  assert.equal(renamed.file.cards.length, 1);
});

test('the student’s own moves are offered after core names and link to their card', () => {
  const catalog = d8Catalog();
  const made = withCustomCard(catalog, emptyIndexCards(), 'guard-control', 'Kimchi guard', 3);
  if ('error' in made) assert.fail('setup failed');
  const pool = recordAddition(emptyAdditions(), { name: 'Kimchi guard', faceId: 'guard-control', now: 1 });
  const mine = myGlossaryNames(myMoveNames(pool), made.file);
  assert.deepEqual(mine, [{ name: 'Kimchi guard', faceId: 'guard-control' }]);
  assert.deepEqual(myGlossaryNames([{ name: 'kimura', faceId: 'submissions' }]), [], 'glossary words are not duplicated');
  const hits = matchGlossary('kim', { extra: mine });
  assert.equal(hits[0]?.term.name, 'Kimura');
  const own = hits.find((hit) => hit.term.name === 'Kimchi guard');
  assert.equal(own?.term.source, 'mine');
  const open = resolveGlossaryCard(own!.term, catalog, made.file, pool.additions);
  if ('error' in open) assert.fail('lookup failed');
  assert.equal(open.created, false);
  assert.equal(open.id, made.id);
});

test('index cards stay on the active family profile', () => {
  assert.equal(isPerStudentStorageKey(INDEX_CARDS_STORAGE_KEY), true);
  assert.equal(INDEX_CARDS_STORAGE_KEY, 'matboard.studentEdition.indexCards.v1');
  const other = 'pprofiletest1';
  assert.notEqual(studentProfileStorageKey('default', INDEX_CARDS_STORAGE_KEY), studentProfileStorageKey(other, INDEX_CARDS_STORAGE_KEY));
  const created = resolveGlossaryCard(glossaryTermById('Guillotine')!, d8Catalog(), emptyIndexCards());
  if (!('file' in created) || created.created !== true) assert.fail('expected a card to store');
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  writeIndexCards(bindStudentProfileStorage(storage, 'default'), created.file);
  assert.equal(loadIndexCards(bindStudentProfileStorage(storage, other)).cards.length, 0);
  assert.equal(loadIndexCards(bindStudentProfileStorage(storage, 'default')).cards[0]?.id, created.id);
  assert.equal(termIdFor(d8Catalog(), loadIndexCards(bindStudentProfileStorage(storage, 'default')), 'Guillotine'), created.id);
});

test('age-policy moves are left out of suggestions', () => {
  assert.ok(names('straight ankle').includes('Straight ankle lock'));
  assert.ok(names('heel hook').includes('Heel hook'));

  const hidden = matchGlossary('straight ankle', { blockedIds: ['sub.straight-ankle-lock'], blockedNames: ['Straight ankle lock'] });
  assert.equal(hidden.some((hit) => hit.term.name === 'Straight ankle lock'), false);

  const kid = setBeltMode(blankStudentReport(1), 'kids', 2);
  const policy = hiddenGlossaryTerms(kid);
  for (const name of ['Straight ankle lock', 'Wristlock', 'Heel hook', 'Kneebar', 'Toe hold', 'Calf slicer', 'Leg Lock']) {
    assert.ok(policy.names.includes(name), name);
  }
  const blocked = { blockedNames: policy.names, blockedIds: policy.ids };
  assert.equal(names('straight ankle', blocked).includes('Straight ankle lock'), false);
  assert.equal(names('wrist lock', blocked).includes('Wristlock'), false);
  assert.equal(names('heel hook', blocked).includes('Heel hook'), false);
  assert.equal(names('kneebar', blocked).includes('Kneebar'), false);
  // Kimura has the alias "Double wristlock" but is not a wrist lock.
  assert.ok(names('kimura', blocked).includes('Kimura'));
  assert.ok(names('armbar', blocked).includes('Armbar'));
  const adult = hiddenGlossaryTerms(blankStudentReport(1));
  assert.ok(names('straight ankle', { blockedNames: adult.names, blockedIds: adult.ids }).includes('Straight ankle lock'));
});
