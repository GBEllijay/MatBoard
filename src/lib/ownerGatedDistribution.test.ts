import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLOUD_FORBIDDEN_MESSAGE,
  QUEUED_MESSAGE,
  REVIEW_VIDEO_PACKET_KIND,
  SENT_DIRECT_MESSAGE,
  UNAPPROVED_MESSAGE,
  approveDistribution,
  assertNoStudentVideoOnCloud,
  chooseDistributionHome,
  distributionApprovalRequired,
  fanOutPackets,
  formatDuration,
  formatSize,
  ingestReviewVideoPacket,
  isKidCard,
  kidCardOfReport,
  memoryStore,
  pendingDistribution,
  readQcLog,
  rejectDistribution,
  selectAudienceTargets,
  selectDivisionTargets,
  studentBoundCloudUploadBlocked,
  studentMayReceiveDistributedVideo,
  studentMayUploadVideo,
  submitDistribution,
  targetFromRoster,
  type DistributionMedia,
  type DistributionTarget,
  type ReviewVideoPacket,
} from './ownerGatedDistribution.ts';

const THUMB = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4"><rect width="8" height="4" fill="%2312243a"/></svg>';

const media: DistributionMedia = {
  home: 'google-drive',
  ref: 'drive-file-1',
  fileName: 'armbar-review.mp4',
  mime: 'video/mp4',
  size: 4_500_000,
  durationMs: 95_000,
  thumbnailDataUrl: THUMB,
  title: 'Armbar from closed guard',
  lesson: 'Armbar from guard',
};

const alex: DistributionTarget = { studentId: 'stu-alex', name: 'Alex Rivera', kidCard: false, division: 'Adult Gi' };
const micah: DistributionTarget = { studentId: 'stu-micah', name: 'Micah Bates', kidCard: true, division: 'Kids Gi' };

function draft(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'review-video' as const,
    title: 'Armbar from closed guard',
    note: 'Watch the hip pinch at 0:32.',
    sentBy: { name: 'Instructor Guise', seatId: 'seat-1' },
    dateKey: '2026-11-13',
    lesson: 'Armbar from guard',
    targets: [alex, micah],
    media,
    now: 1_731_500_000_000,
    id: 'review.test1',
    ...overrides,
  };
}

test('kid card is detected from belt mode or a kids roster belt, not from receive rules', () => {
  assert.equal(isKidCard({ beltMode: 'kids' }), true);
  assert.equal(isKidCard({ belt: 'Grey' }), true);
  assert.equal(isKidCard({ belt: 'Blue', beltMode: 'adult' }), false);
  assert.equal(kidCardOfReport({ beltBook: { mode: 'kids' } }), true);
  assert.equal(kidCardOfReport({ beltBook: { mode: 'adult' }, profile: { belt: 'Blue' } }), false);
});

test('a kid-card student may receive a distributed video; the flag only limits upload', () => {
  assert.equal(studentMayReceiveDistributedVideo({ kidCard: true }), true);
  assert.equal(studentMayReceiveDistributedVideo({ kidCard: false }), true);
  assert.equal(studentMayUploadVideo({ kidCard: true, destination: 'advantage-cloud' }), false);
  assert.equal(studentMayUploadVideo({ kidCard: true, destination: 'gallery' }), false);
  assert.equal(studentMayUploadVideo({ kidCard: true, destination: 'phone' }), true);
  assert.equal(studentMayUploadVideo({ kidCard: true, destination: 'personal-drive' }), true);
  assert.equal(studentMayUploadVideo({ kidCard: false, destination: 'advantage-cloud' }), false);
  assert.equal(studentMayUploadVideo({ kidCard: false, destination: 'gallery' }), true);
  assert.equal(studentMayUploadVideo({ kidCard: false, destination: 'phone' }), true);
});

