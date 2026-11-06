import assert from 'node:assert/strict';
import test from 'node:test';
import { createReplay } from './replayAnalysis.ts';
import { STANDALONE_REVIEW_KEY, loadStandaloneReview, saveStandaloneReview } from './recordForReviewStore.ts';
import {
  REVIEW_LIBRARY_ADDED,
  REVIEW_LIBRARY_ALREADY,
  REVIEW_LIBRARY_NEEDS_CLIP,
  REVIEW_LIBRARY_NEEDS_LINK,
  addStandaloneReviewToJournalLibrary,
  attachReviewName,
  markReviewInLibrary,
} from './reviewIndexLink.ts';
import { blankStudentReport, loadStudentReport } from './studentEdition.ts';
import { FILM_STORAGE_KEY, loadFilms } from './studentFilm.ts';
import { TRAINING_NOTES_STORAGE_KEY } from './trainingNotesStore.ts';

function memory() {
  const bag = new Map<string, string>();
  return {
    bag,
    getItem: (key: string) => bag.get(key) ?? null,
    setItem: (key: string, value: string) => {
      bag.set(key, value);
    },
  };
}

test('a review links to a catalog fundamental without writing a new checklist line', () => {
  const report = blankStudentReport(1);
  const linked = attachReviewName(report, 'passes', 'Armbar from guard', 5);
  assert.equal(linked.added, false);
  assert.equal(linked.error, undefined);
  assert.deepEqual(linked.link, { id: 'sub.armbar-guard', name: 'Armbar from guard' });
  assert.equal(linked.report, report);
  assert.equal(report.checklist.length, 0);
});

test('a new review name is added to the fundamentals index once', () => {
  const report = blankStudentReport(1);
  const added = attachReviewName(report, 'passes', 'Knee cut', 9);
  assert.equal(added.added, true);
  assert.equal(added.link?.name, 'Knee cut');
  assert.ok(added.link?.id.startsWith('check.'));
  assert.equal(added.report.checklist.length, 1);
  assert.equal(added.report.checklist[0]?.categoryId, 'passes');
  assert.equal(added.report.checklist[0]?.catalogItemId, '');
  assert.equal(added.report.checklist[0]?.name, 'Knee cut');
  assert.equal(added.link?.id, added.report.checklist[0]?.id);

  const again = attachReviewName(added.report, 'sweeps', 'knee   cut', 10);
  assert.equal(again.added, false);
  assert.equal(again.link?.id, added.link?.id);
  assert.equal(again.report, added.report);
  assert.equal(again.report.checklist.length, 1);
});

test('an empty name or unknown category does not change the index', () => {
  const report = blankStudentReport(1);
  const empty = attachReviewName(report, 'passes', '   ', 1);
  assert.equal(empty.link, null);
  assert.equal(empty.added, false);
  assert.match(empty.error ?? '', /Type a name/);
  const bad = attachReviewName(report, 'nope', 'Zorbo pass', 2);
  assert.equal(bad.link, null);
  assert.equal(bad.added, false);
  assert.equal(bad.report, report);
  assert.equal(report.checklist.length, 0);
});

test('standalone review stores the fundamental link and does not write a lesson plan', () => {
  const store = memory();
  const replay = createReplay();
  replay.title = 'Saturday finals';
  replay.indexLink = { id: 'sub.armbar-guard', name: 'Armbar from guard' };
  replay.clip = { localId: 'rclip-1', name: 'clip.mp4', mime: 'video/mp4', size: 8, source: 'record' };
  replay.journalLibrary = { filmId: 'film.1', clipLocalId: 'rclip-1' };
  saveStandaloneReview(replay, store);
  assert.equal(store.bag.has(TRAINING_NOTES_STORAGE_KEY), false);
  assert.equal(store.bag.has(STANDALONE_REVIEW_KEY), true);
  const loaded = loadStandaloneReview(store);
  assert.equal(loaded.title, 'Saturday finals');
  assert.deepEqual(loaded.indexLink, { id: 'sub.armbar-guard', name: 'Armbar from guard' });
  assert.deepEqual(loaded.journalLibrary, { filmId: 'film.1', clipLocalId: 'rclip-1' });
  assert.equal(loaded.clip?.localId, 'rclip-1');
});

