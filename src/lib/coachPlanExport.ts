/**
 * Paid Coach self-export of today's lesson plan.
 * Writes plan text to the coach's connected Drive. Technique videos stay
 * on this device. This is not instructor distribution.
 */

import {
  coachPlanDriveFileName,
  readDriveBinding,
  requestDriveToken,
  upsertCoachPlanFile,
  type CoachPlanRecordDocument,
} from './googleDrive.ts';
import { lessonPlanForDrive } from './lessonDrive.ts';
import { driveFolderWebUrl } from './openMyDrive.ts';
import type { TrainingNotesPlan } from './trainingNotesStore.ts';

export type CoachPlanExportResult =
  | { status: 'saved'; folderUrl: string | null }
  | { status: 'needs-drive' }
  | { status: 'failed' };

/** Plan text only. A stray blob on the object cannot ride along. */
export function coachPlanRecordDocument(input: {
  dateKey: string;
  savedAt: number;
  plan: TrainingNotesPlan;
}): CoachPlanRecordDocument {
  const plan = lessonPlanForDrive(input.plan);
  return {
    advantage: 'coach-plan',
    version: 1,
    date: input.dateKey,
    coachName: plan.coachName.trim().slice(0, 80),
    savedAt: input.savedAt,
    purpose: 'self',
    plan,
  };
}

export function coachPlanRecordFileName(dateKey: string, plan: TrainingNotesPlan): string {
  const text = lessonPlanForDrive(plan);
  const classPlanId = text.classDesignation.trim() || text.classTime.trim() ? text.id : '';
  return coachPlanDriveFileName(dateKey, text.coachName, classPlanId);
}

/**
 * Upload today's plan text to the connected Drive folder, then hand back
 * the folder URL so the page can open it. No video bytes are sent.
 * Returns `needs-drive` when the folder is not connected or sign-in is declined.
 */
export async function exportCoachPlanToOwnDrive(input: {
  dateKey: string;
  plan: TrainingNotesPlan;
  savedAt?: number;
}): Promise<CoachPlanExportResult> {
  const binding = readDriveBinding();
  if (!binding) return { status: 'needs-drive' };
  let token = await requestDriveToken('silent');
  if (!token) token = await requestDriveToken('consent');
  if (!token) return { status: 'needs-drive' };
  const document = coachPlanRecordDocument({
    dateKey: input.dateKey,
    savedAt: input.savedAt ?? Date.now(),
    plan: input.plan,
  });
  try {
    await upsertCoachPlanFile({ token, folderId: binding.folderId, document });
    return { status: 'saved', folderUrl: driveFolderWebUrl(binding.folderId) };
  } catch {
    return { status: 'failed' };
  }
}
