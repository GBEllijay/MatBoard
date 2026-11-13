/** Checkbox copy shown only after a photo or logo file is picked, never on the idle profile or report view. */
export const IMAGE_RIGHTS_LABEL = 'I own the rights to this image or have permission to use it';

/** Title on the confirm sheet that appears at the moment of upload. */
export const IMAGE_RIGHTS_TITLE = 'Use this image?';

/**
 * Every place in the app where someone picks a logo file from their own device.
 * Each one renders the shared ImageRightsGate, and nothing is saved until the box is checked
 * and Use is tapped. logoUploadSurfaces.regressions.test.tsx fails if a new logo writer appears
 * outside this list (or the sync list below) without the gate.
 */
export const LOGO_UPLOAD_SURFACES = [
  { file: 'src/components/GymCharacterSheet.tsx', screen: 'Academy profile logo (/pro and /pro-plus-cloud, Edit academy profile)' },
  { file: 'src/components/GymLogoControl.tsx', screen: 'Media Console custom gym logo (/screensaver, Gym logo)' },
  { file: 'src/components/TimerBackdropOptions.tsx', screen: 'Round timer Background & logo, gym logo (/training options and Rounds controller)' },
  { file: 'src/pages/Schedule.tsx', screen: 'Class board logo (/schedule, Edit class schedule)' },
  { file: 'src/pages/student/ProfileIdentity.tsx', screen: 'Student Edition My profile gym logo and profile photo (/student/profile)' },
] as const;

/**
 * Logo writers that never take a file from this person's device picker. The logo was already
 * confirmed by the owner who uploaded it, or it is this person's own backup coming back.
 */
export const LOGO_SYNC_WRITERS = [
  { file: 'src/components/CoachUpdateInbox.tsx', why: 'Gym logo sent by the owner or coach through Coach Sync' },
  { file: 'src/lib/coachInbound.ts', why: 'Gym logo inside a coach packet from the gym inbox or folder' },
  { file: 'src/pages/student/SharePage.tsx', why: 'Gym name and logo inside a coach or gym file from Import from coach' },
  { file: 'src/lib/studentBackup.ts', why: 'Restoring this student\u2019s own journal backup' },
] as const;
