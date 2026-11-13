/**
 * Owner-gated distribution of instructor notes to Student Edition, and the
 * hard stop that keeps Record for Review videos off the student path.
 *
 * Record for Review videos stay on the instructor's device (with an optional
 * Advantage Cloud copy for the instructor only). They are never queued for
 * students, never fanned out as packets, never accepted into a student
 * journal, and never offered as a student download.
 *
 * Instructor notes (text only, no Record for Review video) can still use the
 * owner approval queue and QC log. Student and kid video bytes never go to
 * Advantage Cloud (R2).
 */

import { beltModeOf } from './beltBook.ts';
import { isKidsRosterBelt } from './rosterCard.ts';
import { readGalleryApprovalHere } from './galleryApprovalDefault.ts';
import {
  type FilmCommitDeps,
  type StudentFilm,
} from './studentFilm.ts';

export const DISTRIBUTION_QUEUE_KEY = 'matboard.gym.distributionQueue.v1';
export const DISTRIBUTION_QC_KEY = 'matboard.gym.distributionQc.v1';
export const REVIEW_VIDEO_INBOX_KEY = 'matboard.studentEdition.reviewVideoInbox.v1';
export const REVIEW_VIDEO_PACKET_KIND = 'coach-review-video-update' as const;

export const CLOUD_FORBIDDEN_MESSAGE = 'Student and kid videos never go to Advantage Cloud.';
export const UNAPPROVED_MESSAGE = 'This review is still waiting for the owner to approve it.';
export const QUEUED_MESSAGE = 'Sent to the owner for approval.';
export const SENT_DIRECT_MESSAGE = 'Sent to students. A record was saved for the owner to review later.';
export const NO_HOME_MESSAGE = 'Connect Google Drive or OneDrive, or save a share file. Student videos cannot go to Advantage Cloud.';
export const KID_UPLOAD_CLOUD_MESSAGE = 'A kid-card student cannot upload this video to Advantage Cloud or the gym gallery.';
export const REVIEW_VIDEO_STAYS_MESSAGE = 'Record for Review videos stay with you. Students never receive them.';
export const REVIEW_VIDEO_STUDENT_BLOCKED_MESSAGE =
  'Record for Review videos stay with the instructor. Students never receive them.';

export type DistributionKind = 'review-video' | 'note';
export type DistributionHome = 'google-drive' | 'onedrive' | 'share-file';
export type DistributionStatus = 'pending' | 'approved' | 'rejected' | 'sent-direct';

export type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export type DistributionTarget = {
  studentId: string;
  name: string;
  kidCard: boolean;
  division: string;
};

export type DistributionMedia = {
  home: DistributionHome;
  ref: string;
  fileName: string;
  mime: string;
  size: number;
  durationMs?: number;
  thumbnailDataUrl?: string;
  title: string;
  lesson?: string;
};

export type DistributionItem = {
  id: string;
  kind: DistributionKind;
  title: string;
  note: string;
  sentBy: { seatId?: string; name: string };
  sentAt: number;
  dateKey: string;
  lesson: string;
  targets: DistributionTarget[];
  media?: DistributionMedia;
  status: DistributionStatus;
  approvalRequired: boolean;
  decidedAt?: number;
};

export type QcAction = 'queued' | 'sent-direct' | 'approved' | 'rejected' | 'received';

export type QcRecord = {
  id: string;
  itemId: string;
  at: number;
  action: QcAction;
  actor: string;
  summary: string;
};

export type ReviewVideoPacket = {
  kind: typeof REVIEW_VIDEO_PACKET_KIND;
  version: 1;
  id: string;
  itemId: string;
  studentId: string;
  title: string;
  note: string;
  lesson: string;
  dateKey: string;
  media: DistributionMedia;
  approval: 'approved' | 'sent-direct';
  kidCard: boolean;
  issuedAt: number;
};

export type RosterLike = {
  id: string;
  name: string;
  belt?: string;
  division?: string;
  beltMode?: string;
  birthYear?: number;
};

