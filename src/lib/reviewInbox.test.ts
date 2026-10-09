import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { lessonDraftRevisionId } from './lessonDrive.ts';
import {
  REVIEW_INBOX_KEY,
  canAddApprovedPhoto,
  decideReview,
  findReviewSubmission,
  listReviewSubmissions,
  submitForReview,
} from './reviewInbox.ts';
import { emptyPlan } from './trainingNotesStore.ts';

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
    clear: () => store.clear(),
  };
}

const storage = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

test('a coach submit lands in the inbox and a later submit stays one pending row', () => {
  storage.clear();
  const plan = emptyPlan();
  plan.coachName = 'Alex';
  plan.classDesignation = 'GB1';
  plan.classTime = '5:00 PM';
  plan.intro = 'Passing.';
  plan.closing = 'Bow.';
  const revisionId = lessonDraftRevisionId('2026-10-09', 'Alex', plan.id);
  const first = submitForReview({
    revisionId,
    dateKey: '2026-10-09',
    coachName: 'Alex',
    plan,
    photoId: 'photo-1',
    photoName: 'class.jpg',
    submittedAt: 10,
  });
  assert.equal(first.status, 'pending');
  assert.equal(first.photoName, 'class.jpg');
  assert.equal(first.intro, 'Passing.');
  const decided = decideReview(first.id, 'changes', 'Show the knee cut.');
  assert.equal(decided?.status, 'changes');
  assert.equal(decided?.instructorNote, 'Show the knee cut.');
  assert.equal(canAddApprovedPhoto(decided), false);

  plan.intro = 'Passing, second pass.';
  const again = submitForReview({
    revisionId,
    dateKey: '2026-10-09',
    coachName: 'Alex',
    plan,
    photoId: 'photo-1',
    photoName: 'class.jpg',
    submittedAt: 20,
  });
  assert.equal(again.id, first.id);
  assert.equal(again.status, 'pending');
  assert.equal(again.instructorNote, '');
  assert.equal(again.intro, 'Passing, second pass.');
  assert.equal(listReviewSubmissions().length, 1);

  const approved = decideReview(again.id, 'approved', 'ignored on approve');
  assert.equal(approved?.status, 'approved');
  assert.equal(approved?.instructorNote, '');
  assert.equal(canAddApprovedPhoto(approved), true);
  assert.equal(
    findReviewSubmission({
      revisionId: 'distribution:2026-10-09:alex:' + plan.id,
      dateKey: '2026-10-09',
      coachName: 'Alex',
      planId: plan.id,
    })?.id,
    again.id,
  );
});

test('an older inbox row with no status stays pending', () => {
  storage.clear();
  localStorage.setItem(
    REVIEW_INBOX_KEY,
    JSON.stringify({
      version: 1,
      items: [
        {
          id: 'old',
          revisionId: 'draft:2026-10-01:alex:plan',
          dateKey: '2026-10-01',
          coachName: 'Alex',
          planId: 'plan',
          intro: 'Old.',
          submittedAt: 1,
        },
      ],
    }),
  );
  const [row] = listReviewSubmissions();
  assert.equal(row?.status, 'pending');
  assert.equal(row?.intro, 'Old.');
  assert.equal(row?.photoId, '');
  assert.equal(canAddApprovedPhoto(row), false);
});

test('Sunday review rows open the inbox and the lesson plan can submit', () => {
  const unlimited = readFileSync(new URL('../pages/CoachUnlimited.tsx', import.meta.url), 'utf8');
  assert.match(unlimited, /\/review\?revision=/);
  assert.match(unlimited, /plan-card__review-link/);
  const notes = readFileSync(new URL('../pages/TrainingNotes.tsx', import.meta.url), 'utf8');
  assert.match(notes, /Submit for review/);
  assert.match(notes, /submitForReview/);
  assert.match(notes, /listClassPhotoPromotions/);
  const review = readFileSync(new URL('../pages/ReviewInbox.tsx', import.meta.url), 'utf8');
  assert.match(review, /REVIEW_APPROVE/);
  assert.match(review, /REVIEW_CHANGES/);
  assert.match(review, /REVIEW_REJECT/);
  assert.match(review, /REVIEW_GALLERY/);
  assert.match(review, /REVIEW_GALLERY_MISSING/);
  assert.match(review, /addFolderFiles\(\[file\], 'gallery'\)/);
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(css, /\.home--pro \.review-inbox__actions \.review-decision--on[\s\S]*background:\s*var\(--logo-blue\)/);
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /path="\/review"/);
});