test('student-bound videos cannot use Advantage Cloud or R2 purposes', () => {
  assert.equal(studentBoundCloudUploadBlocked('advantage-cloud'), true);
  assert.equal(studentBoundCloudUploadBlocked('lesson-media'), true);
  assert.equal(studentBoundCloudUploadBlocked('replay-pending'), true);
  assert.equal(studentBoundCloudUploadBlocked('from-instructor'), true);
  assert.equal(studentBoundCloudUploadBlocked('daily-video'), true);
  assert.equal(studentBoundCloudUploadBlocked('gallery'), true);
  assert.equal(studentBoundCloudUploadBlocked('google-drive'), false);
  assert.equal(assertNoStudentVideoOnCloud('advantage-cloud').ok, false);
  assert.equal((assertNoStudentVideoOnCloud('advantage-cloud') as { error: string }).error, CLOUD_FORBIDDEN_MESSAGE);
  assert.equal(assertNoStudentVideoOnCloud('google-drive').ok, true);
  assert.equal(assertNoStudentVideoOnCloud('onedrive').ok, true);
  assert.equal(assertNoStudentVideoOnCloud('share-file').ok, true);
  assert.equal(chooseDistributionHome({ googleDrive: true, oneDrive: true }), 'google-drive');
  assert.equal(chooseDistributionHome({ oneDrive: true }), 'onedrive');
  assert.equal(chooseDistributionHome({}), 'share-file');
  assert.notEqual(chooseDistributionHome({ googleDrive: true, oneDrive: true }), 'advantage-cloud');
});

test('approval required: send is queued, not delivered, and a QC record is written', () => {
  const store = memoryStore();
  const result = submitDistribution(draft(), store, true);
  assert.ok('item' in result);
  if (!('item' in result)) return;
  assert.equal(result.item.status, 'pending');
  assert.equal(result.delivered, false);
  assert.equal(result.packets.length, 0);
  assert.equal(result.message, QUEUED_MESSAGE);
  assert.equal(result.qc.action, 'queued');
  assert.equal(pendingDistribution(store).length, 1);
  assert.equal(readQcLog(store).length, 1);
  assert.match(readQcLog(store)[0]!.summary, /kid-card/);
});

test('approval off: send goes through and a QC record is still written', () => {
  const store = memoryStore();
  const result = submitDistribution(draft(), store, false);
  assert.ok('item' in result);
  if (!('item' in result)) return;
  assert.equal(result.item.status, 'sent-direct');
  assert.equal(result.delivered, true);
  assert.equal(result.packets.length, 2);
  assert.equal(result.message, SENT_DIRECT_MESSAGE);
  assert.equal(result.qc.action, 'sent-direct');
  assert.equal(pendingDistribution(store).length, 0);
  assert.equal(readQcLog(store)[0]?.action, 'sent-direct');
  assert.ok(result.packets.some((packet) => packet.studentId === 'stu-micah' && packet.kidCard));
  assert.ok(result.packets.every((packet) => packet.approval === 'sent-direct'));
  assert.ok(result.packets.every((packet) => packet.media.home !== 'advantage-cloud'));
});

test('submit refuses an Advantage Cloud home and does not write a queue row', () => {
  const store = memoryStore();
  const result = submitDistribution(
    draft({ media: { ...media, home: 'advantage-cloud' as unknown as 'google-drive' } }),
    store,
    false,
  );
  assert.equal('ok' in result && result.ok === false, true);
  if ('ok' in result && result.ok === false) assert.equal(result.error, CLOUD_FORBIDDEN_MESSAGE);
  assert.equal(pendingDistribution(store).length, 0);
  assert.equal(readQcLog(store).length, 0);
});

