/**
 * Daily Lesson Plan package stored in the gym's Google Drive.
 *
 * The file Advantage writes is structured JSON (`advantage: "lesson-plan"`,
 * `version: 1`). Opening it in Drive shows that text. The app reads the same
 * JSON back into the Daily Lesson Plan. Older plain-text saves, a coach
 * self-export, and a review handoff packet are accepted when they still carry
 * the plan fields. Photo and video bytes are never part of this file.
 */

import type { DriveLessonDocument, DriveLessonMedia } from './googleDrive.ts';
import { clampDriveFileId, clampMediaLabel } from './techniqueLogic.ts';
import { planHasContent, sanitizePlan, type TrainingNotesPlan } from './trainingNotesStore.ts';

export const LESSON_PACKAGE_VERSION = 1;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

type LessonFields = {
  date: string;
  coachName: string;
  savedAt: number;
  plan: unknown;
  media: DriveLessonMedia[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function mediaList(value: unknown): DriveLessonMedia[] {
  if (!Array.isArray(value)) return [];
  const media: DriveLessonMedia[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (!row) continue;
    const section =
      row.section === 'warmup' || row.section === 'cooldown' || row.section === 'technique'
        ? row.section
        : null;
    if (!section) continue;
    const index =
      section === 'technique' && typeof row.index === 'number' && Number.isFinite(row.index)
        ? Math.max(0, Math.floor(row.index))
        : null;
    media.push({
      section,
      index,
      localClipId: typeof row.localClipId === 'string' ? row.localClipId : null,
      driveFileId: clampDriveFileId(row.driveFileId),
      name: clampMediaLabel(row.name),
      mime: clampMediaLabel(row.mime, 120) || 'video/mp4',
    });
  }
  return media;
}

function packageFromFields(fields: LessonFields): DriveLessonDocument | null {
  if (!DATE_KEY.test(fields.date)) return null;
  const { plan } = sanitizePlan(fields.plan);
  if (!planHasContent(plan)) return null;
  const savedAt = Number.isFinite(fields.savedAt) ? fields.savedAt : Date.now();
  return {
    advantage: 'lesson-plan',
    version: LESSON_PACKAGE_VERSION,
    date: fields.date,
    coachName: fields.coachName.trim().slice(0, 80),
    savedAt,
    kind: 'draft',
    distributedAt: null,
    plan,
    media: fields.media,
  };
}

function fromLessonPlan(record: Record<string, unknown>): DriveLessonDocument | null {
  if (record.advantage !== 'lesson-plan' || record.version !== LESSON_PACKAGE_VERSION) return null;
  if (typeof record.date !== 'string') return null;
  return packageFromFields({
    date: record.date,
    coachName: typeof record.coachName === 'string' ? record.coachName : '',
    savedAt: typeof record.savedAt === 'number' ? record.savedAt : 0,
    plan: record.plan,
    media: mediaList(record.media),
  });
}

function fromCoachPlan(record: Record<string, unknown>): DriveLessonDocument | null {
  if (record.advantage !== 'coach-plan' || record.version !== 1) return null;
  if (typeof record.date !== 'string') return null;
  return packageFromFields({
    date: record.date,
    coachName: typeof record.coachName === 'string' ? record.coachName : '',
    savedAt: typeof record.savedAt === 'number' ? record.savedAt : 0,
    plan: record.plan,
    media: [],
  });
}

function fromReviewPacket(record: Record<string, unknown>): DriveLessonDocument | null {
  if (record.version !== 1 || record.kind !== 'review') return null;
  const submission = asRecord(record.submission);
  if (!submission || typeof submission.dateKey !== 'string') return null;
  return packageFromFields({
    date: submission.dateKey,
    coachName: typeof submission.coachName === 'string' ? submission.coachName : '',
    savedAt: typeof submission.submittedAt === 'number' ? submission.submittedAt : 0,
    plan: submission.plan,
    media: [],
  });
}

/** JSON object, a JSON string, a coach export, or a review handoff packet. */
export function lessonDocumentFromUnknown(value: unknown): DriveLessonDocument | null {
  if (typeof value === 'string') return parseLessonPayload(value);
  const record = asRecord(value);
  if (!record) return null;
  return fromLessonPlan(record) ?? fromCoachPlan(record) ?? fromReviewPacket(record);
}

const LABELED = /^([A-Za-z][A-Za-z -]{0,40})\s*[:=]\s*(.*)$/;

function labelKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Older saves were a labeled text file, not JSON.
 * A date plus at least one plan field is required. Anything else stays unread.
 */
export function lessonDocumentFromPlainText(text: string): DriveLessonDocument | null {
  const lines = text.split(/\r?\n/);
  const fields = new Map<string, string>();
  const techniques: { title: string; notes: string; expected: string }[] = [];
  const media: DriveLessonMedia[] = [];
  let current: { title: string; notes: string; expected: string } | null = null;
  let labeled = 0;

  const pushTechnique = () => {
    if (!current) return;
    techniques.push(current);
    current = null;
  };

  for (const line of lines) {
    const match = line.trim().match(LABELED);
    if (!match) continue;
    labeled += 1;
    const key = labelKey(match[1]);
    const value = match[2].trim();
    if (key === 'technique' || key === 'technique title') {
      pushTechnique();
      current = { title: value, notes: '', expected: '' };
      continue;
    }
    if ((key === 'notes' || key === 'note') && current) {
      current.notes = value;
      continue;
    }
    if (key === 'expected' && current) {
      current.expected = value;
      continue;
    }
    if (key === 'video') {
      const parts = value.split('|').map((part) => part.trim());
      const name = parts[0] || 'Video';
      const driveFileId = clampDriveFileId(parts[1] ?? '');
      const sectionRaw = (parts[2] || 'technique').toLowerCase();
      const section =
        sectionRaw === 'warmup' || sectionRaw === 'warm-up'
          ? 'warmup'
          : sectionRaw === 'cooldown' || sectionRaw === 'cool down' || sectionRaw === 'cool-down'
            ? 'cooldown'
            : 'technique';
      const parsedIndex = Number(parts[3]);
      const index =
        section === 'technique' && Number.isFinite(parsedIndex) ? Math.max(0, Math.floor(parsedIndex)) : null;
      if (driveFileId) {
        media.push({
          section,
          index: section === 'technique' ? (index ?? Math.max(0, techniques.length - 1)) : null,
          localClipId: null,
          driveFileId,
          name: clampMediaLabel(name) || 'Video',
          mime: 'video/mp4',
        });
      }
      continue;
    }
    fields.set(key, value);
  }
  pushTechnique();
  if (labeled < 2) return null;

  const date = fields.get('date') ?? '';
  const plan: Partial<TrainingNotesPlan> = {
    version: 1,
    id: fields.get('id') ?? '',
    coachName: fields.get('coach') ?? fields.get('coach name') ?? '',
    classDesignation: fields.get('class') ?? fields.get('class designation') ?? '',
    lessonTitle: fields.get('title') ?? fields.get('lesson title') ?? '',
    classTime: fields.get('time') ?? fields.get('class time') ?? '',
    intro: fields.get('intro') ?? '',
    warmupNote: fields.get('warmup') ?? fields.get('warm-up') ?? '',
    cooldownNote: fields.get('cooldown') ?? fields.get('cool down') ?? fields.get('cool-down') ?? '',
    closing: fields.get('closing') ?? '',
    specificNote: fields.get('specific') ?? '',
    techniques: techniques.map((tech, index) => ({
      id: `text-tech-${index + 1}`,
      slotId: `text-slot-${index + 1}`,
      title: tech.title,
      notes: tech.notes,
      expected: tech.expected,
      waterBreak: false,
    })),
  };
  const savedAt = Number(fields.get('saved') ?? fields.get('saved at') ?? '');
  return packageFromFields({
    date,
    coachName: plan.coachName ?? '',
    savedAt: Number.isFinite(savedAt) ? savedAt : 0,
    plan,
    media,
  });
}

/**
 * Read a Drive file body. JSON version 1 is the format Advantage writes.
 * A UTF-8 BOM, a JSON string, and the older labeled text are still read.
 */
export function parseLessonPayload(raw: string): DriveLessonDocument | null {
  const text = raw.replace(/^\uFEFF/, '').trim();
  if (!text) return null;
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      return lessonDocumentFromUnknown(JSON.parse(text) as unknown);
    } catch {
      return null;
    }
  }
  return lessonDocumentFromPlainText(text);
}

/** Newest copy of each plan id wins. Used when a picked file and a date folder both match. */
export function preferLessonDocuments(groups: readonly (readonly DriveLessonDocument[])[]): DriveLessonDocument[] {
  const byKey = new Map<string, DriveLessonDocument>();
  for (const group of groups) {
    for (const doc of group) {
      const key = `${doc.date}\0${doc.plan.id}`;
      const current = byKey.get(key);
      if (!current || doc.savedAt >= current.savedAt) byKey.set(key, doc);
    }
  }
  return [...byKey.values()];
}