test('adding a review to the journal library uses the fundamental name and keeps a tournament label as the note', async () => {
  const store = memory();
  const replay = createReplay();
  replay.title = 'Saturday finals';
  replay.indexLink = { id: 'sub.armbar-guard', name: 'Armbar from guard' };
  replay.clip = { localId: 'rclip-1', name: 'clip.mp4', mime: 'video/mp4', size: 8, source: 'gallery' };
  const blob = new Blob(['12345678'], { type: 'video/mp4' });
  const puts: string[] = [];
  const saved = await addStandaloneReviewToJournalLibrary(replay, blob, '2026-11-06', store, {
    canStore: async () => true,
    putBlob: async (id) => {
      puts.push(id);
    },
  }, 40);
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.equal(saved.message, REVIEW_LIBRARY_ADDED);
  const films = loadFilms(store);
  assert.equal(films.length, 1);
  assert.equal(films[0]?.technique, 'Armbar from guard');
  assert.equal(films[0]?.note, 'Saturday finals');
  assert.equal(films[0]?.date, '2026-11-06');
  assert.equal(films[0]?.where, 'phone');
  assert.deepEqual(puts, [films[0]?.id]);
  assert.equal(store.bag.has(FILM_STORAGE_KEY), true);
  const marked = markReviewInLibrary(replay, saved.filmId, saved.clipLocalId);
  const again = await addStandaloneReviewToJournalLibrary(marked, blob, '2026-11-06', store, {
    canStore: async () => true,
    putBlob: async () => {
      throw new Error('should not store a second copy');
    },
  });
  assert.equal(again.ok, false);
  if (again.ok) return;
  assert.equal(again.error, REVIEW_LIBRARY_ALREADY);
  assert.equal(loadFilms(store).length, 1);
});

test('a label that matches the fundamental is not copied into the film note', async () => {
  const store = memory();
  const replay = createReplay();
  replay.title = 'Kimura';
  replay.indexLink = { id: 'sub.kimura', name: 'Kimura' };
  replay.clip = { localId: 'rclip-2', name: 'kimura.mp4', mime: 'video/mp4', size: 4, source: 'record' };
  const saved = await addStandaloneReviewToJournalLibrary(
    replay,
    new Blob(['clip'], { type: 'video/mp4' }),
    '2026-11-06',
    store,
    { canStore: async () => true, putBlob: async () => {} },
    41,
  );
  assert.equal(saved.ok, true);
  assert.equal(loadFilms(store)[0]?.technique, 'Kimura');
  assert.equal(loadFilms(store)[0]?.note, '');
});

test('the journal library is not written without a fundamental and a clip', async () => {
  const store = memory();
  const replay = createReplay();
  replay.title = 'Saturday finals';
  const blob = new Blob(['12345678'], { type: 'video/mp4' });
  const missingLink = await addStandaloneReviewToJournalLibrary(replay, blob, '2026-11-06', store, {
    putBlob: async () => {
      throw new Error('should not store');
    },
  });
  assert.equal(missingLink.ok, false);
  if (missingLink.ok) return;
  assert.equal(missingLink.error, REVIEW_LIBRARY_NEEDS_LINK);
  replay.indexLink = { id: 'sub.kimura', name: 'Kimura' };
  const missingClip = await addStandaloneReviewToJournalLibrary(replay, blob, '2026-11-06', store, {
    putBlob: async () => {
      throw new Error('should not store');
    },
  });
  assert.equal(missingClip.ok, false);
  if (missingClip.ok) return;
  assert.equal(missingClip.error, REVIEW_LIBRARY_NEEDS_CLIP);
  assert.equal(store.bag.has(FILM_STORAGE_KEY), false);
  assert.equal(loadFilms(store).length, 0);
  assert.equal(loadStudentReport(store).checklist.length, 0);
});
