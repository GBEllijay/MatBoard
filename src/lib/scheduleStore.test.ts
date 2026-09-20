import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classesOnDay,
  compareClasses,
  defaultGymCalendar,
  formatClassTime,
  formatSpecialDate,
  normalizeGymCalendar,
  normalizeQrUrl,
  noticeLines,
  parseTimeMinutes,
  sortClasses,
  specialsThisWeek,
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
      title: 'Ellijay BJJ',
      qrUrl: 'https://gym.example',
      notes: 'Closed Monday',
      classes: [
        { id: 'a', day: 'wed', time: '18:00', title: 'Adults' },
        { id: 'skip', day: 'mon', time: '', title: '' },
        { day: 'nope', time: '10:00', title: 'Kids' },
        { id: 'b', day: 'mon', time: '09:00', title: 'Kids' },
      ],
      specials: [
        { id: 's1', date: '2026-09-21', title: 'Labor Day', flyerId: 'flyer-9' },
        { id: 's2', date: 'not-a-date', title: '', body: '' },
      ],
    });
    assert.equal(next.title, 'Ellijay BJJ');
    assert.equal(next.notes, 'Closed Monday');
    assert.deepEqual(
      next.classes.map((item) => item.id),
      ['b', 'a'],
    );
    assert.equal(next.classes[0]?.kind, 'class');
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
});

describe('sortClasses', () => {
  it('orders by weekday then clock then title', () => {
    const rows = [
      row({ id: '2', day: 'mon', time: '18:00', title: 'Adults' }),
      row({ id: '1', day: 'mon', time: '09:00', title: 'Kids' }),
      row({ id: '3', day: 'tue', time: '18:00', title: 'Adults' }),
    ];
    assert.deepEqual(
      sortClasses(rows).map((item) => item.id),
      ['1', '2', '3'],
    );
    assert.equal(compareClasses(rows[0], rows[1]) > 0, true);
    assert.deepEqual(
      classesOnDay(rows, 'mon').map((item) => item.title),
      ['Kids', 'Adults'],
    );
    assert.deepEqual(classesOnDay(rows, 'sun'), []);
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
