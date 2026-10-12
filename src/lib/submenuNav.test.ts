import assert from 'node:assert/strict';
import test from 'node:test';
import { classHistoryHref, submenuBackTarget, submenuHomeTarget } from './submenuNav.ts';

const pro = { proUnlocked: true, coachUnlocked: true };

test('center logo is the tier picker on every page', () => {
  assert.equal(submenuHomeTarget(), '/');
});

test('White, Student Edition, Coach, and Pro homes have no corner back', () => {
  assert.equal(submenuBackTarget({ pathname: '/' }), null);
  assert.equal(submenuBackTarget({ pathname: '/white' }), null);
  assert.equal(submenuBackTarget({ pathname: '/student' }), null);
  assert.equal(submenuBackTarget({ pathname: '/coach', ...pro }), null);
  assert.equal(submenuBackTarget({ pathname: '/pro', ...pro }), null);
});

test('Student Edition pages go back one level, and a card returns to the card list', () => {
  assert.equal(submenuBackTarget({ pathname: '/student/journal' }), '/student');
  assert.equal(submenuBackTarget({ pathname: '/student/journal', search: 'student=1' }), '/student?student=1');
  assert.equal(submenuBackTarget({ pathname: '/student/cards', search: '?student=1' }), '/student?student=1');
  assert.equal(submenuBackTarget({ pathname: '/student/cards/card.1' }), '/student/cards');
  assert.equal(
    submenuBackTarget({ pathname: '/student/cards/card.1', search: 'student=1' }),
    '/student/cards?student=1',
  );
  assert.equal(submenuBackTarget({ pathname: '/student/fundamentals' }), '/student');
  assert.equal(submenuBackTarget({ pathname: '/student/calendar', search: 'student=1' }), '/student?student=1');
  assert.equal(submenuBackTarget({ pathname: '/student/calendar/2026-10-12', search: 'student=1' }), '/student/calendar?student=1');
  assert.equal(submenuBackTarget({ pathname: '/student/rubric' }), '/student');
  assert.equal(submenuBackTarget({ pathname: '/student/belt', search: 'student=1' }), '/student?student=1');
  assert.equal(submenuBackTarget({ pathname: '/student/share', search: 'student=1' }), '/student?student=1');
  assert.equal(
    submenuBackTarget({ pathname: '/student/share', search: 'from=rubric&student=1' }),
    '/student/rubric?student=1',
  );
});

test('Pro submenus go back one level to Pro', () => {
  assert.equal(submenuBackTarget({ pathname: '/coach-unlimited', ...pro }), '/pro');
  assert.equal(submenuBackTarget({ pathname: '/instructors', ...pro }), '/pro');
  assert.equal(submenuBackTarget({ pathname: '/suite', ...pro }), '/pro');
  assert.equal(submenuBackTarget({ pathname: '/slideshow', search: 'folder=gallery', ...pro }), '/pro');
});

test('Coach Unlimited tools go back to Coach Unlimited, including a direct Pro visit', () => {
  assert.equal(submenuBackTarget({ pathname: '/notes', search: 'plan=unlimited', ...pro }), '/coach-unlimited');
  assert.equal(submenuBackTarget({ pathname: '/techniques', search: 'from=unlimited', ...pro }), '/coach-unlimited');
  assert.equal(submenuBackTarget({ pathname: '/technique-tree', search: 'from=unlimited', ...pro }), '/coach-unlimited');
  assert.equal(submenuBackTarget({ pathname: '/techniques', ...pro }), '/coach-unlimited');
  assert.equal(submenuBackTarget({ pathname: '/technique-tree', ...pro }), '/coach-unlimited');
  assert.equal(submenuBackTarget({ pathname: '/notes', ...pro }), '/coach-unlimited');
  assert.equal(
    submenuBackTarget({ pathname: '/competition-curriculum', search: 'plan=unlimited', ...pro }),
    '/coach-unlimited',
  );
  assert.equal(submenuBackTarget({ pathname: '/roster', search: 'from=unlimited', ...pro }), '/coach-unlimited');
  assert.equal(submenuBackTarget({ pathname: '/review', ...pro }), '/coach-unlimited');
});

