import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  DRIVE_HANDOFF_CONNECT,
  acceptInviteFromFolder,
  memoryHandoffFolder,
  packetCarriesBytes,
  parseHandoffPacket,
  planHandoff,
  publishSeatToGym,
  sendInviteHandoff,
  sendReviewHandoff,
  takeReviewHandoffs,
} from './driveHandoff.ts';
import { DRIVE_SCOPES } from './googleDrive.ts';
import { acceptInstructorInvite, issueInstructorInvite, readCurrentSeat } from './instructorSeats.ts';
import { decideReview, listReviewSubmissions, submitForReview } from './reviewInbox.ts';
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

test('an unconnected browser must connect before a handoff, and packets carry no files', async () => {
  storage.clear();
  assert.equal(planHandoff(false), 'connect');
  assert.equal(planHandoff(true), 'send');
  assert.equal(await publishSeatToGym({
    id: 'seat',
    gymId: 'gym',
    email: 'coach@gym.test',
    status: 'invited',
    issuedAt: 1,
    presetId: 'coach',
    permissions: {
      galleryUpload: false,
      dailyLessonPlanAccess: true,
      rosterSubmit: true,
      rosterPull: true,
      downloadTodaysVideos: true,
      uploadForDistribution: true,
      eventsAccess: false,
      proShopAccess: false,
    },
    inviteToken: 'token',
  }), 'connect');
  assert.equal(
    DRIVE_SCOPES,
    'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
  );
  const source = readFileSync(new URL('./driveHandoff.ts', import.meta.url), 'utf8');
  assert.equal(DRIVE_HANDOFF_CONNECT, 'Connect Drive to send to your coach/instructor');
  assert.match(source, /saveDriveTextFile/);
  assert.match(source, /OneDrive can use the same text packets later/);
  assert.doesNotMatch(source, /client_secret|https:\/\/www\.googleapis\.com\/auth\//);
  assert.equal(packetCarriesBytes({ photoName: 'class.jpg', photoId: 'photo-1' }), false);
  assert.equal(packetCarriesBytes({ blob: 'abc' }), true);
  assert.equal(parseHandoffPacket(JSON.stringify({ version: 1, kind: 'invite', updatedAt: 1, blob: 'abc' })), null);
});

test('another browser accepts an invite from the gym folder without unlocking Coach or Pro', async () => {
  storage.clear();
  const issued = issueInstructorInvite({
    email: 'coach@gym.test',
    presetId: 'coach',
    origin: 'https://advantage.test',
    token: 'cross-token',
  });
  assert.equal(issued.ok, true);
  if (!issued.ok) return;
  const folder = memoryHandoffFolder();
  await sendInviteHandoff(folder, issued.seat, 40);
  const raw = [...folder.files.values()][0] ?? '';
  assert.match(raw, /"kind":"invite"/);
  assert.doesNotMatch(raw, /blob|base64|data:/i);
  assert.equal(packetCarriesBytes(JSON.parse(raw)), false);

  storage.clear();
  const accepted = await acceptInviteFromFolder(folder, 'cross-token');
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.seat.email, 'coach@gym.test');
  assert.equal(accepted.seat.status, 'active');
  assert.equal(readCurrentSeat()?.email, 'coach@gym.test');
  assert.equal(storage.getItem('advantage.proUnlocked'), null);
  assert.equal(storage.getItem('advantage.coachUnlocked'), null);
  assert.equal(acceptInstructorInvite('cross-token').ok, true);
  assert.equal(storage.getItem('advantage.proUnlocked'), null);
  assert.equal(storage.getItem('advantage.coachUnlocked'), null);
});

test('submit-up and the instructor decision travel as text and keep the proposed copy', async () => {
  storage.clear();
  const plan = emptyPlan();
  plan.coachName = 'Alex';
  plan.classDesignation = 'GB1';
  plan.classTime = '5:00 PM';
  plan.intro = 'Passing.';
  plan.closing = 'Bow.';
  const submitted = submitForReview({
    revisionId: 'draft:2026-10-09:alex:plan',
    dateKey: '2026-10-09',
    coachName: 'Alex',
    plan,
    photoId: 'photo-1',
    photoName: 'class.jpg',
    submittedAt: 10,
  });
  const folder = memoryHandoffFolder();
  await sendReviewHandoff(folder, submitted, 10);
  const sent = [...folder.files.values()][0] ?? '';
  assert.match(sent, /class\.jpg/);
  assert.match(sent, /Passing\./);
  assert.doesNotMatch(sent, /blob|base64|data:/i);
  const coachInbox = storage.getItem('matboard.reviewInbox.v1');
  const coachTimes = storage.getItem('matboard.reviewHandoffAt.v1');

  storage.clear();
  assert.equal(await takeReviewHandoffs(folder), 1);
  assert.equal(listReviewSubmissions()[0]?.intro, 'Passing.');
  assert.equal(listReviewSubmissions()[0]?.photoName, 'class.jpg');
  assert.equal(listReviewSubmissions()[0]?.photoId, 'photo-1');
  const decided = decideReview(submitted.id, 'changes', 'Show the knee cut.');
  assert.equal(decided?.status, 'changes');
  if (!decided) return;
  await sendReviewHandoff(folder, decided, 99);

  storage.clear();
  if (coachInbox) storage.setItem('matboard.reviewInbox.v1', coachInbox);
  if (coachTimes) storage.setItem('matboard.reviewHandoffAt.v1', coachTimes);
  assert.equal(await takeReviewHandoffs(folder), 1);
  assert.equal(listReviewSubmissions().length, 1);
  assert.equal(listReviewSubmissions()[0]?.id, submitted.id);
  assert.equal(listReviewSubmissions()[0]?.status, 'changes');
  assert.equal(listReviewSubmissions()[0]?.instructorNote, 'Show the knee cut.');
  assert.equal(listReviewSubmissions()[0]?.intro, 'Passing.');
});

test('a missing invite stays on the connect guide instead of the owner lock', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const missingAt = app.indexOf("peek === 'missing'");
  const routesAt = app.indexOf('<Routes>');
  assert.ok(missingAt > 0 && routesAt > missingAt);
  assert.match(app, /InviteHandoffAccept/);
  const guide = readFileSync(new URL('../components/DriveHandoffGuide.tsx', import.meta.url), 'utf8');
  assert.match(guide, /DRIVE_HANDOFF_CONNECT/);
  const accept = readFileSync(new URL('../components/InviteHandoffAccept.tsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../components/InstructorInvitePanel.tsx', import.meta.url), 'utf8');
  const notes = readFileSync(new URL('../pages/TrainingNotes.tsx', import.meta.url), 'utf8');
  const review = readFileSync(new URL('../pages/ReviewInbox.tsx', import.meta.url), 'utf8');
  for (const source of [accept, panel, notes, review]) {
    assert.match(source, /DriveHandoffGuide/);
  }
  assert.match(accept, /pullInviteHandoff/);
  assert.match(notes, /publishReviewToGym/);
  assert.match(review, /pullReviewHandoff/);
  assert.match(review, /publishReviewToGym/);
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(css, /handoff-check--on[\s\S]*background:\s*var\(--logo-blue\)/);
});