test('owner approve fans the same video out to every selected student, including a kid card', async () => {
  const store = memoryStore();
  const queued = submitDistribution(draft(), store, true);
  assert.ok('item' in queued);
  if (!('item' in queued)) return;
  const approved = approveDistribution(queued.item.id, store, 'Owner');
  assert.ok('item' in approved);
  if (!('item' in approved)) return;
  assert.equal(approved.item.status, 'approved');
  assert.equal(approved.delivered, true);
  assert.equal(approved.packets.length, 2);
  assert.equal(approved.qc.action, 'approved');
  const kid = approved.packets.find((packet) => packet.kidCard);
  assert.ok(kid);
  assert.equal(kid?.studentId, 'stu-micah');
  assert.equal(kid?.media.home, 'google-drive');

  const blob = new Blob([new Uint8Array([0, 0, 0, 1, 0, 0, 0])], { type: 'video/mp4' });
  const received = await ingestReviewVideoPacket(kid!, store, {
    films: [],
    blob,
    now: 1_731_500_100_000,
    canStore: async () => true,
    putBlob: async () => {},
  });
  assert.equal(received.ok, true);
  if (received.ok) {
    assert.equal(received.film.technique, 'Armbar from guard');
    assert.equal(received.message, 'Added to the journal video library.');
  }
  assert.ok(readQcLog(store).some((row) => row.action === 'received' && /kid-card student/.test(row.summary)));
});

test('journal ingest refuses an unapproved packet, even for an adult', async () => {
  const store = memoryStore();
  const packet: ReviewVideoPacket = {
    kind: REVIEW_VIDEO_PACKET_KIND,
    version: 1,
    id: 'pkt-1',
    itemId: 'review.test1',
    studentId: 'stu-alex',
    title: 'Armbar from closed guard',
    note: '',
    lesson: 'Armbar from guard',
    dateKey: '2026-11-13',
    media,
    approval: 'approved',
    kidCard: false,
    issuedAt: 1,
  };
  const unapproved = { ...packet, approval: 'pending' as ReviewVideoPacket['approval'] };
  const refused = await ingestReviewVideoPacket(unapproved, store, {
    films: [],
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' }),
    canStore: async () => true,
    putBlob: async () => {},
  });
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error, UNAPPROVED_MESSAGE);
});

test('notes use the same gated flow, with a QC row whether approval is on or off', () => {
  const store = memoryStore();
  const noteDraft = draft({ kind: 'note', media: undefined, title: 'Work the hip escape', note: 'Before Friday.' });
  const held = submitDistribution(noteDraft, store, true);
  assert.ok('item' in held && held.item.kind === 'note' && held.item.status === 'pending' && held.qc.action === 'queued');
  const open = memoryStore();
  const sent = submitDistribution(noteDraft, open, false);
  assert.ok('item' in sent && sent.item.status === 'sent-direct' && sent.qc.action === 'sent-direct');
});

test('reject leaves the item in the QC log and does not fan out', () => {
  const store = memoryStore();
  const queued = submitDistribution(draft(), store, true);
  assert.ok('item' in queued);
  if (!('item' in queued)) return;
  const rejected = rejectDistribution(queued.item.id, store, 'Owner');
  assert.ok('item' in rejected);
  if (!('item' in rejected)) return;
  assert.equal(rejected.item.status, 'rejected');
  assert.equal(rejected.packets.length, 0);
  assert.equal(rejected.qc.action, 'rejected');
  assert.equal(fanOutPackets(rejected.item).length, 0);
});

test('division and planned Kids/Adults helpers select roster rows', () => {
  const roster = [
    { id: 'a', name: 'Alex Rivera', belt: 'Blue', division: 'Adult Gi' },
    { id: 'm', name: 'Micah Bates', belt: 'Grey', division: 'Kids Gi', beltMode: 'kids' },
    { id: 's', name: 'Sam Ortiz', belt: 'White', division: 'Adult Gi' },
  ];
  assert.equal(selectDivisionTargets(roster, 'Kids Gi').length, 1);
  assert.equal(selectDivisionTargets(roster, 'Kids Gi')[0]?.studentId, 'm');
  assert.equal(selectAudienceTargets(roster, 'kids').length, 1);
  assert.equal(selectAudienceTargets(roster, 'adults').length, 2);
  assert.equal(targetFromRoster(roster[1]!).kidCard, true);
});

test('approval helper honors an explicit override and empty storage stays off', () => {
  assert.equal(distributionApprovalRequired(memoryStore(), true), true);
  assert.equal(distributionApprovalRequired(memoryStore(), false), false);
  assert.equal(distributionApprovalRequired(memoryStore()), false);
  assert.equal(formatDuration(95_000), '1:35');
  assert.equal(formatSize(4_500_000), '4.3 MB');
});
