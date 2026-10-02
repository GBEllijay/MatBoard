import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DOWNLOAD_TODAY_LABEL,
  GALLERY_TODAY_EMPTY,
  galleryTodayReadyCopy,
  galleryVideoDownloadName,
  galleryVideosForDay,
  type GalleryDayClip,
} from './galleryDay.ts';
import { localDateKey } from './trainingNotesStore.ts';

function clip(partial: Partial<GalleryDayClip> & Pick<GalleryDayClip, 'id' | 'addedAt' | 'mime'>): GalleryDayClip {
  return {
    label: partial.id,
    ...partial,
  };
}

test("today's shared gallery is videos saved on that local day", () => {
  const today = new Date(2026, 8, 27, 9, 15, 0);
  const yesterday = new Date(2026, 8, 26, 23, 50, 0);
  const key = localDateKey(today);
  assert.equal(key, '2026-09-27');

  const items = [
    clip({ id: 'photo', mime: 'image/jpeg', addedAt: today.getTime(), label: 'Photo 1' }),
    clip({ id: 'old', mime: 'video/mp4', addedAt: yesterday.getTime(), label: 'Video yesterday' }),
    clip({ id: 'b', mime: 'video/webm', addedAt: today.getTime() + 1000, label: 'Video 2' }),
    clip({ id: 'a', mime: 'video/mp4', addedAt: today.getTime(), label: 'Video 1' }),
    clip({ id: 'bad', mime: 'video/mp4', addedAt: Number.NaN, label: 'Broken' }),
  ];

  const todayVideos = galleryVideosForDay(items, key);
  assert.deepEqual(
    todayVideos.map((item) => item.id),
    ['a', 'b'],
  );
  assert.deepEqual(galleryVideosForDay(items, '2026-09-26').map((item) => item.id), ['old']);
  assert.deepEqual(galleryVideosForDay(items, 'nope'), []);
  assert.equal(galleryVideosForDay([], key).length, 0);
});

test('download names and empty copy stay explicit', () => {
  assert.equal(DOWNLOAD_TODAY_LABEL, "Download today's videos");
  assert.equal(GALLERY_TODAY_EMPTY, 'Nothing in the shared gallery for today.');
  assert.equal(galleryTodayReadyCopy(0), '0 videos in the shared gallery for today.');
  assert.equal(galleryTodayReadyCopy(1), '1 video in the shared gallery for today.');
  assert.equal(galleryTodayReadyCopy(2), '2 videos in the shared gallery for today.');
  assert.equal(galleryVideoDownloadName('Video 1', 'video/mp4', 0), 'today-01-video-1.mp4');
  assert.equal(galleryVideoDownloadName('  Clip / A  ', 'video/webm; codecs=vp9', 1), 'today-02-clip-a.webm');
  assert.equal(galleryVideoDownloadName('***', 'application/octet-stream', 2), 'today-03-video.mp4');
});
