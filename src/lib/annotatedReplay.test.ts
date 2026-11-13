import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { syncSendGate } from './coachSync.ts';
import {
  ANNOTATED_FALLBACK_COPY,
  annotatedFileName,
  burnInCaps,
  chooseAnnotatedMime,
  fileNameForMime,
} from './annotatedReplay.ts';

test('annotated video prefers mp4, then webm, and skips a browser with no recorder', () => {
  assert.equal(
    chooseAnnotatedMime((mime) => mime === 'video/mp4' || mime.startsWith('video/webm')),
    'video/mp4',
  );
  assert.equal(
    chooseAnnotatedMime((mime) => mime.startsWith('video/webm')),
    'video/webm;codecs=vp9',
  );
  assert.equal(chooseAnnotatedMime(() => false), null);
  assert.deepEqual(burnInCaps({ captureStream: false, mediaRecorder: true, isTypeSupported: () => true }), {
    mime: 'video/mp4',
    available: false,
  });
  assert.equal(burnInCaps({ captureStream: true, mediaRecorder: false, isTypeSupported: () => true }).available, false);
  assert.equal(
    burnInCaps({ captureStream: true, mediaRecorder: true, isTypeSupported: (mime) => mime === 'video/webm' }).mime,
    'video/webm',
  );
});

test('annotated file names stay beside the existing replay name', () => {
  assert.equal(annotatedFileName('2026-11-04', 'Round 2', 'video/mp4', 'replay-1'), 'annotated-replay-2026-11-04-round-2-eplay1.mp4');
  assert.equal(annotatedFileName('2026-11-04', 'Round 2', 'image/png', 'replay-1', true), 'annotated-replay-2026-11-04-round-2-eplay1.png');
  assert.equal(fileNameForMime('annotated-replay-2026-11-04-round-2-eplay1.mp4', 'video/webm'), 'annotated-replay-2026-11-04-round-2-eplay1.webm');
});

test('send to a student still uses the existing gate; replay analysis does not add a video send', () => {
  assert.equal(syncSendGate({ guestId: 'guest-1', linkedStudentId: 'stu-1', coachSync: 'on' }, 'owner'), 'guest');
  assert.equal(syncSendGate({ linkedStudentId: '', coachSync: 'on' }, 'owner'), 'unlinked');
  assert.equal(syncSendGate({ linkedStudentId: 'stu-1', coachSync: 'off' }, 'owner'), 'sync-off');
  assert.equal(syncSendGate({ linkedStudentId: 'stu-1', coachSync: 'on' }, 'assistant'), 'assistant');
  assert.equal(syncSendGate({ linkedStudentId: 'stu-1', coachSync: 'on' }, 'coach'), 'send');
  assert.match(ANNOTATED_FALLBACK_COPY, /cannot bake the drawings/);

  const card = readFileSync(new URL('../components/ReplayAnalysisCard.tsx', import.meta.url), 'utf8');
  const save = readFileSync(new URL('./replaySave.ts', import.meta.url), 'utf8');
  const sync = readFileSync(new URL('./coachSync.ts', import.meta.url), 'utf8');
  const player = readFileSync(new URL('../components/ReplayPlayer.tsx', import.meta.url), 'utf8');
  assert.match(card, /saveReplayClip\(/);
  assert.doesNotMatch(card, /sendCardSync|sendCoachNote|sendToDailyVideos|Send to student/);
  assert.doesNotMatch(player, /sendCardSync|sendCoachNote|sendToDailyVideos|Send to student/);
  assert.doesNotMatch(save, /Send to student|syncSendGate|annotated/);
  assert.doesNotMatch(sync, /annotated|recordVisibleClip|Save annotated/);
});
