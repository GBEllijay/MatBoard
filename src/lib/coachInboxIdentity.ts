/**
 * Which coach inbox packets belong to this phone's student.
 *
 * A student has two ids. The journal id (report.studentId, a "stu-…" id kept in
 * STABLE_STUDENT_ID_KEY) and the inbox pass id (the free Student license id the
 * server signs into the inbox pass at claim, sign-in, or restore). Self-assessments,
 * photos, and tournament notices go to the coach under the pass id, so the coach's
 * roster card is linked to the pass id and every Coach Sync reply is addressed to it.
 * The server only lets this pass read that inbox, so a packet addressed to the pass
 * id is this student's. Before this, the inbox showed only packets addressed to the
 * journal id, and every cloud reply was silently hidden.
 */

import { PLACEHOLDER_STUDENT_ID } from './studentIdentity.ts';

export type StudentIds = {
  /** report.studentId of the open journal. */
  reportStudentId: string;
  /** STABLE_STUDENT_ID_KEY on this phone, or null. */
  stableStudentId: string | null;
  /** studentId inside this phone's inbox pass, or null. */
  passStudentId: string | null;
};

export function studentIdsFor(ids: StudentIds): Set<string> {
  const out = new Set<string>();
  for (const id of [ids.reportStudentId, ids.stableStudentId, ids.passStudentId]) {
    if (id && id !== PLACEHOLDER_STUDENT_ID) out.add(id);
  }
  return out;
}

/** Queued coach packets addressed to this student, by journal id or inbox pass id. */
export function packetsForStudent<T extends { studentId: string }>(packets: readonly T[], ids: StudentIds): T[] {
  const mine = studentIdsFor(ids);
  if (!mine.size) return [];
  return packets.filter((packet) => mine.has(packet.studentId));
}

/**
 * Address a packet to the journal before accept, so the accept rules (which
 * compare packet.studentId to report.studentId) apply it. Only a packet already
 * addressed to this student's journal id or inbox pass id is rebased; anything
 * else returns null.
 */
export function packetForJournal<T extends { studentId: string }>(packet: T, journalId: string, ids: StudentIds): T | null {
  if (packet.studentId === journalId) return packet;
  if (!studentIdsFor(ids).has(packet.studentId)) return null;
  return { ...packet, studentId: journalId };
}