test('Coach hub tools go back to Coach even when Pro is unlocked', () => {
  assert.equal(submenuBackTarget({ pathname: '/notes', search: 'from=coach', ...pro }), '/coach');
  assert.equal(submenuBackTarget({ pathname: '/techniques', search: 'from=coach', ...pro }), '/coach');
  assert.equal(submenuBackTarget({ pathname: '/technique-tree', search: 'from=coach', ...pro }), '/coach');
  assert.equal(submenuBackTarget({ pathname: '/roster', search: 'from=students', ...pro }), '/coach');
  assert.equal(submenuBackTarget({ pathname: '/tournament', search: 'from=coach', ...pro }), '/coach');
  assert.equal(
    submenuBackTarget({ pathname: '/notes', search: '', proUnlocked: false, coachUnlocked: true }),
    '/coach',
  );
});

test('Competitor Roster follows the menu that opened it', () => {
  assert.equal(submenuBackTarget({ pathname: '/roster', search: 'from=competitors', ...pro }), '/competitors');
  assert.equal(submenuBackTarget({ pathname: '/roster', search: 'from=unlimited', ...pro }), '/coach-unlimited');
  assert.equal(submenuBackTarget({ pathname: '/competitors', search: 'from=suite', ...pro }), '/suite');
  assert.equal(submenuBackTarget({ pathname: '/competitors', search: 'from=competition' }), '/competition');
  assert.equal(submenuBackTarget({ pathname: '/game-plan', ...pro }), '/competitors');
  assert.equal(submenuBackTarget({ pathname: '/game-plan', detailOpen: true, ...pro }), '/game-plan');
  assert.equal(submenuBackTarget({ pathname: '/competition-ready', ...pro }), '/competitors');
  assert.equal(submenuBackTarget({ pathname: '/rankings', ...pro }), '/competitors');
  assert.equal(submenuBackTarget({ pathname: '/tournament', search: 'from=suite', ...pro }), '/suite');
  assert.equal(submenuBackTarget({ pathname: '/tournament', search: 'from=unlimited', ...pro }), '/coach-unlimited');
});

test('a lesson video returns to that Daily Lesson Plan day, then the hub', () => {
  assert.equal(
    submenuBackTarget({
      pathname: '/techniques',
      search:
        'from=unlimited&back=' +
        encodeURIComponent('/notes?plan=unlimited&from=unlimited&date=2026-10-11'),
      ...pro,
    }),
    '/notes?plan=unlimited&from=unlimited&date=2026-10-11',
  );
  assert.equal(
    submenuBackTarget({
      pathname: '/techniques',
      search: 'from=coach&back=' + encodeURIComponent('/notes?from=coach&date=2026-10-11'),
      ...pro,
    }),
    '/notes?from=coach&date=2026-10-11',
  );
  assert.equal(
    submenuBackTarget({ pathname: '/notes', search: 'plan=unlimited&from=unlimited&date=2026-10-11', ...pro }),
    '/coach-unlimited',
  );
  assert.equal(
    submenuBackTarget({ pathname: '/notes', search: 'from=coach&date=2026-10-11', ...pro }),
    '/coach',
  );
});

test('curriculum video back wins over the hub, and class history remembers its opener', () => {
  assert.equal(
    submenuBackTarget({
      pathname: '/techniques',
      search: 'back=%2Fcompetition-curriculum%3Fplan%3Dunlimited',
      ...pro,
    }),
    '/competition-curriculum?plan=unlimited',
  );
  assert.equal(classHistoryHref('/coach-unlimited'), '/class-history?from=unlimited');
  assert.equal(classHistoryHref('/notes', 'plan=unlimited'), '/class-history?from=notes&plan=unlimited');
  assert.equal(classHistoryHref('/notes', 'from=coach'), '/class-history?from=notes&hub=coach');
  assert.equal(
    submenuBackTarget({ pathname: '/class-history', search: 'from=unlimited', ...pro }),
    '/coach-unlimited',
  );
  assert.equal(
    submenuBackTarget({ pathname: '/class-history', search: 'from=notes&plan=unlimited', ...pro }),
    '/notes?plan=unlimited',
  );
  assert.equal(submenuBackTarget({ pathname: '/schedule', ...pro }), '/slideshow?folder=gallery');
  assert.equal(submenuBackTarget({ pathname: '/white/roster' }), '/white');
  assert.equal(submenuBackTarget({ pathname: '/match', search: 'from=suite', ...pro }), '/suite');
  assert.equal(submenuBackTarget({ pathname: '/match/control', search: 'from=suite', ...pro }), '/suite');
  assert.equal(submenuBackTarget({ pathname: '/training', ...pro }), '/white');
});
