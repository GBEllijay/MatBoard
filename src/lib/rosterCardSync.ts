/**
 * Thin sync adapter for the Coach Clipboard roster card.
 *
 * There is no shared sync layer on main yet. This wraps what already ships and
 * adds nothing that a sync layer would own:
 * - Rank and belt: the existing `deliverRankUpdate` (Advantage Cloud, then file).
 *   The card does not add a second rank path.
 * - Coach notes and coach assessments: a `coach-card-update` packet, saved as a
 *   file the student imports. Advantage Cloud delivery is a stub that reports
 *   not ready, so the coach always gets the file. Swap `cloud` when the sync layer lands.
 * - Benchmarks: `benchmarkSyncPayload`, what the Sync with student app toggle shares.
 *   Benchmarks only. It never carries notes, private notes, or assessments.
 *
 * One way, coach to student. Imports from the student never overwrite coach fields.
 */

import type { CoachCardPacket } from './coachCardUpdates.ts';
import { checkpointsForProgress, benchmarkView } from './studentBenchmarks.ts';
import { parseProgressPacket } from './progress/format.ts';
import type { StudentProgressReport, RubricCheckpoint } from './progress/types.ts';
import type { RosterCardRecord, StudentSnapshot } from './rosterCardStore.ts';
import { emptyRank } from './studentRank.ts';

export type CardDelivery =
  | { mode: 'cloud' }
  | { mode: 'file'; name: string; json: string; reason: string };

export type CardCloudChannel = {
  /** False until the shared sync layer serves coach card updates. */
  ready: () => boolean;
  send: (packet: CoachCardPacket) => Promise<boolean>;
};

/** Advantage Cloud for coach card updates: not wired yet. */
export const PENDING_CARD_CLOUD: CardCloudChannel = {
  ready: () => false,
  send: async () => false,
};

export const CARD_CLOUD_PENDING_REASON =
  'Advantage Cloud delivery for notes and assessments arrives with the sync update. Save the file and share it with the student.';

function fileName(packet: CoachCardPacket): string {
  const stamp = new Date(packet.issuedAt).toISOString().slice(0, 10);
  return `advantage-coach-${packet.type}-${stamp}.json`;
}

/** The exact JSON the student imports. Built from the packet only. */
export function cardPacketJson(packet: CoachCardPacket): string {
  return JSON.stringify(packet, null, 2);
}

export async function deliverCardUpdate(
  packet: CoachCardPacket,
  cloud: CardCloudChannel = PENDING_CARD_CLOUD,
): Promise<CardDelivery> {
  if (cloud.ready()) {
    try {
      if (await cloud.send(packet)) return { mode: 'cloud' };
    } catch {
      // Fall through to the file.
    }
    return { mode: 'file', name: fileName(packet), json: cardPacketJson(packet), reason: 'Advantage Cloud did not answer. Share the file instead.' };
  }
  return { mode: 'file', name: fileName(packet), json: cardPacketJson(packet), reason: CARD_CLOUD_PENDING_REASON };
}

export type BenchmarkSyncPayload = {
  kind: 'coach-card-benchmarks';
  version: 1;
  studentId: string;
  belt: string;
  checkpoints: { id: string; name: string; coachConfirmed: boolean }[];
};

/**
 * What the Sync with student app toggle shares: benchmark checkmarks for the
 * current belt. Notes and assessments go out only with their own Send button.
 * Returns null when sync is off or the card is not linked.
 */
export function benchmarkSyncPayload(
  record: RosterCardRecord,
  studentId: string,
  belt: string,
  checkpoints: readonly Pick<RubricCheckpoint, 'id' | 'name'>[],
): BenchmarkSyncPayload | null {
  if (!record.benchmarkSync || !studentId.trim()) return null;
  return {
    kind: 'coach-card-benchmarks',
    version: 1,
    studentId: studentId.trim(),
    belt,
    checkpoints: checkpoints.map((row) => ({ id: row.id, name: row.name, coachConfirmed: record.benchmarkChecks[row.id] === true })),
  };
}

/** Current-belt checkpoints in a Student Edition file, with the student's own marks. */
export function currentBeltCheckpoints(report: StudentProgressReport): RubricCheckpoint[] {
  const view = benchmarkView(report);
  const level = report.rubric.levels.find((row) => row.belt === view.belt);
  return level ? checkpointsForProgress(level.checkpoints, view) : [];
}

/**
 * Read a Student Edition progress file onto the coach's card.
 * It fills the snapshot only. Coach-entered dates, style, notes, and checks are not touched.
 */
export function studentSnapshotFromFile(
  text: string,
  expectedStudentId: string,
  now = Date.now(),
): { ok: true; snapshot: StudentSnapshot } | { ok: false; error: string } {
  const parsed = parseProgressPacket(text);
  if (!parsed.ok) return { ok: false, error: parsed.errors[0] ?? 'This file could not be read.' };
  const report = parsed.value;
  if (report.kind !== 'student-progress-report') return { ok: false, error: 'This is not a student progress file.' };
  if (expectedStudentId && report.studentId !== expectedStudentId) {
    return { ok: false, error: 'This file belongs to a different student.' };
  }
  return {
    ok: true,
    snapshot: {
      importedAt: now,
      studentId: report.studentId,
      belt: report.profile.belt,
      rank: report.rank ?? emptyRank(),
      ...(report.beltBook ? { beltBook: report.beltBook } : {}),
      ...(report.profile.trainingStyle ? { trainingStyle: report.profile.trainingStyle } : {}),
      ...(report.profile.startedOn ? { startedOn: report.profile.startedOn } : {}),
      checkpoints: currentBeltCheckpoints(report),
    },
  };
}
