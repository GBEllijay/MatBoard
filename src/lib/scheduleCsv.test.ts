import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultGymCalendar, type GymCalendarState } from './gymCalendar.ts';
import {
  formatScheduleCsvSummary,
  importScheduleCsv,
  importScheduleCsvFile,
  parseClassLevel,
  parseScheduleClock,
  parseScheduleDay,
  scheduleCsvTemplate,
  serializeScheduleCsv,
} from './scheduleCsv.ts';
import { applyScheduleImport, getSchedule } from './scheduleStore.ts';

function board(partial: Partial<GymCalendarState> = {}): GymCalendarState {
  return { ...defaultGymCalendar(), ...partial };
}

describe('parseScheduleClock', () => {
  it('accepts 24-hour and 12-hour gym clocks', () => {
    assert.equal(parseScheduleClock('17:00'), '17:00');
    assert.equal(parseScheduleClock('5:00 PM'), '17:00');
    assert.equal(parseScheduleClock('5 PM'), '17:00');
    assert.equal(parseScheduleClock('12:00 AM'), '00:00');
    assert.equal(parseScheduleClock('12:15 pm'), '12:15');
    assert.equal(parseScheduleClock('evening'), '');
    assert.equal(parseScheduleDay('Monday'), 'mon');
    assert.equal(parseScheduleDay('Thu'), 'thu');
    assert.equal(parseScheduleDay(''), null);
  });
});

