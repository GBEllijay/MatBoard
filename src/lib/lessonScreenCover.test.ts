import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ADVANTAGE_MARK_SRC } from './gymLogo.ts';
import {
  DEFAULT_LESSON_COVER_MODE,
  LESSON_COVER_LABELS,
  LESSON_COVER_MODES,
  LESSON_SCREEN_COVER_KEY,
  isLessonCoverMode,
  lessonCardHidePickerBox,
  lessonCoverLogoSrc,
  lessonCoverScheduleKind,
  readLessonCoverMode,
  writeLessonCoverMode,
} from './lessonScreenCover.ts';
import { TRAINING_NOTES_STORAGE_KEY } from './trainingNotesStore.ts';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

const storage = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

test('hide screen remembers Logo, Schedule, or Black on this device', () => {
  storage.clear();
  assert.deepEqual(LESSON_COVER_MODES, ['logo', 'schedule', 'black']);
  assert.equal(LESSON_COVER_LABELS.logo, 'Logo');
  assert.equal(LESSON_COVER_LABELS.schedule, 'Schedule');
  assert.equal(LESSON_COVER_LABELS.black, 'Black');
  assert.equal(DEFAULT_LESSON_COVER_MODE, 'logo');
  assert.equal(readLessonCoverMode(), 'logo');
  assert.equal(localStorage.getItem(LESSON_SCREEN_COVER_KEY), null);

  for (const mode of LESSON_COVER_MODES) {
    writeLessonCoverMode(mode);
    assert.equal(readLessonCoverMode(), mode);
    const raw = JSON.parse(localStorage.getItem(LESSON_SCREEN_COVER_KEY) ?? '');
    assert.equal(raw.version, 1);
    assert.equal(raw.mode, mode);
  }
});

test('a bad hide-screen choice falls back to Logo and leaves saved plans alone', () => {
  storage.clear();
  const plan = JSON.stringify({ version: 3, days: { '2026-10-11': { plans: [{ intro: 'Armbar' }] } } });
  localStorage.setItem(TRAINING_NOTES_STORAGE_KEY, plan);

  assert.equal(isLessonCoverMode('logo'), true);
  assert.equal(isLessonCoverMode('blue'), false);
  assert.equal(isLessonCoverMode(1), false);

  localStorage.setItem(LESSON_SCREEN_COVER_KEY, '{');
  assert.equal(readLessonCoverMode(), 'logo');
  localStorage.setItem(LESSON_SCREEN_COVER_KEY, JSON.stringify({ version: 1, mode: 'mat' }));
  assert.equal(readLessonCoverMode(), 'logo');
  localStorage.setItem(LESSON_SCREEN_COVER_KEY, JSON.stringify({ version: 2, mode: 'black' }));
  assert.equal(readLessonCoverMode(), 'logo');

  writeLessonCoverMode('schedule');
  assert.equal(localStorage.getItem(TRAINING_NOTES_STORAGE_KEY), plan);
  assert.equal(JSON.parse(localStorage.getItem(LESSON_SCREEN_COVER_KEY) ?? '').mode, 'schedule');
});

test('the logo cover uses the saved gym logo, then the Advantage mark', () => {
  assert.equal(lessonCoverLogoSrc('data:image/png;base64,GYM'), 'data:image/png;base64,GYM');
  assert.equal(lessonCoverLogoSrc('  data:image/webp;base64,GYM  '), 'data:image/webp;base64,GYM');
  assert.equal(lessonCoverLogoSrc(null), ADVANTAGE_MARK_SRC);
  assert.equal(lessonCoverLogoSrc(''), ADVANTAGE_MARK_SRC);
  assert.equal(lessonCoverLogoSrc('blob:board-picture'), ADVANTAGE_MARK_SRC);
  assert.equal(ADVANTAGE_MARK_SRC, '/advantage-icon.png');
});

test('the schedule cover reuses the cast week board unless Month is the saved template', () => {
  assert.equal(lessonCoverScheduleKind('monthly'), 'month');
  assert.equal(lessonCoverScheduleKind('week'), 'week');
  assert.equal(lessonCoverScheduleKind('weekly-list'), 'week');
  assert.equal(lessonCoverScheduleKind('week-grid'), 'week');
  assert.equal(lessonCoverScheduleKind(null), 'week');
  assert.equal(lessonCoverScheduleKind(''), 'week');
});

test('Daily Lesson Plan keeps the corner back and adds Hide screen without a center Home logo', () => {
  const page = readFileSync(new URL('../pages/TrainingNotes.tsx', import.meta.url), 'utf8');
  const cover = readFileSync(new URL('../components/LessonScreenCover.tsx', import.meta.url), 'utf8');
  assert.match(page, /PlayExitMark/);
  assert.doesNotMatch(page, /TierHomeMark|SubmenuMarks/);
  assert.match(page, /LessonCoverProvider/);
  assert.match(page, /LessonScreenHide/);
  assert.match(page, /lessonVideoHref/);
  assert.match(page, /notes-intro/);
  assert.match(page, /Technique \/ Drill/);
  const cardHides = page.match(/<CardHideScreen\b/g) ?? [];
  assert.ok(cardHides.length >= 5);
  assert.match(cover, /Hide screen/);
  assert.match(cover, /Hide screen for \$\{label\}/);
  assert.match(cover, /Show screen/);
  assert.match(cover, /requestElementFullscreen/);
  assert.match(cover, /LESSON_COVER_HOME_HINT/);
  assert.match(cover, /notes-cover__logo-hit/);
  assert.match(cover, /ScheduleWeekBoard/);
  assert.match(cover, /ScheduleMonthBoard/);
  assert.match(cover, /lessonCoverLogoSrc/);
  assert.match(cover, /lessonCoverScheduleKind/);
  assert.match(cover, /lessonCardHidePickerBox/);
  assert.match(cover, /window\.scrollTo\(0, saved\.y\)/);
  assert.doesNotMatch(cover, /tier-home|aria-label="Home"/);
});

test('the card hide picker stays inside a 390px phone and opens above a low card', () => {
  const phone = { width: 390, height: 844 };
  const low = lessonCardHidePickerBox({
    button: { top: 760, right: 350, bottom: 832 },
    viewport: phone,
  });
  assert.ok(low.left >= 8);
  assert.ok(low.left + low.width <= phone.width - 8);
  assert.equal(low.top, undefined);
  assert.equal(low.bottom, phone.height - 760 + 6);

  const high = lessonCardHidePickerBox({
    button: { top: 120, right: 350, bottom: 192 },
    viewport: phone,
  });
  assert.equal(high.top, 198);
  assert.equal(high.bottom, undefined);
  assert.ok(high.left + high.width <= phone.width - 8);

  const cramped = lessonCardHidePickerBox({
    button: { top: 40, right: 70, bottom: 112 },
    viewport: { width: 320, height: 640 },
  });
  assert.ok(cramped.left >= 8);
  assert.ok(cramped.left + cramped.width <= 312);
  assert.equal(cramped.top, 118);
});
