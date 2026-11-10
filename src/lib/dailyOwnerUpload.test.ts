import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLOUD_PHOTO_DRIVE_NOTE,
  CLOUD_PHOTO_PHONE_NOTE,
  isDailyPhoto,
  isDailyVideo,
  uploadDailyMediaFile,
} from './dailyOwnerUpload.ts';

test('a photo uses the gallery publish path and does not claim Advantage Cloud stored it', async () => {
  assert.equal(isDailyPhoto(new File(['x'], 'class.jpg', { type: 'image/jpeg' })), true);
  assert.equal(isDailyVideo(new File(['x'], 'class.jpg', { type: 'image/jpeg' })), false);
  assert.equal(isDailyVideo(new File(['x'], 'class.mp4', { type: 'video/mp4' })), true);
  const photo = await uploadDailyMediaFile(new File(['pixels'], 'class.jpg', { type: 'image/jpeg' }), '2026-11-10');
  assert.equal(photo.cloud, false);
  assert.equal(photo.message, CLOUD_PHOTO_PHONE_NOTE);
  assert.match(photo.message, /did not store this photo/);
  assert.doesNotMatch(photo.message, /Uploaded to Advantage Cloud/);
  assert.notEqual(photo.message, CLOUD_PHOTO_DRIVE_NOTE);
});

test('a file that is neither a photo nor a video is refused', async () => {
  const other = await uploadDailyMediaFile(new File(['{}'], 'notes.json', { type: 'application/json' }), '2026-11-10');
  assert.equal(other.ok, false);
  assert.equal(other.cloud, false);
  assert.match(other.message, /not a photo or a video/);
});
