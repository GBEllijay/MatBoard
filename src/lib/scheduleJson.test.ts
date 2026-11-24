import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CLASS_LEVELS, normalizeGymCalendar, type GymCalendarState } from './gymCalendar.ts';
import {
  describeClassLevels,
  importScheduleJson,
  looksLikeScheduleJson,
  SCHEDULE_JSON_FORMAT,
  serializeScheduleJson,
} from './scheduleJson.ts';
import { importScheduleCsv, serializeScheduleCsv } from './scheduleCsv.ts';

function sampleBoard(): GymCalendarState {
  return normalizeGymCalendar({
    title: 'Sample Academy',
    qrUrl: 'https://example.com/join',
    notes: 'Closed Thursday for the holiday.',
    template: 'monthly',
    castEnabled: false,
    classes: CLASS_LEVELS.map((level, index) => ({
      id: `class-${level}`,
      day: 'tue',
      time: `${String(10 + index).padStart(2, '0')}:00`,
      title: `Class ${index + 1}`,
      location: index % 2 ? 'MAT 2' : 'MAT 1',
      subtitle: index ? `Detail ${index}` : '',
      level,
    })),
    specials: [{ id: 'sp1', date: '2026-12-24', title: 'Holiday open mat', body: 'All levels' }],
  });
}

describe('Class Schedule JSON export and import', () => {
  it('round-trips every field, including every belt level', () => {
    const board = sampleBoard();
    const text = serializeScheduleJson(board, new Date('2026-11-24T17:00:00Z'));
    const file = JSON.parse(text);
    assert.equal(file.format, SCHEDULE_JSON_FORMAT);
    assert.equal(file.version, 1);
    assert.equal(file.exportedAt, '2026-11-24T17:00:00.000Z');
    assert.deepEqual(
      file.schedule.classes.map((row: { level: string }) => row.level),
      [...CLASS_LEVELS],
    );
    const back = importScheduleJson(text);
    assert.equal(back.error, undefined);
    assert.equal(back.mode, 'replace-board');
    assert.equal(back.classCount, CLASS_LEVELS.length);
    assert.equal(back.specialCount, 1);
    assert.deepEqual(back.payload?.classes, board.classes);
    assert.deepEqual(back.payload?.specials, board.specials);
    assert.equal(back.payload?.title, 'Sample Academy');
    assert.equal(back.payload?.qrUrl, 'https://example.com/join');
    assert.equal(back.payload?.notes, 'Closed Thursday for the holiday.');
    assert.equal(back.payload?.template, 'monthly');
    assert.equal(back.payload?.castEnabled, false);
  });

  it('the CSV export also keeps the level of every class', () => {
    const board = sampleBoard();
    const back = importScheduleCsv(serializeScheduleCsv(board));
    assert.deepEqual(
      back.payload?.classes.map((row) => row.level),
      board.classes.map((row) => row.level),
    );
  });

  it('accepts a raw saved board and refuses files that are not a schedule', () => {
    const raw = importScheduleJson(JSON.stringify({ classes: [{ id: 'x', day: 'fri', time: '18:00', title: 'Blue Belt Gi', level: 'Advanced' }] }));
    assert.equal(raw.payload?.classes[0]?.level, 'advanced');
    assert.equal(raw.payload?.title, null, 'a file without a title leaves the gym name alone');

    assert.match(importScheduleJson('not json').error ?? '', /not valid JSON/);
    assert.match(importScheduleJson('[]').error ?? '', /not an Advantage class schedule/);
    assert.match(importScheduleJson(JSON.stringify({ format: 'something-else', schedule: { classes: [] } })).error ?? '', /not an Advantage/);
    assert.match(importScheduleJson(JSON.stringify({ format: SCHEDULE_JSON_FORMAT, version: 99, schedule: { classes: [] } })).error ?? '', /newer version/);
    assert.match(importScheduleJson(JSON.stringify({ format: SCHEDULE_JSON_FORMAT, version: 1, schedule: {} })).error ?? '', /no class list/);
    assert.match(importScheduleJson(JSON.stringify({ classes: [{ day: 'someday', title: 'x' }] })).error ?? '', /No classes/);
    const many = { classes: Array.from({ length: 401 }, (_, index) => ({ id: `c${index}`, day: 'mon', time: '06:00', title: 'x' })) };
    assert.match(importScheduleJson(JSON.stringify(many)).error ?? '', /more classes/);
  });

  it('counts rows it will skip and an unknown level reads as No level', () => {
    const result = importScheduleJson(
      JSON.stringify({
        format: SCHEDULE_JSON_FORMAT,
        version: 1,
        schedule: {
          classes: [
            { id: 'a', day: 'mon', time: '17:00', title: 'Kids', level: 'kids' },
            { id: 'b', day: 'mon', time: '18:00', title: 'Seminar', level: 'purple-belt-only' },
            { id: 'c', day: 'nope', time: '18:00', title: 'Broken' },
          ],
        },
      }),
    );
    assert.equal(result.classCount, 2);
    assert.equal(result.skipped, 1);
    assert.deepEqual(result.payload?.classes.map((row) => row.level), ['kids', 'none']);
    assert.equal(describeClassLevels(result.payload!.classes), 'Levels: 1 Kids All Levels, 1 No level.');
  });

  it('routes .json files and JSON text to the JSON reader', () => {
    assert.equal(looksLikeScheduleJson({ name: 'advantage-class-schedule.json' }), true);
    assert.equal(looksLikeScheduleJson({ name: 'backup.csv', type: 'text/csv' }, 'Record,Day'), false);
    assert.equal(looksLikeScheduleJson({ name: 'download', type: '' }, '\uFEFF  {"classes": []}'), true);
  });
});
