import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APPROVAL_WAITING,
  GALLERY_HOLD_MS,
  REQUIRE_APPROVAL_LABEL,
  canApproveGallery,
  canSetGalleryApproval,
  galleryHoldExpired,
  pendingDayCopy,
  playsInGallery,
  readGalleryApproval,
  writeGalleryApproval,
} from './galleryApproval.ts';

function memory() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  };
}

test('the approval switch is off until the owner turns it on', () => {
  const storage = memory();
  assert.equal(readGalleryApproval(storage).required, false);
  writeGalleryApproval(storage, { required: true, approverSeatIds: ['seat-a'] });
  assert.deepEqual(readGalleryApproval(storage), { required: true, approverSeatIds: ['seat-a'] });
  assert.match(REQUIRE_APPROVAL_LABEL, /Require approval before photos and videos go to the gallery/);
  assert.match(APPROVAL_WAITING, /waiting/);
});

test('the owner and a named seat can approve, and a student cannot', () => {
  const settings = { required: true, approverSeatIds: ['seat-a'] };
  assert.equal(canApproveGallery({ role: 'owner', settings }), true);
  assert.equal(canApproveGallery({ role: 'seat', seatId: 'seat-a', settings }), true);
  assert.equal(canApproveGallery({ role: 'seat', seatId: 'seat-b', settings }), false);
  assert.equal(canApproveGallery({ role: 'student', settings }), false);
  assert.equal(canSetGalleryApproval({ role: 'owner' }), true);
  assert.equal(canSetGalleryApproval({ role: 'seat', presetId: 'instructors' }), true);
  assert.equal(canSetGalleryApproval({ role: 'seat', presetId: 'coach' }), false);
  assert.equal(canSetGalleryApproval({ role: 'student' }), false);
});

test('pending and rejected items leave the slideshow and expire after a month', () => {
  assert.equal(playsInGallery('approved'), true);
  assert.equal(playsInGallery(undefined), true);
  assert.equal(playsInGallery('pending'), false);
  assert.equal(playsInGallery('rejected'), false);
  const added = 1_000;
  assert.equal(galleryHoldExpired(added, added + GALLERY_HOLD_MS - 1), false);
  assert.equal(galleryHoldExpired(added, added + GALLERY_HOLD_MS), true);
  assert.equal(pendingDayCopy(1), '1 photo or video is waiting for approval.');
  assert.equal(pendingDayCopy(2), '2 photos and videos are waiting for approval.');
  assert.equal(pendingDayCopy(0), '');
});
