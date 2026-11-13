/**
 * Seeded fiction for owner-gated distribution previews. Not live gym data.
 */

import {
  type DistributionItem,
  type DistributionTarget,
  type QcRecord,
  type ReviewVideoPacket,
} from '../../lib/ownerGatedDistribution.ts';

export const OWNER_GATED_SEND_PATH = '/preview/owner-gated/send';
export const OWNER_GATED_APPROVAL_PATH = '/preview/owner-gated/approval';
export const OWNER_GATED_QC_PATH = '/preview/owner-gated/qc';
export const OWNER_GATED_JOURNAL_PATH = '/preview/owner-gated/journal';

export const PREVIEW_THUMB =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <rect width="640" height="360" fill="#12243a"/>
      <rect x="40" y="40" width="560" height="280" rx="18" fill="#0b1624" stroke="#004eba" stroke-width="4"/>
      <path d="M140 250 L260 140 L300 200 L420 110" fill="none" stroke="#f59e0b" stroke-width="10" stroke-linecap="round"/>
      <polygon points="420,110 390,130 430,150" fill="#f59e0b"/>
      <text x="60" y="320" fill="#f5f1e8" font-family="Inter,sans-serif" font-size="28">Armbar from closed guard</text>
    </svg>`,
  );

export const ALEX: DistributionTarget = {
  studentId: 'stu-alex',
  name: 'Alex Rivera',
  kidCard: false,
  division: 'Adult Gi',
};

export const MICAH: DistributionTarget = {
  studentId: 'stu-micah',
  name: 'Micah Bates',
  kidCard: true,
  division: 'Kids Gi',
};

export const SEEDED_ROSTER: DistributionTarget[] = [ALEX, MICAH];

export function seededPendingItem(now = 1_731_478_800_000): DistributionItem {
  return {
    id: 'review.preview1',
    kind: 'review-video',
    title: 'Armbar from closed guard',
    note: 'Watch the hip pinch at 0:32.',
    sentBy: { name: 'Instructor Guise', seatId: 'seat-preview' },
    sentAt: now,
    dateKey: '2026-11-13',
    lesson: 'Armbar from guard',
    targets: [ALEX, MICAH],
    media: {
      home: 'google-drive',
      ref: 'preview-drive-file',
      fileName: 'armbar-review.mp4',
      mime: 'video/mp4',
      size: 4_500_000,
      durationMs: 95_000,
      thumbnailDataUrl: PREVIEW_THUMB,
      title: 'Armbar from closed guard',
      lesson: 'Armbar from guard',
    },
    status: 'pending',
    approvalRequired: true,
  };
}

export function seededNoteItem(now = 1_731_478_400_000): DistributionItem {
  return {
    id: 'note.preview1',
    kind: 'note',
    title: 'Work the hip escape',
    note: 'Before Friday class.',
    sentBy: { name: 'Instructor Guise', seatId: 'seat-preview' },
    sentAt: now,
    dateKey: '2026-11-12',
    lesson: '',
    targets: [MICAH],
    status: 'sent-direct',
    approvalRequired: false,
    decidedAt: now,
  };
}

export function seededQcLog(): QcRecord[] {
  const pending = seededPendingItem();
  const note = seededNoteItem();
  return [
    {
      id: 'qc.preview3',
      itemId: pending.id,
      at: pending.sentAt,
      action: 'queued',
      actor: 'Instructor Guise',
      summary: 'Review "Armbar from closed guard" queued · Alex Rivera, Micah Bates · 1 kid-card',
    },
    {
      id: 'qc.preview2',
      itemId: note.id,
      at: note.sentAt,
      action: 'sent-direct',
      actor: 'Instructor Guise',
      summary: 'Note "Work the hip escape" sent-direct · Micah Bates · 1 kid-card',
    },
    {
      id: 'qc.preview1',
      itemId: 'review.older',
      at: note.sentAt - 86_400_000,
      action: 'approved',
      actor: 'Owner',
      summary: 'Review "Guard retention drill" approved · Alex Rivera',
    },
  ];
}

export function seededMicahPacket(): ReviewVideoPacket {
  const item = seededPendingItem();
  return {
    kind: 'coach-review-video-update',
    version: 1,
    id: `${item.id}.stu-micah`,
    itemId: item.id,
    studentId: 'stu-micah',
    title: item.title,
    note: item.note,
    lesson: item.lesson,
    dateKey: item.dateKey,
    media: item.media!,
    approval: 'approved',
    kidCard: true,
    issuedAt: item.sentAt,
  };
}
