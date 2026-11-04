/**
 * Every coach file the student imports goes through here, so the parent
 * approval gate covers coach plans, feedback, shelf clips and typed packets
 * alike. With the gate off this does exactly what the import did before.
 */

import { gymTextAllowed, OLD_GYM_REFUSED } from './academyMembership.ts';
import { receiveSyncPacket } from './coachSync.ts';
import { holdForParent, parentGateOn } from './parentGate.ts';
import type { CoachGymBrand, StudentProgressReport } from './progress/types.ts';
import { saveInboxPass } from './studentInboxClient.ts';
import { writeStudentGymLogo } from './studentGymMark.ts';
import { applyCoachFile, loadCoachShelf, saveCoachShelf, type CoachShelf } from './studentTools.ts';

type Store = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

export type CoachInboundOutcome =
  | { kind: 'error'; error: string }
  | { kind: 'own-file'; pendingReport: StudentProgressReport; gym: CoachGymBrand | null }
  | { kind: 'parent-hold'; message: string }
  | { kind: 'declined'; message: string }
  | { kind: 'queued'; message: string }
  | { kind: 'applied'; message: string; report: StudentProgressReport; shelf: CoachShelf };

export const PARENT_HOLD_MESSAGE = 'Saved. A parent approves coach updates on this phone first (Parent approvals).';
export const PARENT_DECLINED_MESSAGE = 'A parent already declined this coach update on this phone.';

export function importCoachText(
  storage: Store,
  report: StudentProgressReport,
  text: string,
  options: { parentApproved?: boolean } = {},
): CoachInboundOutcome {
  const shelf = loadCoachShelf(storage);
  const result = applyCoachFile(report, shelf, text);
  // The student's own progress file and unreadable files are not coach updates.
  if (result.pendingReport) return { kind: 'own-file', pendingReport: result.pendingReport, gym: result.gym };
  if (result.error) return { kind: 'error', error: result.error };
  // After Leave academy, a file from the old gym changes nothing.
  if (!gymTextAllowed(storage, text)) return { kind: 'error', error: OLD_GYM_REFUSED };
  const typed = result.pendingSyncPacket ?? result.pendingRankUpdate ?? result.pendingCompetitionUpdate;
  if (typed) {
    if (result.inboxPass) saveInboxPass(storage, result.inboxPass);
    const received = receiveSyncPacket(storage, typed, typed.studentId, options);
    if (received === 'parent-hold') return { kind: 'parent-hold', message: PARENT_HOLD_MESSAGE };
    return { kind: 'queued', message: result.message };
  }
  if (!options.parentApproved && parentGateOn(storage)) {
    const held = holdForParent(storage, { route: 'coach-file', raw: text });
    return held === 'declined'
      ? { kind: 'declined', message: PARENT_DECLINED_MESSAGE }
      : { kind: 'parent-hold', message: PARENT_HOLD_MESSAGE };
  }
  if (result.gym?.logo) writeStudentGymLogo(result.gym.logo, storage);
  saveCoachShelf(storage, result.shelf);
  return { kind: 'applied', message: result.message, report: result.report, shelf: result.shelf };
}
