import assert from 'node:assert/strict';
import test from 'node:test';
import { cloudStorage } from './cloudStorage.ts';
import {
  PHOTOS_CHOOSE_LIBRARY,
  PHOTOS_LIBRARY_ID,
  PHOTOS_PICK_MAX,
  PHOTOS_SCOPES,
  PHOTOS_SETUP_NEEDED,
  PHOTOS_WEB_URL,
  createPhotosPickerSession,
  downloadPhotosFile,
  listPickedPhotos,
  nextPhotosPoll,
  parseDurationSeconds,
  photosContentUrl,
  photosImportProgressLabel,
  photosItemsForKind,
  photosItemsFromList,
  photosKindMissCopy,
  photosOwnerFacingError,
  photosPickerUrl,
  photosPollWaitMs,
  photosSignInFailureCopy,
} from './googlePhotos.ts';

test('Google Photos uses the Picker scope and does not request the removed Library scope', () => {
  assert.equal(PHOTOS_SCOPES, 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly');
  assert.doesNotMatch(PHOTOS_SCOPES, /photoslibrary/);
  assert.equal(PHOTOS_PICK_MAX, '50');
  assert.equal(PHOTOS_LIBRARY_ID, 'library');
  assert.match(PHOTOS_CHOOSE_LIBRARY, /Media Console/);
  assert.match(PHOTOS_CHOOSE_LIBRARY, /does not host/);
  assert.match(PHOTOS_SETUP_NEEDED, /not available on this build yet — contact Advantage/);
  assert.doesNotMatch(PHOTOS_SETUP_NEEDED, /client id|oauth|cloud console|client secret|photoslibrary/i);
  assert.equal(
    photosSignInFailureCopy({ code: 'invalid-client', detail: 'invalid_client', dev: false }),
    'Google did not finish sign-in. Try again, or ask whoever set up Advantage to allow this website.',
  );
  assert.doesNotMatch(
    photosSignInFailureCopy({ code: 'failed', detail: '{"error":"invalid_client"}', dev: false }),
    /client id|oauth|photoslibrary/i,
  );
  assert.equal(photosOwnerFacingError('{"error":"access_denied"}'), 'Google Photos could not be opened.');
  assert.match(photosOwnerFacingError('That video is still processing in Google Photos.'), /still processing/);
});

test('picker polling, urls, and picked items stay explicit', () => {
  assert.equal(parseDurationSeconds('3.5s', 2), 3.5);
  assert.equal(parseDurationSeconds('0s', 2), 0);
  assert.equal(parseDurationSeconds('later', 2), 2);
  assert.equal(photosPollWaitMs('0.2s'), 1000);
  assert.equal(photosPollWaitMs('90s'), 30_000);
  assert.equal(nextPhotosPoll({ elapsedMs: 0, mediaItemsSet: true, timeoutIn: '30s' }), 'ready');
  assert.equal(nextPhotosPoll({ elapsedMs: 0, mediaItemsSet: false, timeoutIn: '0s' }), 'timeout');
  assert.equal(nextPhotosPoll({ elapsedMs: 31_000, mediaItemsSet: false, timeoutIn: '30s' }), 'timeout');
  assert.equal(nextPhotosPoll({ elapsedMs: 1000, mediaItemsSet: false, timeoutIn: '30s' }), 'wait');
  assert.equal(
    photosPickerUrl('https://photos.google.com/picker/session/abc/'),
    'https://photos.google.com/picker/session/abc/autoclose',
  );
  assert.equal(photosPickerUrl('https://photos.google.com/picker/session/abc/autoclose'), 'https://photos.google.com/picker/session/abc/autoclose');
  assert.equal(photosContentUrl('https://lh3.googleusercontent.com/p/abc', 'photo'), 'https://lh3.googleusercontent.com/p/abc=d');
  assert.equal(photosContentUrl('https://lh3.googleusercontent.com/p/abc', 'video'), 'https://lh3.googleusercontent.com/p/abc=dv');
  assert.equal(photosContentUrl('https://lh3.googleusercontent.com/p/abc=d', 'photo'), 'https://lh3.googleusercontent.com/p/abc=d');
  assert.equal(photosImportProgressLabel(0, 2), 'Opening 1 of 2 files from Google Photos…');
  assert.match(photosKindMissCopy('photo'), /takes photos/);

  const items = photosItemsFromList({
    mediaItems: [
      {
        id: 'photo-1',
        type: 'PHOTO',
        mediaFile: { baseUrl: 'https://lh3.googleusercontent.com/p/photo', mimeType: 'image/jpeg', filename: 'Belt.jpg' },
      },
      {
        id: 'video-1',
        type: 'VIDEO',
        mediaFile: {
          baseUrl: 'https://lh3.googleusercontent.com/p/video',
          mimeType: 'video/mp4',
          filename: 'Armbar.mp4',
          mediaFileMetadata: { videoMetadata: { processingStatus: 'PROCESSING' } },
        },
      },
      {
        id: 'video-1',
        type: 'VIDEO',
        mediaFile: { baseUrl: 'https://lh3.googleusercontent.com/p/dup', mimeType: 'video/mp4', filename: 'Dup.mp4' },
      },
      { id: '', type: 'PHOTO', mediaFile: { baseUrl: 'https://lh3.googleusercontent.com/p/x', filename: 'Skip.jpg' } },
    ],
  });
  assert.equal(items.length, 2);
  assert.equal(items[0]?.kind, 'photo');
  assert.equal(items[0]?.videoReady, true);
  assert.equal(items[1]?.videoReady, false);
  assert.deepEqual(
    photosItemsForKind(items, 'photo').map((item) => item.id),
    ['photo-1'],
  );
  assert.equal(photosItemsForKind(items, 'any').length, 2);
});

test('picker session create, list, and download call the Photos Picker API', async () => {
  const calls: { url: string; method: string; authorization: string }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      authorization: headers.get('Authorization') ?? '',
    });
    if (url.endsWith('/v1/sessions') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { pickingConfig?: { maxItemCount?: string } };
      assert.equal(body.pickingConfig?.maxItemCount, '50');
      return Response.json({
        id: 'sess-1',
        pickerUri: 'https://photos.google.com/picker/session/sess-1',
        mediaItemsSet: false,
        pollingConfig: { pollInterval: '2s', timeoutIn: '120s' },
      });
    }
    if (url.includes('/v1/mediaItems')) {
      return Response.json({
        mediaItems: [
          {
            id: 'photo-9',
            type: 'PHOTO',
            mediaFile: {
              baseUrl: 'https://lh3.googleusercontent.com/p/photo-9',
              mimeType: 'image/jpeg',
              filename: 'Open mat.jpg',
            },
          },
        ],
      });
    }
    if (url.includes('googleusercontent.com')) {
      return new Response(new Blob(['jpeg-bytes']), { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
    }
    return new Response('missing', { status: 404 });
  };

  const session = await createPhotosPickerSession('token-1', fetcher);
  assert.equal(session.id, 'sess-1');
  assert.equal(session.pickerUri, 'https://photos.google.com/picker/session/sess-1');
  const picked = await listPickedPhotos('token-1', 'sess-1', fetcher);
  assert.equal(picked[0]?.name, 'Open mat.jpg');
  const blob = await downloadPhotosFile('token-1', picked[0]!, fetcher);
  assert.equal(await blob.text(), 'jpeg-bytes');
  assert.equal(calls[0]?.method, 'POST');
  assert.equal(calls[0]?.authorization, 'Bearer token-1');
  assert.match(calls[1]?.url ?? '', /sessionId=sess-1/);
  assert.equal(calls[2]?.url, 'https://lh3.googleusercontent.com/p/photo-9=d');
  assert.equal(calls[2]?.authorization, 'Bearer token-1');
});

