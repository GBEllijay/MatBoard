/**
 * Leave academy: clears the folder and license, keeps journal and student ID,
 * asks about the logo, refuses the old gym's packets, and a new gym QR joins cleanly.
 * Stale link: 403/404 marks it, other failures do not.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACADEMY_STALE_COPY,
  LEAVE_LOGO_PROMPT,
  OLD_GYM_REFUSED,
  confirmAcademyLinkStale,
  forgetAcademyFolder,
  gymPacketAllowed,
  joinAcademy,
  leaveAcademy,
  moveAcademyFolder,
  readAcademyStale,
  readMembership,
  reportAcademyAccessFailure,
} from './academyMembership.ts';
import { loadAcademyLink, saveStudentDriveLink } from './academyPathway.ts';
import { buildCoachNoteUpdate, receiveSyncPacket } from './coachSync.ts';
import { importCoachText } from './coachInbound.ts';
import { ACADEMY_LICENSE_KEY, readAcademyLicense } from './studentInboxClient.ts';
import { STUDENT_GYM_LOGO_KEY } from './studentGymMark.ts';
import { addJournalEntry, blankStudentReport, loadStudentReport, saveStudentReport } from './studentEdition.ts';
import { assignStudentId } from './studentIdentity.ts';
import { testMemory } from './testPackets.ts';

function connect(storage: ReturnType<typeof testMemory>, folderId: string, gymName: string, license?: string) {
  saveStudentDriveLink(storage, { role: 'academy', provider: 'googleDrive', folderId, folderName: `${gymName} folder`, accountLabel: null, gymName });
  return joinAcademy(storage, { folderId, provider: 'googleDrive', gymName, license }, 1000);
}

function note(gym: { name: string; ids?: string[] } | null, updateId: string) {
  const built = buildCoachNoteUpdate({ studentId: 'stu-alex', note: 'Hips out.', issuedOn: '2026-11-03', journalDate: '2026-11-02', now: 5, updateId });
  if (!built.ok) throw new Error(built.error);
  return gym ? { ...built.packet, gym } : built.packet;
}

test('copy is the agreed wording', () => {
  assert.equal(ACADEMY_STALE_COPY, "Your academy link may have changed — rescan your gym's QR");
  assert.equal(LEAVE_LOGO_PROMPT, 'Remove old gym logo?');
});

test('leave clears folder, license, and current gym; keeps journal and student ID', () => {
  const storage = testMemory();
  saveStudentReport(storage, addJournalEntry(assignStudentId(blankStudentReport(10), 'stu-alex', 10), { date: '2026-11-01', className: 'Fundamentals', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: 'drilled' }));
  connect(storage, 'gymA-folder', 'North Side BJJ', 'licA-1234');
  assert.equal(readAcademyLicense(storage), 'licA-1234');
  assert.ok(loadAcademyLink(storage));
  const result = leaveAcademy(storage, { removeLogo: false });
  assert.equal(result.left, 'North Side BJJ');
  assert.equal(loadAcademyLink(storage), null);
  assert.equal(storage.getItem(ACADEMY_LICENSE_KEY), null);
  assert.equal(readMembership(storage).current, null);
  assert.ok(readMembership(storage).left[0].ids.includes('licA-1234'));
  const report = loadStudentReport(storage);
  assert.equal(report.studentId, 'stu-alex');
  assert.equal(report.journal.length, 1);
});

test('logo prompt: Keep keeps the logo, Remove removes it', () => {
  const keep = testMemory();
  keep.setItem(STUDENT_GYM_LOGO_KEY, 'data:image/png;base64,AAAA');
  connect(keep, 'folder-one-1', 'North Side BJJ');
  leaveAcademy(keep, { removeLogo: false });
  assert.ok(keep.getItem(STUDENT_GYM_LOGO_KEY));
  const drop = testMemory();
  drop.setItem(STUDENT_GYM_LOGO_KEY, 'data:image/png;base64,AAAA');
  connect(drop, 'folder-one-1', 'North Side BJJ');
  assert.equal(leaveAcademy(drop, { removeLogo: true }).logoRemoved, true);
  assert.equal(drop.getItem(STUDENT_GYM_LOGO_KEY), null);
});

test('license clears whenever the folder disconnects; folder picker in the same gym keeps it', () => {
  const storage = testMemory();
  connect(storage, 'folder-one-1', 'North Side BJJ', 'licA-1234');
  moveAcademyFolder(storage, 'folder-two-2');
  assert.equal(readAcademyLicense(storage), 'licA-1234');
  assert.ok(readMembership(storage).current?.ids.includes('folder:folder-two-2'));
  forgetAcademyFolder(storage);
  assert.equal(loadAcademyLink(storage), null);
  assert.equal(storage.getItem(ACADEMY_LICENSE_KEY), null);
});

test('old-gym packets are refused after leaving; the new gym connects cleanly', () => {
  const storage = testMemory();
  connect(storage, 'gymA-folder', 'North Side BJJ', 'licA-1234');
  const oldGym = { name: 'North Side BJJ', ids: ['licA-1234', 'folder:gymA-folder'] };
  assert.equal(gymPacketAllowed(storage, { gym: oldGym }), true);
  leaveAcademy(storage, { removeLogo: false });
  assert.equal(gymPacketAllowed(storage, { gym: oldGym }), false);
  assert.equal(receiveSyncPacket(storage, note(oldGym, 'n-old')), 'ignored');
  assert.equal(receiveSyncPacket(storage, note({ name: 'North Side BJJ' }, 'n-old-unsigned')), 'ignored');

  connect(storage, 'gymB-folder', 'Riverside Grappling', 'licB-5678');
  assert.equal(readAcademyLicense(storage), 'licB-5678');
  assert.equal(readMembership(storage).current?.name, 'Riverside Grappling');
  assert.equal(readAcademyStale(storage), false);
  const newGym = { name: 'Riverside Grappling', ids: ['licB-5678'] };
  assert.equal(receiveSyncPacket(storage, note(newGym, 'n-new')), 'queued');
  assert.equal(receiveSyncPacket(storage, note(oldGym, 'n-old-2')), 'ignored');

  const report = assignStudentId(blankStudentReport(10), 'stu-alex', 10);
  const imported = importCoachText(storage, report, JSON.stringify(note(oldGym, 'n-old-3')));
  assert.equal(imported.kind, 'error');
  if (imported.kind === 'error') assert.equal(imported.error, OLD_GYM_REFUSED);
});

test('never left a gym: older unsigned packets still arrive', () => {
  const storage = testMemory();
  assert.equal(receiveSyncPacket(storage, note(null, 'legacy')), 'queued');
});

test('stale link: 403 and 404 mark it, other failures do not, joining clears it', async () => {
  const storage = testMemory();
  assert.equal(reportAcademyAccessFailure(storage, 500), false);
  assert.equal(readAcademyStale(storage), false);
  assert.equal(reportAcademyAccessFailure(storage, 404), true);
  assert.equal(readAcademyStale(storage), true);
  connect(storage, 'folder-one-1', 'North Side BJJ');
  assert.equal(readAcademyStale(storage), false);
  const forbidden = (async () => new Response('{}', { status: 403 })) as typeof fetch;
  assert.equal(await confirmAcademyLinkStale(storage, { provider: 'googleDrive', folderId: 'folder-one-1' }, 'tok', forbidden), true);
  assert.equal(readAcademyStale(storage), true);
  const offline = (async () => {
    throw new Error('offline');
  }) as typeof fetch;
  const fresh = testMemory();
  assert.equal(await confirmAcademyLinkStale(fresh, { provider: 'googleDrive', folderId: 'folder-one-1' }, 'tok', offline), false);
  assert.equal(await confirmAcademyLinkStale(fresh, { provider: 'googleDrive', folderId: 'folder-one-1' }, null, forbidden), false);
});
