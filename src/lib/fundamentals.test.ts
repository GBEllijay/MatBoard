import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessmentAreaForMove,
  checkpointForMove,
  clipsForMove,
  filmsForMove,
  filterFundamentalRows,
  formatFundamentalUpdated,
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
  assert.equal(checkpoint?.checkpointId, 'checkpoint.white.guard');
  assert.equal(checkpointForMove(report.rubric.levels, 'escape.back', 'white'), null);
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
    '/student/competitor#assess-guard',
    '/student/rubric#checkpoint.white.guard',
    '/student/videos#clip-clip-scissor',
  ]);
});
