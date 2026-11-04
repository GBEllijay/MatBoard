import assert from 'node:assert/strict';
import test from 'node:test';
import { enableParentGate, readParentGate } from './parentGate.ts';
import {
  canApproveStudentPhoto,
  chooseCardPhoto,
  createPhotoSubmission,
  decidePhoto,
  intakePhotoSubmission,
  markPhotoPublished,
  parentApprovePhoto,
  photoReadyToSend,
  readPhotoReviews,
  savePhotoReview,
  studentPhotoPath,
} from './rosterPhotoApproval.ts';
import { TEST_LOGO, testMemory } from './testPackets.ts';

const card = { id: 'card-1', linkedStudentId: 'stu-alex' };

function submission(parentRequired = false) {
  const created = createPhotoSubmission({ studentId: 'stu-alex', image: TEST_LOGO, parentRequired, now: 5, photoId: 'photo-1' });
  if (!created.ok) throw new Error(created.error);
  return created;
}

test('student: a photo waits for the parent when the toggle is on', async () => {
  const storage = testMemory();
  await enableParentGate(storage, '2468');
  const created = submission(true);
  assert.equal(created.state, 'awaiting-parent');
  assert.equal(photoReadyToSend(created.submission), false);
  const wrong = await parentApprovePhoto(created.submission, '1111', readParentGate(storage).pinHash);
  assert.equal(wrong.ok, false);
  const right = await parentApprovePhoto(created.submission, '2468', readParentGate(storage).pinHash);
  assert.equal(right.ok, true);
  if (right.ok) assert.equal(photoReadyToSend(right.submission), true);
  assert.equal(submission(false).state, 'ready-to-send');
  assert.equal(createPhotoSubmission({ studentId: 'stu-alex', image: 'https://x', parentRequired: false }).ok, false);
});

test('coach intake: guest, unlinked, sync off and wrong student are refused', () => {
  const { submission: photo } = submission();
  assert.deepEqual(intakePhotoSubmission({ ...card, guestId: 'g' }, photo), { ok: false, reason: 'guest' });
  assert.deepEqual(intakePhotoSubmission({ id: 'c' }, photo), { ok: false, reason: 'unlinked' });
  assert.deepEqual(intakePhotoSubmission({ ...card, coachSync: 'off' }, photo), { ok: false, reason: 'sync-off' });
  assert.deepEqual(intakePhotoSubmission({ ...card, linkedStudentId: 'stu-x' }, photo), { ok: false, reason: 'wrong-student' });
});

test('coach card parent toggle holds a photo with no parent stamp', () => {
  const { submission: photo } = submission();
  const intake = intakePhotoSubmission({ ...card, parentPhotoApproval: true }, photo);
  assert.equal(intake.ok && intake.review.stage, 'awaiting-parent');
  if (!intake.ok) return;
  assert.deepEqual(decidePhoto(intake.review, 'owner', 'approve'), { ok: false, reason: 'awaiting-parent' });
});

test('only the head coach (owner or Instructors seat) approves; assistant and others cannot', () => {
  const { submission: photo } = submission();
  const intake = intakePhotoSubmission(card, photo);
  if (!intake.ok) throw new Error('intake');
  assert.equal(intake.review.stage, 'awaiting-head-coach');
  for (const actor of ['coach', 'assistant', 'director', 'student', 'parent'] as const) {
    assert.equal(canApproveStudentPhoto(actor), false);
    assert.deepEqual(decidePhoto(intake.review, actor, 'approve'), { ok: false, reason: 'not-head-coach' });
  }
  const approved = decidePhoto(intake.review, 'head', 'approve', 9);
  assert.equal(approved.ok && approved.review.stage, 'approved');
  if (!approved.ok) return;
  assert.deepEqual(decidePhoto(approved.review, 'owner', 'decline'), { ok: false, reason: 'already-decided' });
  // Approval never publishes.
  assert.equal(approved.review.publishedPath, undefined);
});

test('publish and card photo: head coach only, approved only, explicit', () => {
  const { submission: photo } = submission();
  const intake = intakePhotoSubmission(card, photo);
  if (!intake.ok) throw new Error('intake');
  const path = studentPhotoPath('stu-alex', 'photo-1', TEST_LOGO);
  assert.equal(path, 'students/stu-alex/photos/approved/photo-1.png');
  assert.deepEqual(markPhotoPublished(intake.review, 'owner', path), { ok: false, reason: 'not-approved' });
  const approved = decidePhoto(intake.review, 'owner', 'approve');
  if (!approved.ok) throw new Error('approve');
  assert.deepEqual(markPhotoPublished(approved.review, 'assistant', path), { ok: false, reason: 'not-head-coach' });
  const published = markPhotoPublished(approved.review, 'owner', path);
  assert.equal(published.ok && published.review.publishedPath, path);
  assert.deepEqual(chooseCardPhoto([intake.review], 'photo-1', 'owner'), { ok: false, reason: 'not-approved' });
  assert.deepEqual(chooseCardPhoto([approved.review], 'photo-1', 'coach'), { ok: false, reason: 'not-head-coach' });
  const chosen = chooseCardPhoto([approved.review], 'photo-1', 'head');
  assert.equal(chosen.ok && chosen.image, TEST_LOGO);
  const declined = decidePhoto(intake.review, 'owner', 'decline');
  if (!declined.ok) throw new Error('decline');
  assert.deepEqual(chooseCardPhoto([declined.review], 'photo-1', 'owner'), { ok: false, reason: 'not-approved' });
});

test('review store keeps reviews on the coach device', () => {
  const storage = testMemory();
  const intake = intakePhotoSubmission(card, submission().submission);
  if (!intake.ok) throw new Error('intake');
  savePhotoReview(storage, intake.review);
  assert.equal(readPhotoReviews(storage).length, 1);
});
