/**
 * Tiny hook so local saves can tell signed-in sync to push, without a
 * circular import between the stores and signedInSync.ts.
 * While Cloud is being applied, suppress so those writes do not look like new edits.
 */

export type SyncTriggerKind = 'academy' | 'student' | 'profiles' | 'switch';

type Handler = (kind: SyncTriggerKind, profileId?: string) => void;

let handler: Handler | null = null;
let suppress = 0;

export function setSyncTrigger(fn: Handler | null): void {
  handler = fn;
}

export function suppressSyncTrigger(): () => void {
  suppress += 1;
  return () => {
    suppress = Math.max(0, suppress - 1);
  };
}

export function isSyncTriggerSuppressed(): boolean {
  return suppress > 0;
}

export function noteLocalAcademyChange(): void {
  if (suppress) return;
  handler?.('academy');
}

export function noteLocalStudentChange(profileId?: string): void {
  if (suppress) return;
  handler?.('student', profileId);
}

export function noteLocalProfilesChange(): void {
  if (suppress) return;
  handler?.('profiles');
}

export function noteStudentProfileSwitch(profileId: string): void {
  if (suppress) return;
  handler?.('switch', profileId);
}
