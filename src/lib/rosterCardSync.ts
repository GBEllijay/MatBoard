/**
 * Coach Clipboard card helpers around the sync layer (`cardSync.ts`).
 * Sends, comms, notices, and card shares are cardSync's. This file only reads a
 * student's own progress file onto the card and shapes the coach's benchmark
 * checks for `sendBeltProgress`. Nothing here sends anything.
 */

import { checkpointsForProgress, benchmarkView } from './studentBenchmarks.ts';
import { parseProgressPacket } from './progress/format.ts';
import type { StudentProgressReport, RubricCheckpoint } from './progress/types.ts';
import type { RosterCardRecord, StudentSnapshot } from './rosterCardStore.ts';
import type { CoachBenchmarkStatus } from './progress/types.ts';
import { emptyRank } from './studentRank.ts';

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

/**
 * The coach's checks as a belt progress send. Confirmed is Ready; the rest is Working on it.
 * Private notes, training notes, and assessments are never part of it.
 */
export function beltProgressFromCard(
  record: Pick<RosterCardRecord, 'benchmarkChecks'>,
  checkpoints: readonly Pick<RubricCheckpoint, 'id' | 'name'>[],
): { targetId: string; name: string; coachStatus: CoachBenchmarkStatus }[] {
  return checkpoints.map((row) => ({
    targetId: row.id,
    name: row.name,
    coachStatus: record.benchmarkChecks[row.id] === true ? 'ready' : 'working',
  }));
}
