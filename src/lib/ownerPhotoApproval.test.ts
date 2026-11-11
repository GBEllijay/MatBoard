import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GALLERY_APPROVAL_KEY, GALLERY_REVIEW_PATH, pendingPhotosLabel, readGalleryApproval, writeGalleryApproval } from './galleryApproval.ts';
import { galleryApprovalDefaultOn, readGalleryApprovalHere } from './galleryApprovalDefault.ts';
import {
  CLASS_PHOTO_APPROVAL_OFF,
  CLASS_PHOTO_APPROVAL_ON,
  CLASS_PHOTO_CLOUD_RULE,
  CLASS_PHOTO_CLOUD_STAY,
  CLASS_PHOTO_PROMOTIONS_STAY,
  classPhotoStayCopy,
} from './classPhotoPromotions.ts';
import { DRIVE_HANDOFF_EMPTY, DRIVE_HANDOFF_NOT_CONNECTED, DRIVE_HANDOFF_READ_ERROR, reviewHandoffCheckNote } from './driveHandoff.ts';
import { CARD_SHARE_CHECK_FAILED, cardShareCheckNote } from './cardShareCheck.ts';
import { fetchCloudGalleryApproval, saveCloudGalleryApproval } from './advantageCloudMedia.ts';

function memory(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

test('gallery approval starts on for a Pro Plus Cloud owner with no saved choice', () => {
  assert.equal(readGalleryApprovalHere(memory(), () => true).required, true);
  // Other passes keep the old default.
  assert.equal(readGalleryApprovalHere(memory(), () => false).required, false);
  assert.equal(readGalleryApproval(memory()).required, false);
  assert.equal(galleryApprovalDefaultOn(() => {
    throw new Error('no pass');
  }), false);
});

test('a saved choice is never flipped by the Cloud default', () => {
  const off = memory();
  writeGalleryApproval(off, { required: false, approverSeatIds: ['seat-a'] });
  assert.deepEqual(readGalleryApprovalHere(off, () => true), { required: false, approverSeatIds: ['seat-a'] });
  const on = memory({ [GALLERY_APPROVAL_KEY]: JSON.stringify({ required: true, approverSeatIds: [] }) });
  assert.equal(readGalleryApprovalHere(on, () => false).required, true);
});

test('the owner gallery section links the existing queue as Pending photos (N)', () => {
  assert.equal(GALLERY_REVIEW_PATH, '/review');
  assert.equal(pendingPhotosLabel(3), 'Pending photos (3)');
  assert.equal(pendingPhotosLabel(0), 'Pending photos (0)');
  assert.equal(pendingPhotosLabel(null), 'Pending photos');
  const panel = readFileSync(new URL('../components/InstructorInvitePanel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /<GalleryApprovalSwitch viewer=\{\{ role: 'owner' \}\} \/>\s*<GalleryPendingLink \/>/);
  const review = readFileSync(new URL('../pages/ReviewInbox.tsx', import.meta.url), 'utf8');
  assert.match(review, /<GalleryReviewQueue \/>/);
});

test('class photo Pending copy follows the approval switch', () => {
  assert.equal(classPhotoStayCopy(false, true), `${CLASS_PHOTO_PROMOTIONS_STAY} ${CLASS_PHOTO_APPROVAL_ON}`);
  assert.equal(classPhotoStayCopy(false, false), `${CLASS_PHOTO_PROMOTIONS_STAY} ${CLASS_PHOTO_APPROVAL_OFF}`);
  assert.doesNotMatch(classPhotoStayCopy(false, false), /Pending/);
  // Cloud picks the lane on the server by role; the copy says so.
  assert.equal(classPhotoStayCopy(true, false), `${CLASS_PHOTO_CLOUD_STAY} ${CLASS_PHOTO_CLOUD_RULE}`);
  // Older callers keep the older copy.
  assert.equal(classPhotoStayCopy(false), CLASS_PHOTO_PROMOTIONS_STAY);
});

test('/review does not say "No plans are waiting" while a submission is open', () => {
  const review = readFileSync(new URL('../pages/ReviewInbox.tsx', import.meta.url), 'utf8');
  assert.match(review, /\) : revision \|\| shown \? null : \(\s*<p>No plans are waiting\./);
});

test('Check the gym folder always says what happened', () => {
  assert.equal(reviewHandoffCheckNote({ status: 'saved', count: 2 }), 'Found 2 new review rows in the gym Google Drive folder. They are in the list below.');
  assert.match(reviewHandoffCheckNote({ status: 'saved', count: 1 }), /Found 1 new review row /);
  assert.equal(reviewHandoffCheckNote({ status: 'empty', count: 0 }), DRIVE_HANDOFF_EMPTY);
  assert.equal(reviewHandoffCheckNote({ status: 'connect', count: 0 }), DRIVE_HANDOFF_NOT_CONNECTED);
  assert.equal(reviewHandoffCheckNote({ status: 'error', count: 0 }), DRIVE_HANDOFF_READ_ERROR);
  const review = readFileSync(new URL('../pages/ReviewInbox.tsx', import.meta.url), 'utf8');
  assert.match(review, /setHandoffNote\(reviewHandoffCheckNote\(result\)\)/);
  const notes = readFileSync(new URL('../pages/TrainingNotes.tsx', import.meta.url), 'utf8');
  assert.match(notes, /setHandoffNote\('Checking the gym folder…'\)/);
  assert.match(notes, /setHandoffNote\(reviewHandoffCheckNote\(result\)\)/);
  assert.match(notes, /checkReviewHandoff\(\)/);
  assert.doesNotMatch(notes, /pullReviewHandoff\(\)/);
});

test('Check for student cards always says what happened', () => {
  assert.equal(cardShareCheckNote(3, 1), 'Found 2 new student cards. 3 waiting.');
  assert.equal(cardShareCheckNote(1, 0), 'Found 1 new student card. 1 waiting.');
  assert.equal(cardShareCheckNote(2, 2), 'Nothing new. 2 still waiting.');
  assert.equal(cardShareCheckNote(0, 0), 'Checked. No student cards are waiting.');
  assert.match(CARD_SHARE_CHECK_FAILED, /Could not reach Advantage Cloud/);
  const inbox = readFileSync(new URL('../components/CoachStudentInbox.tsx', import.meta.url), 'utf8');
  assert.match(inbox, /data-card-share-check/);
});

test('the /pro-plus-cloud switch loads the Cloud setting and only the owner can save it', () => {
  const panel = readFileSync(new URL('../components/GalleryApprovalSwitch.tsx', import.meta.url), 'utf8');
  assert.match(panel, /fetchCloudGalleryApproval\(\)/);
  assert.match(panel, /saveCloudGalleryApproval\(required\)/);
  assert.match(panel, /canEditCloud = viewer\.role === 'owner' && cloudReady/);
  assert.match(panel, /disabled=\{disabled\}/);
  assert.match(panel, /CLOUD_APPROVAL_SEAT_HINT/);
});

test('the Cloud approval client reads and saves the license setting', async () => {
  assert.deepEqual(await fetchCloudGalleryApproval({ token: '' }), { ok: false });
  const seen: { url: string; method?: string; body?: string }[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    seen.push({ url: href, method: init?.method, body: typeof init?.body === 'string' ? init.body : undefined });
    return new Response(JSON.stringify({ ok: true, required: false }), { status: 200 });
  }) as typeof fetch;
  assert.deepEqual(await fetchCloudGalleryApproval({ token: 't', fetcher }), { ok: true, required: false });
  assert.match(seen[0].url, /op=gallery-approval/);
  const saved = await saveCloudGalleryApproval(false, { token: 't', fetcher });
  assert.deepEqual(saved, { ok: true, required: false });
  assert.equal(seen[1]?.method, 'POST');
  assert.match(seen[1]?.body ?? '', /"action":"gallery-approval"/);
  const refused = await saveCloudGalleryApproval(false, {
    token: 't',
    fetcher: (async () => new Response(JSON.stringify({ error: 'Nope' }), { status: 403 })) as typeof fetch,
  });
  assert.equal(refused.ok, false);
  if (!refused.ok) {
    assert.equal(refused.status, 403);
    assert.match(refused.error, /Nope/);
  }
});
