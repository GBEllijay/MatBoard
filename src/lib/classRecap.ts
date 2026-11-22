/**
 * Class recap packets for "Send to class" and absentee copies.
 * Only opted-in notes, techniques, and https video links ride along.
 * Review recordings and student/kid phone videos never go to students or Cloud.
 */
import { addCardVideo } from './journalCardVideos.ts';
import { addJournalEntry } from './studentEdition.ts';
import type { StudentProgressReport } from './progress/types.ts';
import { buildStudentShareBundle, type InstructorJournalEntry, type StudentShareBundle } from './instructorJournal.ts';
import type { InstructorD12Card } from './instructorD12Cards.ts';
import { loadTrainingArchive, plansOnDay } from './trainingNotesStore.ts';
import { PROGRESS_SCHEMA_VERSION, type ClassRecapBody, type ClassRecapPacket, type CoachGymBrand } from './progress/types.ts';
import { createUpdateId } from './coachRankUpdate.ts';
import { sendCardSync, type CardSendOptions, type CardSyncSendResult } from './cardSync.ts';
import { linkedSendTargets } from './classAttendance.ts';
import type { Student } from './rosterStore.ts';

export const CLASS_RECAP_KIND = 'class-recap-update' as const;

export type { ClassRecapBody, ClassRecapPacket };

export function isClassRecapPacket(value: { kind: string }): value is ClassRecapPacket {
  return value.kind === CLASS_RECAP_KIND;
}

export function techniquesFromLessonPlans(date: string, archive = loadTrainingArchive()): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const plan of plansOnDay(archive, date)) {
    for (const tech of plan.techniques) {
      const name = tech.title.trim();
      if (!name) continue;
      const key = name.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

export function recapFromShareBundle(bundle: StudentShareBundle, absentee = false): ClassRecapBody {
  const recap: ClassRecapBody = {
    entryId: bundle.entryId,
    date: bundle.date,
    className: bundle.className,
    notes: bundle.notes,
    techniques: [...bundle.techniques],
    videos: bundle.videos.map((video) => ({ title: video.title, href: video.href })),
  };
  if (absentee) recap.absentee = true;
  return recap;
}

/** Instructor preview and send both use this. Recipients and D12 tags stay off the packet. */
export function recapFromJournalEntry(
  entry: InstructorJournalEntry,
  cards: readonly InstructorD12Card[] = [],
  absentee = false,
): ClassRecapBody {
  return recapFromShareBundle(buildStudentShareBundle(entry, cards), absentee);
}

export function recapHasShareable(recap: ClassRecapBody): boolean {
  return Boolean(recap.notes.trim() || recap.techniques.length || recap.videos.length);
}

export function buildClassRecapUpdate(input: {
  studentId: string;
  recap: ClassRecapBody;
  gym?: CoachGymBrand;
  now?: number;
  updateId?: string;
}): { ok: true; packet: ClassRecapPacket } | { ok: false; error: string } {
  const studentId = input.studentId.trim();
  if (!studentId) return { ok: false, error: 'That student is not linked.' };
  if (!recapHasShareable(input.recap)) return { ok: false, error: 'Nothing is marked to share with students yet.' };
  const now = input.now ?? Date.now();
  const updateId = input.updateId ?? createUpdateId(now);
  const packet: ClassRecapPacket = {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    kind: CLASS_RECAP_KIND,
    id: updateId,
    studentId,
    updatedAt: now,
    issuedAt: now,
    updateId,
    recap: {
      entryId: input.recap.entryId,
      date: input.recap.date,
      className: input.recap.className,
      notes: input.recap.notes,
      techniques: [...input.recap.techniques],
      videos: input.recap.videos.map((video) => ({ title: video.title, href: video.href })),
    },
  };
  if (input.recap.absentee) packet.recap.absentee = true;
  if (input.gym) packet.gym = input.gym;
  return { ok: true, packet };
}

export function classRecapSentence(packet: ClassRecapPacket): string {
  const when = packet.recap.date;
  const name = packet.recap.className.trim() || 'class';
  if (packet.recap.absentee) {
    return `Absentee copy of ${name} on ${when}. Add to my Journal adds a recap card; your own words stay as written.`;
  }
  return `Class recap for ${name} on ${when}. Add to my Journal adds a recap card; your own words stay as written.`;
}

export function applyClassRecapToJournal(
  report: StudentProgressReport,
  packet: ClassRecapPacket,
  now = Date.now(),
): StudentProgressReport {
  const recap = packet.recap;
  const className = recap.absentee
    ? recap.className
      ? `Absentee copy · ${recap.className}`
      : 'Absentee copy'
    : recap.className || 'Class recap';
  let next = addJournalEntry(
    report,
    {
      date: recap.date || packet.recap.date,
      className,
      gameTag: '',
      techniques: recap.techniques.map((name) => ({ id: '', name })),
      partners: '',
      drills: '',
      rolls: '',
      notes: recap.notes,
      session: 'class',
    },
    now,
  );
  const entry = next.journal[next.journal.length - 1];
  if (!entry) return next;
  recap.videos.forEach((video, index) => {
    try {
      const added = addCardVideo(
        next,
        entry.id,
        {
          source: 'link',
          url: video.href,
          term: { id: '', name: video.title.trim() || 'Class video' },
          note: recap.absentee ? 'Absentee copy' : 'Class recap',
        },
        { now: now + index + 1 },
      );
      next = added.report;
    } catch {
      /* skip a link that does not pass the journal card rules */
    }
  });
  return next;
}

export type ClassRecapSendSummary = {
  sent: number;
  skippedUnlinked: number;
  results: { studentId: string; result: CardSyncSendResult | { mode: 'invalid'; error: string } }[];
};

/**
 * Send the recap to linked roster cards only. Guests and unlinked ids are skipped.
 */
export async function sendClassRecapToStudents(
  input: {
    entry: InstructorJournalEntry;
    cards?: readonly InstructorD12Card[];
    studentIds: readonly string[];
    roster: readonly Student[];
    absentee?: boolean;
  },
  options: CardSendOptions = {},
): Promise<ClassRecapSendSummary> {
  const recap = recapFromJournalEntry(input.entry, input.cards ?? [], input.absentee === true);
  const targets = linkedSendTargets(input.roster, input.studentIds);
  const skippedUnlinked = input.studentIds.filter((id) => !targets.some((card) => card.linkedStudentId === id)).length;
  const results: ClassRecapSendSummary['results'] = [];
  for (const card of targets) {
    const linkedId = card.linkedStudentId ?? '';
    const built = buildClassRecapUpdate({
      studentId: linkedId,
      recap,
      gym: options.gym,
      now: options.now,
    });
    if (!built.ok) {
      results.push({ studentId: linkedId, result: { mode: 'invalid', error: built.error } });
      continue;
    }
    options.onBuilt?.(built.packet);
    const result = await sendCardSync(card.id, built.packet, options);
    results.push({ studentId: linkedId, result });
  }
  return { sent: results.filter((row) => row.result.mode !== 'blocked' && row.result.mode !== 'invalid').length, skippedUnlinked, results };
}
