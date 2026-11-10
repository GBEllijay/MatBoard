import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { d8Catalog } from '../indexCards/catalog.ts';
import { INDEX_CARDS_STORAGE_KEY, emptyIndexCards, loadIndexCards, termIdFor, writeIndexCards } from './indexCards.ts';
import { resolveGlossaryCard } from './glossaryCards.ts';
import {
  GLOSSARY_DEBOUNCE_MS,
  GLOSSARY_MIN_CHARS,
  activeGlossaryQuery,
  insertGlossaryTerm,
  matchGlossary,
} from './glossaryMatch.ts';
import { GLOSSARY_SOURCE_LIMIT, glossaryReviewNotes, glossaryTermById, glossaryTerms } from './glossarySource.ts';
import { bindStudentProfileStorage, isPerStudentStorageKey, studentProfileStorageKey } from './studentProfiles.ts';

test('the merged outside glossary is not the source', () => {
  const terms = glossaryTerms();
  assert.ok(terms.length > 40 && terms.length < 120, `expected the in-repo lists, got ${terms.length}`);
  assert.equal(terms.some((term) => /berimbolo|de la riva|worm guard/i.test(term.name)), false);
  assert.equal(GLOSSARY_SOURCE_LIMIT.includes('385'), true);
  const source = readFileSync(new URL('./glossarySource.ts', import.meta.url), 'utf8');
  assert.equal(/wikipedia|ibjjf\.com|digitsu\.com|kingz\.com/i.test(source), false);
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.equal(/glossary/i.test(app), false);
  const field = readFileSync(new URL('../glossary/GlossaryField.tsx', import.meta.url), 'utf8');
  assert.equal(field.includes('glossaryTerms'), false);
  assert.equal(field.includes('<Route'), false);
});

test('prefix, alias, and light fuzzy matching', () => {
  assert.equal(GLOSSARY_MIN_CHARS, 3);
  assert.ok(GLOSSARY_DEBOUNCE_MS >= 300);
  assert.deepEqual(matchGlossary('ki').map((hit) => hit.term.name), []);
  assert.deepEqual(matchGlossary('bar').map((hit) => hit.term.name), []);
  assert.deepEqual(matchGlossary('kimono').map((hit) => hit.term.name), []);
  assert.deepEqual(matchGlossary('berimbolo').map((hit) => hit.term.name), []);
  assert.deepEqual(matchGlossary('de la riva').map((hit) => hit.term.name), []);

  const kimura = matchGlossary('kimura');
  assert.deepEqual(kimura.map((hit) => hit.term.name), ['Kimura']);
  assert.equal(kimura[0]?.via, 'name');
  assert.equal(kimura[0]?.term.cardId, 'sub.kimura');

  for (const typed of ['armbar', 'arm bar', 'arm-bar']) {
    const names = matchGlossary(typed).map((hit) => hit.term.name);
    assert.equal(names[0], 'Armbar from mount', typed);
    assert.ok(names.includes('Armbar from guard'), typed);
  }
  const armbar = matchGlossary('arm bar')[0];
  assert.equal(armbar?.via, 'alias');
  assert.equal(armbar?.matchedOn, 'Armbar');

  const fuzzy = matchGlossary('kimmura');
  assert.equal(fuzzy[0]?.term.name, 'Kimura');
  assert.equal(fuzzy[0]?.via, 'fuzzy');

  const triangle = matchGlossary('triangle');
  assert.equal(triangle[0]?.term.name, 'Triangle choke');
  assert.equal(triangle[0]?.via, 'alias');
  assert.equal(triangle[0]?.matchedOn, 'Triangle');
});

test('a trailing space does not keep suggesting, and the canonical name replaces the span', () => {
  const typed = 'worked an arm bar';
  assert.equal(activeGlossaryQuery(`${typed} `, typed.length + 1), null);
  const live = activeGlossaryQuery(typed, typed.length);
  assert.equal(live?.query, 'arm bar');
  assert.equal(live?.matches[0]?.term.name, 'Armbar from mount');
  const next = insertGlossaryTerm(typed, live!, 'Armbar from mount');
  assert.equal(next.text, 'worked an Armbar from mount');
  assert.equal(next.caret, next.text.length);

  const short = activeGlossaryQuery('ki', 2);
  assert.equal(short, null);
});

test('tagging opens the existing index card and does not create a second one', () => {
  const kimura = glossaryTermById('sub.kimura');
  assert.ok(kimura);
  const catalog = d8Catalog();
  const first = resolveGlossaryCard(kimura!, catalog, emptyIndexCards());
  assert.equal(first.created, false);
  if ('error' in first) assert.fail('kimura should already be a card');
  assert.equal(first.id, 'sub.kimura');
  assert.equal(first.file.cards.length, 0);
  const again = resolveGlossaryCard(kimura!, catalog, first.file);
  assert.equal(again.created, false);
  if ('error' in again) assert.fail('second lookup failed');
  assert.equal(again.id, first.id);
  assert.equal(termIdFor(catalog, again.file, 'Kimura'), 'sub.kimura');
});

test('a fundamentals-only name creates one card and the next tag reuses it', () => {
  const guillotine = glossaryTerms().find((term) => term.name === 'Guillotine');
  assert.ok(guillotine);
  assert.equal(guillotine?.cardId, null);
  const catalog = d8Catalog();
  const created = resolveGlossaryCard(guillotine!, catalog, emptyIndexCards());
  assert.equal(created.created, true);
  if (!('file' in created) || created.created !== true) assert.fail('expected a new card');
  assert.equal(created.file.cards.length, 1);
  assert.equal(created.file.cards[0]?.name, 'Guillotine');
  assert.equal(created.id, 'term.guillotine');
  const reused = resolveGlossaryCard(guillotine!, catalog, created.file);
  assert.equal(reused.created, false);
  if ('error' in reused) assert.fail('reuse failed');
  assert.equal(reused.id, created.id);
  assert.equal(reused.file.cards.length, 1);
});

test('index cards stay on the active family profile', () => {
  assert.equal(isPerStudentStorageKey(INDEX_CARDS_STORAGE_KEY), true);
  const other = 'pprofiletest1';
  assert.notEqual(studentProfileStorageKey('default', INDEX_CARDS_STORAGE_KEY), studentProfileStorageKey(other, INDEX_CARDS_STORAGE_KEY));
  const guillotine = glossaryTerms().find((term) => term.name === 'Guillotine');
  const created = resolveGlossaryCard(guillotine!, d8Catalog(), emptyIndexCards());
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
});

test('age-gated names can be left out of suggestions', () => {
  const open = matchGlossary('straight ankle').map((hit) => hit.term.name);
  assert.ok(open.includes('Straight ankle lock'));
  const hidden = matchGlossary('straight ankle', { blockedIds: ['sub.straight-ankle-lock'] }).map((hit) => hit.term.name);
  assert.equal(hidden.includes('Straight ankle lock'), false);
});

test('review notes call out the source gap and shaky entries', () => {
  const notes = glossaryReviewNotes();
  const text = notes.map((note) => `${note.name}: ${note.note}`).join('\n');
  assert.match(text, /385/);
  assert.match(text, /Top sit/);
  assert.match(text, /sub\.rnc|sub.rnc|D8 card/);
  assert.match(text, /Smash Pass/);
  assert.match(text, /Osoto gari/);
  assert.match(text, /Triangle choke/);
  assert.equal(notes.some((note) => note.id === 'source'), true);
});
