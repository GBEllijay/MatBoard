/**
 * One-time estimated backfill from the roster already on this device.
 * Current students become student_added. Current belts become baseline promotions.
 * Stripes are not backfilled. Past lesson plans are marked taught only when a coach asks.
 */

import { readGymEvents, readGymMeta, recordBackfillPromotion, recordStudentAdded, setPlanTaught, taughtPlan, writeGymMeta } from './gymEventLog.ts';
import { classMinutes, localDay, type GymEvent } from './gymEvents.ts';
import { readRosterCard } from './rosterCardStore.ts';
import { getRoster } from './rosterStore.ts';
import { loadTrainingArchive, planHasContent } from './trainingNotesStore.ts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type BackfillReport = { students: number; promotions: number; already: boolean };

function hasKind(events: readonly GymEvent[], studentId: string, type: 'student_added' | 'promotion'): boolean {
  return events.some((event) => event.type === type && event.studentId === studentId);
}

/** Snapshot the current roster once. Safe to call on every coach screen. */
export function ensureGymBackfill(today = localDay()): BackfillReport {
  if (readGymMeta().backfillDone) return { students: 0, promotions: 0, already: true };
  const before = readGymEvents();
  let students = 0;
  let promotions = 0;
  for (const student of getRoster().students) {
    if (student.archivedAt) continue;
    const card = readRosterCard(student.id);
    const startedOn = DATE_RE.test(card.trainingStartedOn) ? card.trainingStartedOn : '';
    if (!hasKind(before, student.id, 'student_added')) {
      recordStudentAdded(
        {
          id: student.id,
          belt: student.belt,
          rosterList: student.rosterList,
          ...(startedOn ? { startedOn } : {}),
        },
        'backfill',
      );
      students += 1;
    }
    if (!hasKind(before, student.id, 'promotion') && student.belt) {
      const awarded = DATE_RE.test(card.coachRank?.awardedOn ?? '')
        ? (card.coachRank?.awardedOn ?? today)
        : DATE_RE.test(student.lastPromotion)
          ? student.lastPromotion
          : startedOn || today;
      recordBackfillPromotion(student.id, student.belt, awarded);
      promotions += 1;
    }
  }
  writeGymMeta({ backfillDone: true });
  return { students, promotions, already: false };
}

/** Mark saved plans from earlier days as taught. Each one is labeled an estimate. */
export function markPastPlansTaught(today = localDay()): number {
  const archive = loadTrainingArchive(today);
  let marked = 0;
  for (const [date, day] of Object.entries(archive.days)) {
    if (!DATE_RE.test(date) || date >= today) continue;
    for (const plan of day.plans) {
      if (!planHasContent(plan) || taughtPlan(plan.id, date)) continue;
      setPlanTaught({
        planId: plan.id,
        date,
        taught: true,
        template: plan.template ?? 'adult',
        classDesignation: plan.classDesignation,
        minutes: classMinutes(plan),
        source: 'backfill',
      });
      marked += 1;
    }
  }
  return marked;
}
