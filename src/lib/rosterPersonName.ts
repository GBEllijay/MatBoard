/** Shared person-name key for matching Student Roster cards. */
const NAME_MAX = 80;

export function normalizeRosterPersonName(name: string): string {
  return name.normalize('NFC').trim().slice(0, NAME_MAX).replace(/\s+/g, ' ').toLowerCase();
}
