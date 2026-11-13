import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CONNECT_ACCOUNT_NOTE, CONNECT_WITH_BODY } from './cloudStorage.ts';
import { LAPSE_WHY } from './cloudLapse.ts';
import { playingFromCopy } from './gymHome.ts';
import { ACADEMY_NO_FOLDER } from './academyPathway.ts';
import { trainingClipHandoff, trainingClipStayCopy } from './lessonDrive.ts';
import { INSTRUCTOR_COACH_ENTRY, INSTRUCTOR_DRIVE_REQUIREMENT } from './productNames.ts';
import { cloudStorageChoices } from './cloudStorage.ts';
import {
  ACADEMY_NO_FOLDER_CLOUD,
  CLOUD_CONNECT_BODY,
  CLOUD_CONNECT_COLLAPSE_LABEL,
  CLOUD_CONNECT_NOTE,
  CLOUD_CONNECT_OPTIONAL,
  CLOUD_STUDENT_LICENSE_HINT,
  PLAYING_FROM_PHONE_CLOUD,
  ROSTER_CLOUD_HINT,
  TRAINING_CLOUD_LEAD,
  TRAINING_DRIVE_CONNECT_HINT_CLOUD,
  TRAINING_DRIVE_CONNECT_LABEL_CLOUD,
  academyNoFolderCopy,
  connectAccountNote,
  connectWithBody,
} from './storageCopy.ts';

test('with Advantage Cloud, storage copy says Cloud stores the files; without it, this device or the gym drive', () => {
  assert.match(connectAccountNote(true, CONNECT_ACCOUNT_NOTE), /stored there/);
  assert.doesNotMatch(connectAccountNote(true, CONNECT_ACCOUNT_NOTE), /does not host photos or videos/);
  assert.equal(connectAccountNote(false, CONNECT_ACCOUNT_NOTE), CONNECT_ACCOUNT_NOTE);
  assert.equal(connectWithBody(true, CONNECT_WITH_BODY), CLOUD_CONNECT_BODY);
  assert.equal(connectWithBody(false, CONNECT_WITH_BODY), CONNECT_WITH_BODY);
  assert.match(CLOUD_CONNECT_NOTE, /optional/);
  assert.equal(academyNoFolderCopy(true, ACADEMY_NO_FOLDER), ACADEMY_NO_FOLDER_CLOUD);
  assert.equal(academyNoFolderCopy(false, ACADEMY_NO_FOLDER), ACADEMY_NO_FOLDER);
});

test('Daily Training Videos stops giving Drive-only guidance when Cloud is on and no Drive folder is connected', () => {
  const cloud = trainingClipHandoff({ proSuite: true, driveConnected: false, cloudOn: true });
  assert.equal(cloud.share, true);
  assert.equal(cloud.lead, TRAINING_CLOUD_LEAD);
  assert.doesNotMatch(`${cloud.lead} ${cloud.action} ${cloud.warning}`, /Until Google Drive is connected/);
  assert.match(trainingClipStayCopy({ proSuite: true, driveConnected: false, cloudOn: true }), /Advantage Cloud/);
  // Without Cloud nothing changes.
  const plain = trainingClipHandoff({ proSuite: true, driveConnected: false });
  assert.match(plain.warning, /Until Google Drive is connected/);
  // A connected Drive folder keeps its own copy.
  assert.match(trainingClipHandoff({ proSuite: true, driveConnected: true, cloudOn: true }).lead, /gym Drive folder/);
  // Basic Coach is unchanged by Cloud.
  assert.equal(trainingClipHandoff({ proSuite: false, driveConnected: false, cloudOn: true }).share, false);
  assert.match(TRAINING_DRIVE_CONNECT_LABEL_CLOUD, /optional/);
  assert.match(TRAINING_DRIVE_CONNECT_HINT_CLOUD, /Optional with Advantage Cloud/);
});

test('slideshow line no longer tells a Cloud license to connect Advantage Cloud', () => {
  assert.equal(playingFromCopy('phone', true), PLAYING_FROM_PHONE_CLOUD);
  assert.doesNotMatch(playingFromCopy('phone', true), /Connect/);
  assert.match(playingFromCopy('phone'), /Connect Google Drive, OneDrive, Advantage Cloud/);
  assert.equal(playingFromCopy('advantage-cloud', true), 'Playing from Advantage Cloud.');
});

test('the paused banner explains what is paused, and the notice renders it', () => {
  assert.match(LAPSE_WHY, /^What is paused:/);
  assert.match(LAPSE_WHY, /instructor seat/);
  assert.match(LAPSE_WHY, /subscription has ended/);
  const notice = readFileSync(new URL('../components/CloudLapseNotice.tsx', import.meta.url), 'utf8');
  assert.match(notice, /\{LAPSE_WHY\}/);
  // The condition itself is untouched.
  assert.match(notice, /const active = proPlusCloudUnlocked\(\);/);
});

test('Student license box has a hint, and roster Cloud buttons are explained', () => {
  assert.match(CLOUD_STUDENT_LICENSE_HINT, /Show my student ID/);
  const panel = readFileSync(new URL('../components/AdvantageCloudMedia.tsx', import.meta.url), 'utf8');
  assert.match(panel, /CLOUD_STUDENT_LICENSE_HINT/);
  assert.match(ROSTER_CLOUD_HINT, /Get gym roster/);
  const roster = readFileSync(new URL('../components/RosterBackupTools.tsx', import.meta.url), 'utf8');
  assert.match(roster, /ROSTER_CLOUD_HINT/);
});

test('home no longer promises Dropbox, which is not connectable', () => {
  assert.doesNotMatch(INSTRUCTOR_DRIVE_REQUIREMENT, /Dropbox/);
  assert.ok(!cloudStorageChoices().some((choice) => choice.id === 'dropbox'));
});

test('the Instructor Edition flow is labeled Instructor Edition, not Advantage Coach Unlimited', () => {
  assert.equal(INSTRUCTOR_COACH_ENTRY, 'Instructor Edition');
});

test('Cloud gyms collapse Connect with to one optional line, with short expanded copy', () => {
  assert.equal(CLOUD_CONNECT_COLLAPSE_LABEL, 'Also save to Google Drive or OneDrive ›');
  assert.equal(
    CLOUD_CONNECT_OPTIONAL,
    'Optional. Also save lesson plans, photos, and videos to a Google Drive or OneDrive folder your gym owns. That folder stays in your account.',
  );
  assert.doesNotMatch(CLOUD_CONNECT_OPTIONAL, /This gym has Advantage Cloud/);
});