const QUEUE_MAX = 200;
const QC_MAX = 400;
const TEXT_MAX = 200;

function clip(value: string, max = TEXT_MAX): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

export function isKidCard(input: { beltMode?: string; belt?: string; birthYear?: number; reportMode?: string }): boolean {
  if (input.beltMode === 'kids' || input.reportMode === 'kids') return true;
  if (input.belt && isKidsRosterBelt(input.belt)) return true;
  return false;
}

export function kidCardOfReport(report: { beltBook?: { mode?: string }; profile?: { belt?: string } } | null | undefined): boolean {
  if (!report) return false;
  try {
    if (beltModeOf(report as Parameters<typeof beltModeOf>[0]) === 'kids') return true;
  } catch {
    /* report may be a partial in tests */
  }
  const mode = report.beltBook?.mode;
  if (mode === 'kids') return true;
  return isKidCard({ belt: report.profile?.belt, beltMode: mode });
}

/** Record for Review videos are never distributed to students. */
export function studentMayReceiveDistributedVideo(_input?: { kidCard?: boolean }): false {
  return false;
}

export function reviewVideoMayReachStudent(): false {
  return false;
}

export type UploadDestination = 'advantage-cloud' | 'gallery' | 'phone' | 'personal-drive' | 'academy-drive';

/**
 * Kid-card flag limits upload only: no Advantage Cloud and no gym gallery.
 * Phone and the student's own Drive/OneDrive stay allowed. Every student's
 * video is also barred from Advantage Cloud, kid card or not.
 */
export function studentMayUploadVideo(input: { kidCard: boolean; destination: UploadDestination }): boolean {
  if (input.destination === 'advantage-cloud') return false;
  if (input.kidCard && input.destination === 'gallery') return false;
  return true;
}

export function studentBoundCloudUploadBlocked(purpose: string): boolean {
  const value = purpose.trim().toLowerCase();
  return (
    value === 'advantage-cloud' ||
    value === 'lesson-media' ||
    value === 'replay-pending' ||
    value === 'from-instructor' ||
    value === 'daily-video' ||
    value === 'gallery'
  );
}

export function assertNoStudentVideoOnCloud(home: string | DistributionHome): { ok: true } | { ok: false; error: string } {
  if (home === 'advantage-cloud' || studentBoundCloudUploadBlocked(home)) {
    return { ok: false, error: CLOUD_FORBIDDEN_MESSAGE };
  }
  return { ok: true };
}

export function chooseDistributionHome(available: { googleDrive?: boolean; oneDrive?: boolean }): DistributionHome {
  if (available.googleDrive) return 'google-drive';
  if (available.oneDrive) return 'onedrive';
  return 'share-file';
}

export function distributionApprovalRequired(
  storage: Pick<MemoryStore, 'getItem'> | null | undefined,
  override?: boolean,
): boolean {
  if (typeof override === 'boolean') return override;
  try {
    return readGalleryApprovalHere(storage ?? null).required;
  } catch {
    return false;
  }
}