test('Google Photos connect is live and stays quiet without the shared Google client id', async () => {
  const photos = cloudStorage('googlePhotos');
  assert.equal(photos.phase, 'live');
  assert.equal(photos.displayName, 'Google Photos');
  assert.equal(photos.isAvailable(), false);
  assert.equal(photos.isConnected(), false);
  assert.equal(photos.binding(), null);
  assert.equal(photos.choosePrompt, PHOTOS_CHOOSE_LIBRARY);
  assert.equal(photos.openFolderUrl(PHOTOS_LIBRARY_ID), PHOTOS_WEB_URL);
  assert.equal(photos.openFolderUrl('not-the-library'), null);
  assert.match(photos.unavailableMessage(), /contact Advantage/);
  assert.doesNotMatch(photos.unavailableMessage(), /coming soon|coming for launch|client id|oauth|client secret/i);
  const connected = await photos.connect();
  assert.equal(connected.ok, false);
  if (!connected.ok) {
    assert.equal(connected.reason, 'unavailable');
    assert.match(connected.message, /contact Advantage/);
  }
  await assert.rejects(() => photos.save('token', { name: 'note.txt', text: 'hi' }), /contact Advantage/);
  await assert.rejects(() => photos.open('token'), /contact Advantage/);
  photos.disconnect();
});
