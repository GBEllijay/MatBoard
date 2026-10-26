import assert from 'node:assert/strict';
import test from 'node:test';
import { FUNDAMENTALS_CATALOG } from './progress/catalog.ts';
import {
  assessmentAreaForMove,
  checkpointForMove,
  checkpointLinkBelts,
  clipsForMove,
  filmsForMove,
  filterFundamentalRows,
  formatFundamentalUpdated,
  fundamentalLevelLabel,
  fundamentalLevelOf,
  moveLinks,
  proficiencySummary,
  sortFundamentalRows,
} from './fundamentals.ts';
import type { FundamentalRow } from './studentEdition.ts';
import { withStarterRubric } from './studentTools.ts';
import { blankStudentReport } from './studentEdition.ts';
import type { JournalClip } from './progress/types.ts';
import type { StudentFilm } from './studentFilm.ts';

function row(partial: Partial<FundamentalRow> & Pick<FundamentalRow, 'label' | 'level'>): FundamentalRow {
  return {
    entryId: partial.entryId ?? '',
    catalogItemId: partial.catalogItemId ?? '',
    categoryId: partial.categoryId ?? 'sweeps',
    name: partial.name ?? partial.label,
    label: partial.label,
    learnedOn: partial.learnedOn ?? '',
    level: partial.level,
    note: partial.note ?? '',
    updatedAt: partial.updatedAt ?? 0,
    custom: partial.custom ?? false,
  };
}

test('kids level words use the same 0 to 5 scale', () => {
  assert.equal(fundamentalLevelLabel(0), 'Not started');
  assert.equal(fundamentalLevelLabel(3), 'Live with resistance');
  assert.equal(fundamentalLevelLabel(0, 'kids'), 'Not yet');
  assert.equal(fundamentalLevelLabel(1, 'kids'), 'Meeting it');
  assert.equal(fundamentalLevelLabel(2, 'kids'), 'Practicing it');
  assert.equal(fundamentalLevelLabel(3, 'kids'), 'Playing it');
  assert.equal(fundamentalLevelLabel(4, 'kids'), 'Showing it');
  assert.equal(fundamentalLevelLabel(5, 'kids'), 'Teaching it');
});

test('a missing level follows the old yes or no mark', () => {
  assert.equal(fundamentalLevelOf({ learnedOn: '2026-10-11' }), 3);
  assert.equal(fundamentalLevelOf({ learnedOn: '' }), 0);
  assert.equal(fundamentalLevelOf({ level: 0, learnedOn: '2026-10-11' }), 0);
  assert.equal(fundamentalLevelOf({ level: 5, learnedOn: '' }), 5);
  assert.equal(fundamentalLevelOf({ level: 9, learnedOn: '2026-10-11' }), 3);
});

test('summary, sort, and filter stay on the saved levels', () => {
  const items = [
    row({ label: 'Scissor sweep', level: 4, updatedAt: 10, catalogItemId: 'sweep.scissor' }),
    row({ label: 'Hip bump sweep', level: 0, updatedAt: 0, catalogItemId: 'sweep.hip-bump' }),
    row({ label: 'Pendulum sweep', level: 2, updatedAt: 30, catalogItemId: 'sweep.pendulum' }),
  ];
  const summary = proficiencySummary(items);
  assert.equal(summary.moves, 3);
  assert.equal(summary.live, 1);
  assert.equal(summary.started, 2);
  assert.equal(summary.average, 2);
  assert.deepEqual(sortFundamentalRows(items, 'weakest').map((item) => item.label), [
    'Hip bump sweep',
    'Pendulum sweep',
    'Scissor sweep',
  ]);
  assert.deepEqual(sortFundamentalRows(items, 'recent').map((item) => item.label), [
    'Pendulum sweep',
    'Scissor sweep',
    'Hip bump sweep',
  ]);
  assert.deepEqual(sortFundamentalRows(items, 'list').map((item) => item.label), [
    'Scissor sweep',
    'Hip bump sweep',
    'Pendulum sweep',
  ]);
  assert.deepEqual(filterFundamentalRows(items, 'live').map((item) => item.label), ['Scissor sweep']);
  assert.deepEqual(filterFundamentalRows(items, 'not-started').map((item) => item.label), ['Hip bump sweep']);
  assert.deepEqual(filterFundamentalRows(items, 'in-progress').map((item) => item.label), ['Pendulum sweep']);
  assert.equal(formatFundamentalUpdated(0), '');
  assert.equal(formatFundamentalUpdated(Date.parse('2026-10-11T12:00:00')), '2026-10-11');
});

