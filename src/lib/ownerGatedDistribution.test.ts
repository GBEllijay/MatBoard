import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLOUD_FORBIDDEN_MESSAGE,
  QUEUED_MESSAGE,
  REVIEW_VIDEO_PACKET_KIND,
  REVIEW_VIDEO_STAYS_MESSAGE,
  REVIEW_VIDEO_STUDENT_BLOCKED_MESSAGE,
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
  queueReviewVideoPackets,
  readQcLog,
  readReviewVideoInbox,
  rejectDistribution,
  reviewVideoMayReachStudent,
  selectAudienceTargets,
  selectDivisionTargets,
  studentBoundCloudUploadBlocked,
  studentMayReceiveDistributedVideo,
  studentMayUploadVideo,
  submitDistribution,
  targetFromRoster,
  type DistributionItem,
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

function leftoverReviewItem(): DistributionItem {
  return {
    id: 'review.leftover',
    kind: 'review-video',
    title: 'Armbar from closed guard',
    note: 'Watch the hip pinch at 0:32.',
    sentBy: { name: 'Instructor Guise', seatId: 'seat-1' },
    sentAt: 1_731_500_000_000,
    dateKey: '2026-11-13',
    lesson: 'Armbar from guard',
    targets: [alex, micah],
    media,
    status: 'pending',
    approvalRequired: true,
  };
}

function approvedPacket(): ReviewVideoPacket {
  return {
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
}

test('kid card is detected from belt mode or a kids roster belt, not from receive rules', () => {
  assert.equal(isKidCard({ beltMode: 'kids' }), true);
  assert.equal(isKidCard({ belt: 'Grey' }), true);
  assert.equal(isKidCard({ belt: 'Blue', beltMode: 'adult' }), false);
  assert.equal(kidCardOfReport({ beltBook: { mode: 'kids' } }), true);
  assert.equal(kidCardOfReport({ beltBook: { mode: 'adult' }, profile: { belt: 'Blue' } }), false);
});

test('Record for Review videos are never received by students; the kid flag still only limits upload', () => {
  assert.equal(studentMayReceiveDistributedVideo({ kidCard: true }), false);
  assert.equal(studentMayReceiveDistributedVideo({ kidCard: false }), false);
  assert.equal(reviewVideoMayReachStudent(), false);
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

test('submit refuses a Record for Review video and does not write a queue row, packets, or QC record', () => {
  const store = memoryStore();
  const result = submitDistribution(draft(), store, true);
  assert.equal('ok' in result && result.ok === false, true);
  if ('ok' in result && result.ok === false) assert.equal(result.error, REVIEW_VIDEO_STAYS_MESSAGE);
  const open = submitDistribution(draft(), store, false);
  assert.equal('ok' in open && open.ok === false, true);
  if ('ok' in open && open.ok === false) assert.equal(open.error, REVIEW_VIDEO_STAYS_MESSAGE);
  assert.equal(pendingDistribution(store).length, 0);
  assert.equal(readQcLog(store).length, 0);
  assert.equal(readReviewVideoInbox(store).length, 0);
});

test('fan-out never creates student packets, even for an already-approved leftover review item', () => {
  const approved: DistributionItem = { ...leftoverReviewItem(), status: 'approved', decidedAt: 1 };
  const direct: DistributionItem = { ...leftoverReviewItem(), status: 'sent-direct', decidedAt: 1 };
  assert.deepEqual(fanOutPackets(approved), []);
  assert.deepEqual(fanOutPackets(direct), []);
  const store = memoryStore();
  queueReviewVideoPackets(store, [approvedPacket()]);
  assert.equal(readReviewVideoInbox(store, 'stu-alex').length, 0);
  assert.equal(readReviewVideoInbox(store).length, 0);
});

test('a leftover review-video in the queue cannot be approved or delivered to students', () => {
  const store = memoryStore();
  const item = leftoverReviewItem();
  store.setItem('matboard.gym.distributionQueue.v1', JSON.stringify({ version: 1, items: [item] }));
  assert.equal(pendingDistribution(store).length, 0);
  const approved = approveDistribution(item.id, store, 'Owner');
  assert.equal('ok' in approved && approved.ok === false, true);
  if ('ok' in approved && approved.ok === false) assert.equal(approved.error, REVIEW_VIDEO_STAYS_MESSAGE);
  const rejected = rejectDistribution(item.id, store, 'Owner');
  assert.equal('ok' in rejected && rejected.ok === false, true);
  if ('ok' in rejected && rejected.ok === false) assert.equal(rejected.error, REVIEW_VIDEO_STAYS_MESSAGE);
  assert.equal(readReviewVideoInbox(store).length, 0);
  assert.equal(readQcLog(store).length, 0);
});

test('journal ingest always refuses a review-video packet, approved or not', async () => {
  const store = memoryStore();
  const deps = {
    films: [],
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' }),
    canStore: async () => true,
    putBlob: async () => {},
  };
  const approved = await ingestReviewVideoPacket(approvedPacket(), store, deps);
  assert.equal(approved.ok, false);
  if (!approved.ok) assert.equal(approved.error, REVIEW_VIDEO_STUDENT_BLOCKED_MESSAGE);
  const unapproved = await ingestReviewVideoPacket(
    { ...approvedPacket(), approval: 'pending' as ReviewVideoPacket['approval'] },
    store,
    deps,
  );
  assert.equal(unapproved.ok, false);
  if (!unapproved.ok) {
    assert.equal(unapproved.error, REVIEW_VIDEO_STUDENT_BLOCKED_MESSAGE);
    assert.notEqual(unapproved.error, UNAPPROVED_MESSAGE);
  }
  assert.equal(readQcLog(store).length, 0);
});

test('notes use the gated flow, with a QC row whether approval is on or off', () => {
  const store = memoryStore();
  const noteDraft = draft({ kind: 'note', media: undefined, title: 'Work the hip escape', note: 'Before Friday.' });
  const held = submitDistribution(noteDraft, store, true);
  assert.ok('item' in held && held.item.kind === 'note' && held.item.status === 'pending' && held.qc.action === 'queued');
  if ('item' in held) {
    assert.equal(held.message, QUEUED_MESSAGE);
    assert.equal(held.packets.length, 0);
    assert.equal(pendingDistribution(store).length, 1);
  }
  const open = memoryStore();
  const sent = submitDistribution(noteDraft, open, false);
  assert.ok('item' in sent && sent.item.status === 'sent-direct' && sent.qc.action === 'sent-direct');
  if ('item' in sent) {
    assert.equal(sent.message, SENT_DIRECT_MESSAGE);
    assert.equal(sent.packets.length, 0);
    assert.equal(readQcLog(open)[0]?.action, 'sent-direct');
  }
});

test('reject leaves a note in the QC log and does not fan out', () => {
  const store = memoryStore();
  const queued = submitDistribution(draft({ kind: 'note', media: undefined, title: 'Work the hip escape' }), store, true);
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