describe('schedule CSV round trip', () => {
  it('keeps day, time, class name, mat, detail, notices, and specials', () => {
    const state = board({
      title: 'Sample Academy',
      qrUrl: 'https://example.com/class-schedule',
      notes: 'Closed Monday, "holiday"',
      template: 'week',
      castEnabled: false,
      classes: [
        {
          id: 'class-mon',
          kind: 'class',
          day: 'mon',
          time: '17:00',
          title: 'Kids BJJ',
          location: 'MAT 1',
          subtitle: '',
          level: 'kids',
        },
        {
          id: 'class-tue',
          kind: 'class',
          day: 'tue',
          time: '18:00',
          title: 'No-Gi, All Levels',
          location: 'MAT 2',
          subtitle: 'Blue belt & up',
          level: 'kids-advanced',
        },
      ],
      specials: [
        {
          id: 'special-1',
          kind: 'special',
          date: '2026-12-24',
          title: 'Closed',
          body: 'Christmas Eve',
          flyerId: 'flyer-9',
        },
      ],
    });
    const csv = serializeScheduleCsv(state);
    const next = importScheduleCsv(csv);
    assert.equal(next.error, undefined);
    assert.equal(next.mode, 'replace-board');
    assert.equal(next.classCount, 2);
    assert.equal(next.specialCount, 1);
    assert.equal(next.payload?.title, 'Sample Academy');
    assert.equal(next.payload?.qrUrl, 'https://example.com/class-schedule');
    assert.equal(next.payload?.notes, 'Closed Monday, "holiday"');
    assert.equal(next.payload?.template, 'week');
    assert.equal(next.payload?.castEnabled, false);
    assert.deepEqual(
      next.payload?.classes.map((row) => [row.id, row.day, row.time, row.title, row.location, row.subtitle, row.level]),
      [
        ['class-mon', 'mon', '17:00', 'Kids BJJ', 'MAT 1', '', 'kids'],
        ['class-tue', 'tue', '18:00', 'No-Gi, All Levels', 'MAT 2', 'Blue belt & up', 'kids-advanced'],
      ],
    );
    assert.equal(next.payload?.classes[0]?.level, 'kids');
    assert.equal(next.payload?.classes[1]?.level, 'kids-advanced');
    assert.match(csv, /Kids Advanced/);
    assert.equal(next.payload?.specials?.[0]?.date, '2026-12-24');
    assert.equal(next.payload?.specials?.[0]?.title, 'Closed');
    assert.equal(next.payload?.specials?.[0]?.body, 'Christmas Eve');
    assert.equal(next.payload?.specials?.[0]?.flyerId, 'flyer-9');
    assert.equal(next.payload?.specials?.[0]?.id, 'special-1');
  });

  it('reads a class-only sheet and 12-hour times without clearing the board', () => {
    const csv = 'Day,Time,Class name,Mat,Detail\r\nMonday,5:00 PM,Fundamentals,MAT 1,All Levels\r\n';
    const next = importScheduleCsv(csv);
    assert.equal(next.mode, 'replace-classes');
    assert.equal(next.payload?.title, null);
    assert.equal(next.payload?.notes, null);
    assert.equal(next.payload?.specials, null);
    assert.equal(next.payload?.classes[0]?.day, 'mon');
    assert.equal(next.payload?.classes[0]?.time, '17:00');
    assert.equal(next.payload?.classes[0]?.title, 'Fundamentals');
    assert.equal(next.payload?.classes[0]?.location, 'MAT 1');
    assert.equal(next.payload?.classes[0]?.subtitle, 'All Levels');
    assert.equal(next.payload?.classes[0]?.level, 'none');
    assert.equal(next.skipped, 0);
  });

  it('round-trips a level by id or label and treats a blank or unknown level as No level', () => {
    assert.equal(parseClassLevel('kids-advanced'), 'kids-advanced');
    assert.equal(parseClassLevel('Kids Advanced'), 'kids-advanced');
    assert.equal(parseClassLevel('all levels'), 'kids');
    assert.equal(parseClassLevel('FUNDAMENTALS'), 'fundamentals');
    assert.equal(parseClassLevel(''), 'none');
    assert.equal(parseClassLevel('purple'), 'none');
    const csv = [
      'Day,Time,Class name,Level',
      'Monday,5:00 PM,Fundamentals,Kids Advanced',
      'Tuesday,6:00 PM,Open Mat,',
      'Wednesday,7:00 PM,Seminar,not-a-level',
    ].join('\r\n');
    const next = importScheduleCsv(csv);
    assert.equal(next.error, undefined);
    assert.equal(next.skipped, 0);
    assert.equal(next.classCount, 3);
    assert.deepEqual(
      next.payload?.classes.map((row) => [row.title, row.level]),
      [
        ['Fundamentals', 'kids-advanced'],
        ['Open Mat', 'none'],
        ['Seminar', 'none'],
      ],
    );
    assert.equal(next.payload?.classes[0]?.title, 'Fundamentals');
    assert.equal(next.payload?.classes[1]?.title, 'Open Mat');
  });

  it('imports the template, then replaces an on-device board', () => {
    const next = importScheduleCsv(scheduleCsvTemplate());
    assert.equal(next.error, undefined);
    assert.equal(next.mode, 'replace-board');
    assert.equal(next.classCount, 1);
    assert.equal(next.payload?.title, 'Sample Academy');
    assert.equal(next.payload?.classes[0]?.title, 'Fundamentals');
    assert.match(formatScheduleCsvSummary(next), /Replaced the schedule/);

    applyScheduleImport({
      classes: [
        {
          id: 'keep',
          kind: 'class',
          day: 'fri',
          time: '19:00',
          title: 'Keep me',
          location: '',
          subtitle: '',
        },
      ],
      specials: null,
      title: 'Real Gym',
      qrUrl: null,
      notes: 'Stay',
      template: null,
      castEnabled: null,
    });
    assert.equal(getSchedule().title, 'Real Gym');
    assert.equal(getSchedule().notes, 'Stay');
    assert.equal(getSchedule().classes[0]?.title, 'Keep me');
    if (!next.payload) return;
    applyScheduleImport(next.payload);
    assert.equal(getSchedule().title, 'Sample Academy');
    assert.equal(getSchedule().classes.some((row) => row.title === 'Keep me'), false);
    assert.equal(getSchedule().classes[0]?.title, 'Fundamentals');
    applyScheduleImport({
      classes: [],
      specials: [],
      title: '',
      qrUrl: '',
      notes: '',
      template: 'weekly-list',
      castEnabled: true,
    });
  });

  it('rejects an Excel workbook', async () => {
    const file = {
      name: 'week.xlsx',
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    const next = await importScheduleCsvFile(file);
    assert.match(next.error ?? '', /CSV UTF-8/);
  });
});