test('moves link to a checkpoint, a self-assessment area, and a matching clip', () => {
  const report = withStarterRubric(blankStudentReport(10), 10);
  const checkpoint = checkpointForMove(report.rubric.levels, 'sweep.scissor', 'white');
  assert.equal(checkpoint?.checkpointId, 'checkpoint.white.s1-guard-attack');
  const backEscape = checkpointForMove(report.rubric.levels, 'escape.back', 'white');
  assert.equal(backEscape?.checkpointId, 'checkpoint.white.s2-back');
  assert.equal(backEscape?.checkpointName, 'Back escape');
  assert.equal(assessmentAreaForMove('sweeps', 'Scissor sweep'), 'guard');
  assert.equal(assessmentAreaForMove('positions', 'Closed guard'), 'guard');
  assert.equal(assessmentAreaForMove('positions', 'Mount'), '');
  assert.equal(assessmentAreaForMove('passes', 'Knee slice pass'), 'passing');

  const clips: JournalClip[] = [
    { id: 'clip-scissor', url: 'https://example.com/scissor', description: 'Scissor sweep detail', note: '', createdAt: 1, updatedAt: 1 },
    { id: 'clip-other', url: 'https://example.com/other', description: 'Armbar', note: '', createdAt: 2, updatedAt: 2 },
  ];
  assert.deepEqual(clipsForMove(clips, 'Scissor sweep', 'Scissor sweep').map((clip) => clip.id), ['clip-scissor']);
  const films: StudentFilm[] = [
    {
      id: 'film-1',
      fileName: 'scissor.mp4',
      date: '2026-10-11',
      technique: 'Hip bump sweep',
      note: '',
      mime: 'video/mp4',
      size: 10,
      createdAt: 1,
      updatedAt: 1,
      where: 'phone',
      provider: '',
      driveFileId: '',
      dateFolder: '2026-10-11',
    },
  ];
  assert.equal(filmsForMove(films, 'Hip bump sweep', 'Hip bump sweep')[0]?.id, 'film-1');
  const links = moveLinks({
    item: { catalogItemId: 'sweep.scissor', categoryId: 'sweeps', label: 'Scissor sweep', name: 'Scissor sweep' },
    levels: report.rubric.levels,
    belt: 'white',
    clips,
    films,
    to: (path) => path,
  });
  assert.deepEqual(links.map((link) => link.href), [
    '/student/self-assessment?from=fundamentals#assess-guard',
    '/student/rubric#checkpoint.white.s1-guard-attack',
    '/student/videos#clip-clip-scissor',
  ]);
  assert.deepEqual(links.map((link) => link.label), [
    'Open: Guard self-assessment',
    'Open: From closed guard, perform one sweep and one submission in drilling. benchmark',
    'Open: Scissor sweep detail in Video Library',
  ]);
  const openGuard = moveLinks({
    item: { catalogItemId: 'pos.open-guard', categoryId: 'positions', label: 'Open guard', name: 'Open guard' },
    levels: report.rubric.levels,
    belt: 'purple',
    clips: [],
    films: [],
    to: (path) => path,
  });
  assert.deepEqual(openGuard.map((link) => link.label), [
    'Open: Guard self-assessment',
    'Open: Keep your guard from being passed, and get it back when you are passed. benchmark',
  ]);
  const filmed = moveLinks({
    item: { catalogItemId: 'sweep.hip-bump', categoryId: 'sweeps', label: 'Hip bump sweep', name: 'Hip bump sweep' },
    levels: report.rubric.levels,
    belt: 'white',
    clips: [],
    films,
    to: (path) => path,
  });
  assert.equal(filmed.some((link) => link.label === 'Open: Hip bump sweep in Video Library'), true);
});

test('checkpoint links stay on the belt being worn or the next belt', () => {
  const report = withStarterRubric(blankStudentReport(10), 10);
  const levels = report.rubric.levels;
  const belts = ['white', 'blue', 'purple', 'brown', 'black', 'grey', 'yellow', 'orange', 'green', 'coral', 'redWhite', 'red'];
  for (const belt of belts) {
    const allowed = new Set(checkpointLinkBelts(belt));
    for (const category of FUNDAMENTALS_CATALOG.categories) {
      for (const item of category.items) {
        const hit = checkpointForMove(levels, item.id, belt);
        if (!hit) continue;
        assert.ok(allowed.has(hit.belt), `${belt} ${item.id} opened ${hit.belt}`);
        assert.equal(hit.checkpointId.includes(`.${hit.belt}.`), true);
      }
    }
  }
  assert.equal(checkpointForMove(levels, 'sweep.scissor', 'white')?.checkpointId, 'checkpoint.white.s1-guard-attack');
  assert.equal(checkpointForMove(levels, 'pos.half-guard', 'white')?.checkpointId, 'checkpoint.white.s2-guards');
  assert.equal(checkpointForMove(levels, 'sub.kimura', 'white')?.belt, 'white');
  assert.equal(checkpointForMove(levels, 'pos.back-control', 'white')?.checkpointId, 'checkpoint.white.s1-positions');
  assert.equal(checkpointForMove(levels, 'sub.rear-naked-choke', 'white')?.checkpointId, 'checkpoint.white.s4-back-choke');
  assert.equal(checkpointForMove(levels, 'pass.leg-drag', 'white')?.checkpointId, 'checkpoint.blue.promo-pass');
  assert.equal(checkpointForMove(levels, 'pos.turtle', 'white')?.checkpointId, 'checkpoint.blue.s1-turtle');
  assert.equal(checkpointForMove(levels, 'td.double-leg', 'white')?.checkpointId, 'checkpoint.white.s4-single');
  assert.equal(checkpointForMove(levels, 'sub.rear-naked-choke', 'blue')?.checkpointId, 'checkpoint.blue.s4-back');
  assert.equal(checkpointForMove(levels, 'pos.closed-guard', 'blue')?.checkpointId, 'checkpoint.blue.promo-guard');
  assert.equal(checkpointForMove(levels, 'pos.mount', 'purple')?.checkpointId, 'checkpoint.purple.s2-pins');
  assert.equal(checkpointForMove(levels, 'escape.back', 'white')?.checkpointId, 'checkpoint.white.s2-back');
  assert.equal(checkpointForMove(levels, 'escape.back', 'blue')?.checkpointId, 'checkpoint.blue.s1-escapes');
  assert.equal(checkpointForMove(levels, 'escape.back', 'white')?.checkpointName, 'Back escape');
  assert.equal(checkpointForMove(levels, 'td.double-leg', 'green')?.checkpointId, 'checkpoint.green.takedowns');
  assert.equal(checkpointForMove(levels, 'td.double-leg', 'grey'), null);
});
