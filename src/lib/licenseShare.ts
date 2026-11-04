/**
 * License share pages: one QR and one copy link for a coach seat invite
 * (Advantage Instructor Edition) and one for students (Advantage Student Edition).
 *
 * Links come only from the existing paths:
 *   - Instructor: instructorInviteLink(seat.inviteToken) for a seat the owner already issued.
 *   - Student: academyPathwayUrl for the Drive or OneDrive folder connected on this browser.
 * Nothing here mints, signs, or logs a code. Nothing here sends email.
 */

import { ADVANTAGE_MARK_SRC } from './gymLogo.ts';
import { academyPathway, academyPathwayUrl, type AcademyPathway, type AcademyProvider } from './academyPathway.ts';
import {
  countOpenInstructorSeats,
  instructorInviteLink,
  proSeatsRemaining,
  type InstructorSeat,
} from './instructorSeats.ts';
import { instructorSeatAllowance } from './proBundleMath.ts';
import { legacySeatBlocked } from './seatSunset.ts';

export const LICENSE_SHARE_BUTTON = 'Share code';
export const INSTRUCTOR_SHARE_PATH = '/coach-unlimited/share/instructor';
export const STUDENT_SHARE_PATH = '/coach-unlimited/share/student';
export const INSTRUCTOR_SHARE_HEADER = 'Advantage Instructor Edition';
export const STUDENT_SHARE_HEADER = 'Advantage Student Edition';
export const SHARE_COPY_LABEL = 'Copy link';
export const SHARE_COPIED_LABEL = 'Copied';
export const SHARE_COPY_FAILED = 'Could not copy. Select the link and copy it.';
export const SHARE_OWNER_ONLY = 'Only the gym owner can share these codes.';
export const SHARE_NO_INVITE =
  'No open coach invite yet. Issue one on Instructor Collaboration, then come back to share it.';
export const SHARE_NO_FOLDER =
  'Connect the academy folder (Google Drive or OneDrive) first. The Student Edition link points students to it.';

export type ShareKind = 'instructor' | 'student';

export type ShareDoor = {
  proUnlocked: boolean;
  coachUnlocked: boolean;
  seated: boolean;
};

/**
 * Which share pages this browser may open. Only the owner (no signed-in seat).
 * Coach seat invites stay a Pro owner tool (#200, same door as /instructors).
 * Instructor Edition owners share the Student Edition academy link.
 * Lower tiers and every seat (assistant coaches included) get nothing.
 */
export function licenseShareKinds(door: ShareDoor): ShareKind[] {
  if (door.seated) return [];
  if (door.proUnlocked) return ['instructor', 'student'];
  if (door.coachUnlocked) return ['student'];
  return [];
}

export function shareButtonVisible(door: ShareDoor): boolean {
  return licenseShareKinds(door).length > 0;
}

export function sharePathFor(kind: ShareKind): string {
  return kind === 'instructor' ? INSTRUCTOR_SHARE_PATH : STUDENT_SHARE_PATH;
}

export function shareHeaderFor(kind: ShareKind): string {
  return kind === 'instructor' ? INSTRUCTOR_SHARE_HEADER : STUDENT_SHARE_HEADER;
}

/** Issued, unclaimed coach invites. Active and revoked seats are not re-shared. */
export function shareableInvites(seats: readonly InstructorSeat[], now = Date.now()): InstructorSeat[] {
  return seats.filter((seat) => seat.status === 'invited' && !legacySeatBlocked(seat.inviteToken, now));
}

/** The same link Instructor Collaboration shows for that seat. */
export function instructorShareLink(seat: Pick<InstructorSeat, 'inviteToken'>, origin: string): string {
  return instructorInviteLink(seat.inviteToken, origin);
}

/** "N of 5 left" from the local seat archive. No server call. */
export function instructorSeatTicker(seats: readonly Pick<InstructorSeat, 'status'>[]): string {
  const allowance = instructorSeatAllowance(0);
  const left = proSeatsRemaining(countOpenInstructorSeats(seats), allowance);
  return `${left} of ${allowance} coach seats left`;
}

export type FolderBinding = { folderId: string; folderName: string } | null;

export type StudentShare = { pathway: AcademyPathway; provider: AcademyProvider; url: string };

/** One Student Edition link per connected folder, same as the academy pathway panel. */
export function studentShareLinks(input: {
  google: FolderBinding;
  oneDrive: FolderBinding;
  gymName?: string;
  license?: string;
  origin: string;
}): StudentShare[] {
  const out: StudentShare[] = [];
  const add = (provider: AcademyProvider, binding: FolderBinding) => {
    if (!binding) return;
    const pathway = academyPathway({
      provider,
      folderId: binding.folderId,
      folderName: binding.folderName,
      gymName: input.gymName,
      license: input.license,
    });
    if (pathway) out.push({ pathway, provider, url: academyPathwayUrl(pathway, input.origin) });
  };
  add('googleDrive', input.google);
  add('oneDrive', input.oneDrive);
  return out;
}

type ClipboardHost = {
  clipboard?: { writeText?: (text: string) => Promise<void> };
};

/**
 * Clipboard first. When that is missing or refused, select the field and use
 * the legacy copy command. Returns whether either path reported success.
 */
export async function copyShareLink(
  text: string,
  options: {
    navigator?: ClipboardHost | null;
    field?: { select?: () => void; setSelectionRange?: (a: number, b: number) => void } | null;
    execCopy?: () => boolean;
  } = {},
): Promise<boolean> {
  const nav = options.navigator ?? (typeof navigator === 'undefined' ? null : (navigator as ClipboardHost));
  const write = nav?.clipboard?.writeText;
  if (typeof write === 'function') {
    try {
      await write.call(nav!.clipboard, text);
      return true;
    } catch {
      /* fall through to the select-and-copy path */
    }
  }
  const field = options.field ?? null;
  try {
    field?.select?.();
    field?.setSelectionRange?.(0, text.length);
  } catch {
    /* selection is best effort */
  }
  const exec =
    options.execCopy ??
    (() => {
      if (typeof document === 'undefined') return false;
      const doc = document as Document & { execCommand?: (command: string) => boolean };
      try {
        return typeof doc.execCommand === 'function' ? doc.execCommand('copy') : false;
      } catch {
        return false;
      }
    });
  return exec();
}

/**
 * One logo slot on the share card: the master gym logo (Gallery "Custom gym
 * logo" slot, see getGymLogo) when it is a raster data URL, otherwise the
 * Advantage logo. SVG data URLs are never shown.
 */
export function resolveShareLogo(gymLogo: string | null | undefined): string {
  const gym = gymLogo?.trim() ?? '';
  if (gym.startsWith('data:image/') && !gym.startsWith('data:image/svg')) return gym;
  return ADVANTAGE_MARK_SRC;
}
