import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  WEEKDAYS,
  boardWeekdays,
  classesAt,
  classesOnDay,
  compareClasses,
  compareMatLocation,
  DEFAULT_SCHEDULE_TEMPLATE,
  defaultGymCalendar,
  formatBoardStamp,
  formatClassTime,
  formatSpecialDate,
  formatTimeGroupLine,
  classProgram,
  groupClassesByTime,
  monthWeeks,
  weekHourLanes,
  normalizeGymCalendar,
  normalizeQrUrl,
  noticeLines,
  parseTimeMinutes,
  SAMPLE_WEEK_SLOTS,
  sortClasses,
  specialsThisWeek,
  suggestNextMat,
  weekTimeRows,
  weekdayFromJsDay,
  type SpecialDate,
  type WeeklyClassSlot,
} from './gymCalendar.ts';

function row(partial: Partial<WeeklyClassSlot> & Pick<WeeklyClassSlot, 'id'>): WeeklyClassSlot {
  return {
    kind: 'class',
    day: 'mon',
    time: '18:00',
    title: 'Adults',
    location: '',
    subtitle: '',
    ...partial,
  };
}

function special(partial: Partial<SpecialDate> & Pick<SpecialDate, 'id'>): SpecialDate {
  return {
    kind: 'special',
    date: '',
    title: 'Closed',
    body: '',
    flyerId: null,
    ...partial,
  };
}

describe('weekdayFromJsDay', () => {
  it('maps JS Sunday-first days onto Mon–Sun', () => {
    assert.equal(weekdayFromJsDay(0), 'sun');
    assert.equal(weekdayFromJsDay(1), 'mon');
    assert.equal(weekdayFromJsDay(6), 'sat');
  });
});

describe('formatClassTime', () => {
  it('prints gym-style 12-hour times', () => {
    assert.equal(formatClassTime('00:00'), '12:00 AM');
    assert.equal(formatClassTime('09:05'), '9:05 AM');
    assert.equal(formatClassTime('12:00'), '12:00 PM');
    assert.equal(formatClassTime('18:30'), '6:30 PM');
  });

  it('leaves blank or junk times readable', () => {
    assert.equal(formatClassTime(''), '—');
    assert.equal(formatClassTime('evening'), 'evening');
    assert.equal(parseTimeMinutes('25:00'), Number.POSITIVE_INFINITY);
  });
});

describe('normalizeQrUrl', () => {
  it('adds https when the owner pastes a bare host', () => {
    assert.equal(normalizeQrUrl('  gym.example.com/join  '), 'https://gym.example.com/join');
    assert.equal(normalizeQrUrl('https://gym.example.com'), 'https://gym.example.com');
    assert.equal(normalizeQrUrl('mailto:owner@gym.example'), 'mailto:owner@gym.example');
    assert.equal(normalizeQrUrl(''), '');
  });
});

