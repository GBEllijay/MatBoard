import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  HISTORICAL_MASTERS,
  academyMonogram,
  collapsedAncestorIndices,
  displayLineageSteps,
  formatFoundedDate,
  founderInitials,
  inferBelt,
  parseFounders,
  parseLineage,
  parseLineageNames,
  remainingStepSlots,
  searchMasters,
  serializeLineage,
  shouldReverseToRootFirst,
  suggestAncestors,
} from './academyIdentity.ts';

test('parseFounders splits commas, ampersands, and and, and keeps a single name intact', () => {
  assert.deepEqual(
    parseFounders('Justin Guise, Paige').map((row) => row.name),
    ['Justin Guise', 'Paige'],
  );
  assert.deepEqual(
    parseFounders('Marcus Reid, Elena Vance').map((row) => [row.name, row.initials]),
    [
      ['Marcus Reid', 'MR'],
      ['Elena Vance', 'EV'],
    ],
  );
  assert.deepEqual(parseFounders('Ana and Luis').map((row) => row.name), ['Ana', 'Luis']);
  assert.deepEqual(parseFounders('Ana & Luis').map((row) => row.name), ['Ana', 'Luis']);
  assert.deepEqual(parseFounders('Ana  Luis').map((row) => row.name), ['Ana  Luis']);
  assert.deepEqual(parseFounders('  Paige  ').map((row) => row.name), ['Paige']);
  assert.deepEqual(parseFounders(''), []);
  assert.deepEqual(parseFounders('   '), []);
  assert.equal(founderInitials('Paige'), 'P');
  assert.equal(founderInitials('Justin Guise'), 'JG');
});

test('formatFoundedDate turns a valid ISO date into a clean label and rejects junk', () => {
  assert.deepEqual(formatFoundedDate('2019-09-01'), {
    year: '2019',
    longLabel: 'Founded Sep 1, 2019',
    estLabel: 'Est. 2019',
  });
  assert.equal(formatFoundedDate('2019-09-01T00:00:00Z'), null);
  assert.equal(formatFoundedDate('yesterday'), null);
  assert.equal(formatFoundedDate('2019-13-40'), null);
  assert.equal(formatFoundedDate('2019-02-29'), null);
  assert.equal(formatFoundedDate('2020-02-29')?.year, '2020');
});

test('parseLineage keeps comma, newline, and arrow lists with zero name loss', () => {
  const owner = 'Professor Fabio Costa,\nGrand Master Carlos Gracie Jr.,\nGrand Master Helio Gracie,\nGrand Master Carlos Gracie Sr.';
  const steps = parseLineage(owner);
  assert.deepEqual(
    steps.map((step) => `${step.title}|${step.name}|${step.belt}`),
    [
      'Professor|Fabio Costa|black',
      'Grand Master|Carlos Gracie Jr.|coral',
      'Grand Master|Helio Gracie|red',
      'Grand Master|Carlos Gracie Sr.|red',
    ],
  );
  assert.equal(shouldReverseToRootFirst(steps), true);
  assert.deepEqual(
    displayLineageSteps(steps).map((step) => step.name),
    ['Carlos Gracie Sr.', 'Helio Gracie', 'Carlos Gracie Jr.', 'Fabio Costa'],
  );

  assert.deepEqual(parseLineageNames('A > B > C'), ['A', 'B', 'C']);
  assert.deepEqual(parseLineageNames('A → B → C'), ['A', 'B', 'C']);
  assert.deepEqual(
    parseLineageNames('Founded under Teacher A.\nThat teacher under Teacher B.'),
    ['Founded under Teacher A.', 'That teacher under Teacher B.'],
  );
  const prose = parseLineage('Founded under Teacher A.\nThat teacher under Teacher B.');
  assert.equal(prose[0]?.name, 'Founded under Teacher A.');
  assert.equal(prose[0]?.belt, 'navy');
  assert.equal(serializeLineage(steps), 'Professor Fabio Costa,\nGrand Master Carlos Gracie Jr.,\nGrand Master Helio Gracie,\nGrand Master Carlos Gracie Sr.');
});

test('belt colors follow the illustrative rules, with named masters winning over a typed title', () => {
  assert.equal(inferBelt('Carlos Gracie Sr.', 'Master'), 'red');
  assert.equal(inferBelt('Helio Gracie', 'Professor'), 'red');
  assert.equal(inferBelt('Carlos Gracie Jr.', 'Grand Master'), 'coral');
  assert.equal(inferBelt('Daniel Souza', 'Professor'), 'black');
  assert.equal(inferBelt('Teacher A', ''), 'navy');
});

test('long chains collapse the middle and expand back to every ancestor', () => {
  const closed = collapsedAncestorIndices(17, false);
  assert.equal(closed.hidden, 14);
  assert.deepEqual(closed.visible, [0, 1, 16]);
  const open = collapsedAncestorIndices(17, true);
  assert.equal(open.hidden, 0);
  assert.equal(open.visible.length, 17);
  assert.deepEqual(collapsedAncestorIndices(6, false), { hidden: 0, visible: [0, 1, 2, 3, 4, 5] });
  assert.equal(collapsedAncestorIndices(7, false).hidden, 4);
});

test('typeahead finds Helio Gracie from Hell and never mentions a franchise or a source link', () => {
  const hits = searchMasters('Hell');
  assert.equal(hits[0]?.name, 'Helio Gracie');
  assert.match(hits[0]?.teacherNote ?? '', /student of Carlos Gracie Sr/);
  assert.ok(searchMasters('carlos gracie jr').some((row) => row.name === 'Carlos Gracie Jr.'));
  assert.deepEqual(searchMasters('x'), []);
  const source = readFileSync(new URL('./academyIdentity.ts', import.meta.url), 'utf8');
  assert.equal(/gracie\s*barra/i.test(source), false);
  assert.equal(/bjjheroes\.com|gracieuniversity|family tree/i.test(source), false);
  assert.equal(HISTORICAL_MASTERS.every((row) => !/barra/i.test(row.name) && !/^https?:/i.test(row.teacherNote)), true);
});

test('suggested auto-fill walks up to three teachers and respects the 16-name cap', () => {
  const chain = suggestAncestors('Carlos Gracie Jr.', [], 3);
  assert.deepEqual(
    chain.map((row) => row.name),
    ['Helio Gracie', 'Carlos Gracie Sr.', 'Mitsuyo Maeda'],
  );
  const skipped = suggestAncestors('Carlos Gracie Jr.', ['Helio Gracie'], 3);
  assert.deepEqual(
    skipped.map((row) => row.name),
    ['Carlos Gracie Sr.', 'Mitsuyo Maeda'],
  );
  assert.equal(remainingStepSlots(16), 0);
  assert.equal(remainingStepSlots(14), 2);
  assert.equal(academyMonogram('Valley Ridge Jiu-Jitsu'), 'VRJ');
  assert.equal(academyMonogram('Northridge Jiu-Jitsu'), 'NJJ');
});
