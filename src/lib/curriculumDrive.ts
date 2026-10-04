/**
 * Save a Competition Class Curriculum as text in the coach's connected Drive.
 * The phone copy is already stored. Video bytes are not uploaded.
 */

import {
  curriculumHasContent,
  sanitizeCurriculum,
  type CurriculumPlan,
} from './competitionCurriculum.ts';
import {
  curriculumDriveFileName,
  readDriveBinding,
  requestDriveToken,
  upsertCurriculumFile,
} from './googleDrive.ts';
import { driveFolderWebUrl } from './openMyDrive.ts';

export type CurriculumDriveDocument = {
  advantage: 'competition-curriculum';
  version: 1;
  date: string;
  coachName: string;
  savedAt: number;
  purpose: 'self';
  curriculum: CurriculumPlan;
};

export type CurriculumDriveResult =
  | { status: 'saved'; folderUrl: string | null }
  | { status: 'needs-drive' }
  | { status: 'empty' }
  | { status: 'failed' };

/** Text only. A stray blob on the object cannot ride along. */
export function curriculumDriveDocument(input: {
  dateKey: string;
  savedAt: number;
  plan: CurriculumPlan;
}): CurriculumDriveDocument {
  const { plan } = sanitizeCurriculum(input.plan);
  return {
    advantage: 'competition-curriculum',
    version: 1,
    date: input.dateKey,
    coachName: plan.coachName.trim().slice(0, 80),
    savedAt: input.savedAt,
    purpose: 'self',
    curriculum: plan,
  };
}

export function curriculumDriveName(dateKey: string, plan: CurriculumPlan): string {
  const { plan: clean } = sanitizeCurriculum(plan);
  return curriculumDriveFileName(dateKey, clean.coachName, clean.id);
}

export async function exportCurriculumToDrive(input: {
  dateKey: string;
  plan: CurriculumPlan;
  savedAt?: number;
}): Promise<CurriculumDriveResult> {
  const document = curriculumDriveDocument({
    dateKey: input.dateKey,
    savedAt: input.savedAt ?? Date.now(),
    plan: input.plan,
  });
  if (!curriculumHasContent(document.curriculum)) return { status: 'empty' };
  const binding = readDriveBinding();
  if (!binding) return { status: 'needs-drive' };
  let token = await requestDriveToken('silent');
  if (!token) token = await requestDriveToken('consent');
  if (!token) return { status: 'needs-drive' };
  try {
    await upsertCurriculumFile({
      token,
      folderId: binding.folderId,
      dateKey: document.date,
      coachName: document.coachName,
      planId: document.curriculum.id,
      documentJson: JSON.stringify(document),
    });
    return { status: 'saved', folderUrl: driveFolderWebUrl(binding.folderId) };
  } catch {
    return { status: 'failed' };
  }
}