describe('normalizeGymCalendar', () => {
  it('returns an empty weekly board for junk', () => {
    assert.deepEqual(normalizeGymCalendar(null), defaultGymCalendar());
    assert.deepEqual(normalizeGymCalendar({ version: 1, classes: 'nope' }), defaultGymCalendar());
  });

  it('keeps titled classes, specials, and a reserved flyer id', () => {
    const next = normalizeGymCalendar({
      title: 'Sample Academy',
      qrUrl: 'https://gym.example',
      notes: 'Closed Monday',
      template: 'week-grid',
      classes: [
        { id: 'a', day: 'wed', time: '18:00', title: 'Adults', location: 'MAT 2', subtitle: 'All Levels' },
        { id: 'skip', day: 'mon', time: '', title: '' },
        { day: 'nope', time: '10:00', title: 'Kids' },
        { id: 'b', day: 'mon', time: '09:00', title: 'Kids' },
      ],
      specials: [
        { id: 's1', date: '2026-09-21', title: 'Labor Day', flyerId: 'flyer-9' },
        { id: 's2', date: 'not-a-date', title: '', body: '' },
      ],
    });
    assert.equal(next.title, 'Sample Academy');
    assert.equal(next.notes, 'Closed Monday');
    assert.equal(next.template, 'week');
    assert.deepEqual(
      next.classes.map((item) => item.id),
      ['b', 'a'],
    );
    assert.equal(next.classes[0]?.kind, 'class');
    assert.equal(next.classes[0]?.location, '');
    assert.equal(next.classes[1]?.location, 'MAT 2');
    assert.equal(next.classes[1]?.subtitle, 'All Levels');
    assert.deepEqual(next.specials, [
      {
        id: 's1',
        kind: 'special',
        date: '2026-09-21',
        title: 'Labor Day',
        body: '',
        flyerId: 'flyer-9',
      },
    ]);
  });

  it('defaults the TV template to the full week and retires the old grid', () => {
    assert.equal(defaultGymCalendar().template, 'week');
    assert.equal(DEFAULT_SCHEDULE_TEMPLATE, 'week');
    assert.equal(normalizeGymCalendar({ template: 'retired-template' }).template, 'week');
    assert.equal(normalizeGymCalendar({ template: 'week-grid' }).template, 'week');
    assert.equal(normalizeGymCalendar({ template: 'monthly' }).template, 'monthly');
    assert.equal(normalizeGymCalendar({ template: 'week' }).template, 'week');
    assert.equal(normalizeGymCalendar({}).castEnabled, true);
    assert.equal(normalizeGymCalendar({ castEnabled: false }).castEnabled, false);
  });
});

describe('sortClasses', () => {
  it('orders by weekday then clock then mat then title', () => {
    const rows = [
      row({ id: '2', day: 'mon', time: '18:00', title: 'Adults', location: 'MAT 2' }),
      row({ id: '1', day: 'mon', time: '09:00', title: 'Kids' }),
      row({ id: '4', day: 'mon', time: '18:00', title: 'Kids', location: 'MAT 1' }),
      row({ id: '3', day: 'tue', time: '18:00', title: 'Adults' }),
    ];
    assert.deepEqual(
      sortClasses(rows).map((item) => item.id),
      ['1', '4', '2', '3'],
    );
    assert.equal(compareClasses(rows[0], rows[1]) > 0, true);
    assert.deepEqual(
      classesOnDay(rows, 'mon').map((item) => item.title),
      ['Kids', 'Kids', 'Adults'],
    );
    assert.deepEqual(classesOnDay(rows, 'sun'), []);
  });
});