function newId(prefix: string, now: number): string {
  return `${prefix}.${now.toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
}

export function selectDivisionTargets(roster: readonly RosterLike[], division: string): DistributionTarget[] {
  const key = division.trim().toLowerCase();
  if (!key) return [];
  return roster
    .filter((row) => (row.division ?? '').trim().toLowerCase() === key)
    .map(targetFromRoster);
}

export function selectAudienceTargets(roster: readonly RosterLike[], audience: 'kids' | 'adults'): DistributionTarget[] {
  return roster
    .filter((row) => (isKidCard(row) ? 'kids' : 'adults') === audience)
    .map(targetFromRoster);
}

export function targetFromRoster(row: RosterLike): DistributionTarget {
  return {
    studentId: row.id,
    name: row.name,
    kidCard: isKidCard(row),
    division: row.division ?? '',
  };
}

export function readDistributionQueue(storage: Pick<MemoryStore, 'getItem'>): DistributionItem[] {
  try {
    const raw = JSON.parse(storage.getItem(DISTRIBUTION_QUEUE_KEY) || 'null') as { items?: unknown };
    if (!Array.isArray(raw?.items)) return [];
    return raw.items.map(cleanItem).filter((row): row is DistributionItem => row != null);
  } catch {
    return [];
  }
}

export function writeDistributionQueue(storage: MemoryStore, items: readonly DistributionItem[]): DistributionItem[] {
  const next = items.map(cleanItem).filter((row): row is DistributionItem => row != null).slice(0, QUEUE_MAX);
  storage.setItem(DISTRIBUTION_QUEUE_KEY, JSON.stringify({ version: 1, items: next }));
  return next;
}

export function readQcLog(storage: Pick<MemoryStore, 'getItem'>): QcRecord[] {
  try {
    const raw = JSON.parse(storage.getItem(DISTRIBUTION_QC_KEY) || 'null') as { records?: unknown };
    if (!Array.isArray(raw?.records)) return [];
    return raw.records.map(cleanQc).filter((row): row is QcRecord => row != null);
  } catch {
    return [];
  }
}

export function writeQcLog(storage: MemoryStore, records: readonly QcRecord[]): QcRecord[] {
  const next = records.map(cleanQc).filter((row): row is QcRecord => row != null).slice(0, QC_MAX);
  storage.setItem(DISTRIBUTION_QC_KEY, JSON.stringify({ version: 1, records: next }));
  return next;
}

function appendQc(storage: MemoryStore, record: QcRecord): QcRecord {
  const records = [record, ...readQcLog(storage)];
  writeQcLog(storage, records);
  return record;
}

function cleanItem(value: unknown): DistributionItem | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<DistributionItem>;
  if (row.kind !== 'review-video' && row.kind !== 'note') return null;
  if (typeof row.id !== 'string' || !row.id) return null;
  const status: DistributionStatus =
    row.status === 'approved' || row.status === 'rejected' || row.status === 'sent-direct' ? row.status : 'pending';
  const targets = Array.isArray(row.targets)
    ? row.targets
        .map((target) => {
          if (!target || typeof target !== 'object') return null;
          const item = target as Partial<DistributionTarget>;
          if (typeof item.studentId !== 'string' || !item.studentId) return null;
          return {
            studentId: item.studentId.slice(0, 80),
            name: clip(String(item.name ?? ''), 80),
            kidCard: item.kidCard === true,
            division: clip(String(item.division ?? ''), 80),
          };
        })
        .filter((target): target is DistributionTarget => target != null)
    : [];
  const media = cleanMedia(row.media);
  if (row.kind === 'review-video' && !media) return null;
  return {
    id: row.id.slice(0, 80),
    kind: row.kind,
    title: clip(String(row.title ?? (row.kind === 'note' ? 'Note' : 'Review')), 120),
    note: clip(String(row.note ?? ''), 500),
    sentBy: {
      seatId: typeof row.sentBy?.seatId === 'string' ? row.sentBy.seatId.slice(0, 80) : undefined,
      name: clip(String(row.sentBy?.name ?? 'Instructor'), 80),
    },
    sentAt: Number(row.sentAt) || 0,
    dateKey: clip(String(row.dateKey ?? ''), 10),
    lesson: clip(String(row.lesson ?? media?.lesson ?? ''), 120),
    targets,
    ...(media ? { media } : {}),
    status,
    approvalRequired: row.approvalRequired !== false,
    ...(typeof row.decidedAt === 'number' ? { decidedAt: row.decidedAt } : {}),
  };
}

function cleanMedia(value: unknown): DistributionMedia | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Partial<DistributionMedia>;
  if (row.home !== 'google-drive' && row.home !== 'onedrive' && row.home !== 'share-file') return undefined;
  if (typeof row.ref !== 'string' || !row.ref) return undefined;
  return {
    home: row.home,
    ref: row.ref.slice(0, 240),
    fileName: clip(String(row.fileName ?? 'review.mp4'), 240),
    mime: clip(String(row.mime ?? 'video/mp4'), 80),
    size: Math.max(0, Number(row.size) || 0),
    ...(typeof row.durationMs === 'number' ? { durationMs: row.durationMs } : {}),
    ...(typeof row.thumbnailDataUrl === 'string' ? { thumbnailDataUrl: row.thumbnailDataUrl.slice(0, 200_000) } : {}),
    title: clip(String(row.title ?? 'Review'), 120),
    ...(row.lesson ? { lesson: clip(String(row.lesson), 120) } : {}),
  };
}

function cleanQc(value: unknown): QcRecord | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<QcRecord>;
  if (typeof row.id !== 'string' || typeof row.itemId !== 'string') return null;
  if (row.action !== 'queued' && row.action !== 'sent-direct' && row.action !== 'approved' && row.action !== 'rejected' && row.action !== 'received') {
    return null;
  }
  return {
    id: row.id.slice(0, 80),
    itemId: row.itemId.slice(0, 80),
    at: Number(row.at) || 0,
    action: row.action,
    actor: clip(String(row.actor ?? ''), 80),
    summary: clip(String(row.summary ?? ''), 400),
  };
}

export type SubmitDraft = {
  kind: DistributionKind;
  title: string;
  note?: string;
  sentBy: { seatId?: string; name: string };
  dateKey: string;
  lesson?: string;
  targets: DistributionTarget[];
  media?: DistributionMedia;
  now?: number;
  id?: string;
};

export type SubmitResult = {
  item: DistributionItem;
  qc: QcRecord;
  delivered: boolean;
  packets: ReviewVideoPacket[];
  message: string;
};

export function submitDistribution(
  draft: SubmitDraft,
  storage: MemoryStore,
  approvalRequired: boolean,
): SubmitResult | { ok: false; error: string } {
  if (draft.kind === 'review-video') {
    return { ok: false, error: REVIEW_VIDEO_STAYS_MESSAGE };
  }
  if (!draft.targets.length) return { ok: false, error: 'Pick at least one student.' };
  const now = draft.now ?? Date.now();
  const id = draft.id ?? newId(draft.kind === 'note' ? 'note' : 'review', now);
  const status: DistributionStatus = approvalRequired ? 'pending' : 'sent-direct';
  const item: DistributionItem = {
    id,
    kind: draft.kind,
    title: clip(draft.title || (draft.kind === 'note' ? 'Note' : 'Review'), 120),
    note: clip(draft.note ?? '', 500),
    sentBy: { seatId: draft.sentBy.seatId, name: clip(draft.sentBy.name || 'Instructor', 80) },
    sentAt: now,
    dateKey: clip(draft.dateKey, 10),
    lesson: clip(draft.lesson ?? draft.media?.lesson ?? '', 120),
    targets: draft.targets,
    ...(draft.media ? { media: draft.media } : {}),
    status,
    approvalRequired,
    ...(approvalRequired ? {} : { decidedAt: now }),
  };
  const action: QcAction = approvalRequired ? 'queued' : 'sent-direct';
  const qc: QcRecord = {
    id: newId('qc', now),
    itemId: item.id,
    at: now,
    action,
    actor: item.sentBy.name,
    summary: qcSummary(item, action),
  };
  writeDistributionQueue(storage, [item, ...readDistributionQueue(storage).filter((row) => row.id !== item.id)]);
  appendQc(storage, qc);
  const packets = approvalRequired ? [] : fanOutPackets(item);
  if (packets.length) queueReviewVideoPackets(storage, packets);
  return {
    item,
    qc,
    delivered: !approvalRequired,
    packets,
    message: approvalRequired ? QUEUED_MESSAGE : SENT_DIRECT_MESSAGE,
  };
}

function qcSummary(item: DistributionItem, action: QcAction): string {
  const kids = item.targets.filter((target) => target.kidCard).length;
  const who = item.targets.map((target) => target.name).join(', ') || 'no students';
  const label = item.kind === 'note' ? 'Note' : 'Review';
  return `${label} "${item.title}" ${action} · ${who}${kids ? ` · ${kids} kid-card` : ''}`;
}

export function fanOutPackets(_item: DistributionItem): ReviewVideoPacket[] {
  // Record for Review videos never reach a student inbox or journal.
  return [];
}

export function pendingDistribution(storage: Pick<MemoryStore, 'getItem'>): DistributionItem[] {
  return readDistributionQueue(storage).filter((item) => item.status === 'pending' && item.kind !== 'review-video');
}

export function approveDistribution(
  id: string,
  storage: MemoryStore,
  actor: string,
  now = Date.now(),
): SubmitResult | { ok: false; error: string } {
  return decide(id, 'approved', storage, actor, now);
}

export function rejectDistribution(
  id: string,
  storage: MemoryStore,
  actor: string,
  now = Date.now(),
): SubmitResult | { ok: false; error: string } {
  return decide(id, 'rejected', storage, actor, now);
}

function decide(
  id: string,
  status: 'approved' | 'rejected',
  storage: MemoryStore,
  actor: string,
  now: number,
): SubmitResult | { ok: false; error: string } {
  const items = readDistributionQueue(storage);
  const current = items.find((item) => item.id === id);
  if (!current) return { ok: false, error: 'That item is not in the queue.' };
  if (current.kind === 'review-video') return { ok: false, error: REVIEW_VIDEO_STAYS_MESSAGE };
  if (current.status !== 'pending') return { ok: false, error: 'That item was already decided.' };
  const item: DistributionItem = { ...current, status, decidedAt: now };
  writeDistributionQueue(storage, items.map((row) => (row.id === id ? item : row)));
  const qc: QcRecord = {
    id: newId('qc', now),
    itemId: item.id,
    at: now,
    action: status,
    actor: clip(actor || 'Owner', 80),
    summary: qcSummary(item, status),
  };
  appendQc(storage, qc);
  const packets = status === 'approved' ? fanOutPackets(item) : [];
  if (packets.length) queueReviewVideoPackets(storage, packets);
  return {
    item,
    qc,
    delivered: status === 'approved',
    packets,
    message: status === 'approved' ? 'Approved and sent to the selected students.' : 'Rejected. Students will not receive this.',
  };
}

export function readReviewVideoInbox(_storage?: Pick<MemoryStore, 'getItem'>, _studentId?: string): ReviewVideoPacket[] {
  // Leftover packets from earlier drafts are ignored. Students never see them.
  return [];
}

export function isReviewVideoPacket(value: unknown): value is ReviewVideoPacket {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<ReviewVideoPacket>;
  return row.kind === REVIEW_VIDEO_PACKET_KIND && typeof row.id === 'string' && typeof row.studentId === 'string' && Boolean(cleanMedia(row.media));
}

export function queueReviewVideoPackets(_storage: MemoryStore, _packets?: readonly ReviewVideoPacket[]): void {
  // Record for Review videos never enter a student inbox.
}

export function dismissReviewVideoPacket(storage: MemoryStore, packetId: string): void {
  const next = readReviewVideoInbox(storage).filter((packet) => packet.id !== packetId);
  storage.setItem(REVIEW_VIDEO_INBOX_KEY, JSON.stringify({ version: 1, packets: next }));
}

export type IngestResult =
  | { ok: true; film: StudentFilm; films: StudentFilm[]; message: string }
  | { ok: false; error: string };

/**
 * Record for Review videos are never accepted into a student journal.
 */
export async function ingestReviewVideoPacket(
  _packet: ReviewVideoPacket,
  _storage?: MemoryStore,
  _deps?: FilmCommitDeps & { films: readonly StudentFilm[]; blob: Blob; now?: number },
): Promise<IngestResult> {
  return { ok: false, error: REVIEW_VIDEO_STUDENT_BLOCKED_MESSAGE };
}

export function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return '';
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function memoryStore(start: Record<string, string> = {}): MemoryStore & { data: Record<string, string> } {
  const data = { ...start };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}
