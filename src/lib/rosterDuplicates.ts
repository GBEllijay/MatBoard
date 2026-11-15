/**
 * Device helper for merging duplicate Student Roster cards.
 * The match and merge rules live in rosterDuplicateCore.ts so the gym API can use them.
 */
import { getRoster, replaceRosterState, type Student } from './rosterStore.ts';
import { mergeDuplicateStudents, type MergeDuplicateResult } from './rosterDuplicateCore.ts';

export {
  combinedDuplicateCard,
  findRosterDuplicates,
  mergeDuplicateStudents,
  type DupableStudent,
  type MergeDuplicateResult,
  type RosterDupeGroup,
  type RosterDupeReason,
} from './rosterDuplicateCore.ts';

export function mergeDuplicateRosterCardsOnDevice(
  keepId: string,
  dropId: string,
  now = new Date().toISOString(),
): MergeDuplicateResult<Student> {
  const roster = getRoster();
  const result = mergeDuplicateStudents(roster.students, keepId, dropId, now);
  if (!result.ok) return result;
  replaceRosterState({ ...roster, students: result.students });
  return result;
}