describe('weekly list helpers', () => {
  it('groups same-time classes and hides empty weekdays', () => {
    const rows = [
      row({ id: 'a', day: 'mon', time: '17:00', title: 'Kids BJJ', location: 'MAT 1' }),
      row({ id: 'b', day: 'mon', time: '17:00', title: 'Advanced Kids', location: 'MAT 2', subtitle: 'Grey & White+' }),
      row({ id: 'c', day: 'sat', time: '11:00', title: 'Open Mat', location: 'MAT 1' }),
    ];
    const groups = groupClassesByTime(classesOnDay(rows, 'mon'));
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.time, '17:00');
    assert.deepEqual(
      groups[0]?.items.map((item) => item.location),
      ['MAT 1', 'MAT 2'],
    );
    assert.deepEqual(boardWeekdays(rows), ['mon', 'sat']);
    assert.deepEqual(boardWeekdays([]), ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    assert.equal(
      formatTimeGroupLine(groups[0]!),
      '5:00 PM MAT 1 Kids BJJ / MAT 2 Advanced Kids (Grey & White+)',
    );
  });

  it('suggests the next free mat for a parallel class', () => {
    assert.equal(suggestNextMat([]), 'MAT 1');
    assert.equal(suggestNextMat(['MAT 1']), 'MAT 2');
    assert.equal(suggestNextMat(['mat 1', 'MAT 2']), 'MAT 3');
    assert.equal(compareMatLocation('MAT 2', 'MAT 10') < 0, true);
    assert.equal(compareMatLocation('MAT 1', '') < 0, true);
  });

  it('stamps the board with month and year', () => {
    assert.equal(formatBoardStamp(new Date(2026, 8, 20)), 'SEPTEMBER 2026');
  });

  it('builds a Monday-start month and keeps days outside the month', () => {
    const weeks = monthWeeks(new Date(2026, 8, 24));
    assert.equal(weeks.length, 5);
    assert.equal(weeks[0]?.[0]?.iso, '2026-08-31');
    assert.equal(weeks[0]?.[0]?.inMonth, false);
    assert.equal(weeks[0]?.[0]?.weekday, 'mon');
    assert.equal(weeks[0]?.[1]?.iso, '2026-09-01');
    assert.equal(weeks[0]?.[1]?.inMonth, true);
    assert.equal(weeks[4]?.[2]?.iso, '2026-09-30');
    assert.equal(weeks[4]?.[3]?.inMonth, false);
  });

  it('ships a sample week with mats and optional details', () => {
    assert.equal(SAMPLE_WEEK_SLOTS.length > 10, true);
    assert.equal(
      SAMPLE_WEEK_SLOTS.some((slot) => slot.location === 'MAT 1' && slot.subtitle === ''),
      true,
    );
    assert.equal(
      SAMPLE_WEEK_SLOTS.some((slot) => slot.title.includes('Blue Belt')),
      true,
    );
    for (const day of WEEKDAYS) {
      if (day === 'sun') continue;
      assert.equal(
        SAMPLE_WEEK_SLOTS.some((slot) => slot.day === day),
        true,
        day,
      );
    }
    assert.equal(
      SAMPLE_WEEK_SLOTS.some((slot) => slot.day === 'sun'),
      false,
    );
    const times = weekTimeRows(
      SAMPLE_WEEK_SLOTS.map((slot, index) => ({ ...slot, id: `s${index}`, kind: 'class' })),
    );
    assert.equal(times[0], '06:00');
    const lanes = weekHourLanes(
      SAMPLE_WEEK_SLOTS.map((slot, index) => ({ ...slot, id: `h${index}`, kind: 'class' as const })),
    );
    assert.equal(lanes[0], '06:00');
    assert.equal(lanes.at(-1), '19:00');
    assert.equal(lanes.includes('07:00'), true);
    assert.equal(lanes.includes('13:00'), true);
    assert.equal(classProgram('Tiny Champions').id, 'kids');
    assert.equal(classProgram('Little Champions').id, classProgram('Kids BJJ').id);
    assert.equal(classProgram('Fundamentals').id, 'fundamentals');
    assert.equal(classProgram('GB3').id, 'advanced');
    const sampleTitles = SAMPLE_WEEK_SLOTS.map((slot) => `${slot.title} ${slot.subtitle}`).join('\n');
    assert.doesNotMatch(sampleTitles, /gracie|barra|tiny champions|little champions|\bGB\d?\b/i);
    assert.match(sampleTitles, /Kids 3-5/);
    assert.match(sampleTitles, /Youth Class/);
    assert.match(sampleTitles, /Beginner/);
    assert.equal(classProgram('No-Gi').id, 'nogi');
    assert.equal(times.includes('17:00'), true);
    assert.equal(classesAt(
      SAMPLE_WEEK_SLOTS.map((slot, index) => ({ ...slot, id: `s${index}`, kind: 'class' })),
      'mon',
      '17:00',
    ).length, 2);
  });
});

describe('specialsThisWeek', () => {
  it('keeps undated notices and dates that fall in the Monday week', () => {
    const now = new Date(2026, 8, 21);
    const rows = [
      special({ id: 'open', date: '', title: 'Open mat extra' }),
      special({ id: 'mon', date: '2026-09-21', title: 'Kids at 5' }),
      special({ id: 'next', date: '2026-09-28', title: 'Next Monday' }),
    ];
    assert.deepEqual(
      specialsThisWeek(rows, now).map((item) => item.id),
      ['open', 'mon'],
    );
    assert.equal(formatSpecialDate('2026-09-21').includes('Sep'), true);
    assert.deepEqual(noticeLines('Gym note', [rows[1]], now), ['Gym note', `${formatSpecialDate('2026-09-21')} · Kids at 5`]);
  });
});
