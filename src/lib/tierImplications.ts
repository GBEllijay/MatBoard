import { DOORS, type Door } from './entitlementToken.ts';

/**
 * THE tier rule. One table, used by every gate:
 *   - server grants and the signed pass scope (src/server/grantMatrix.ts expandGrants)
 *   - Stripe products, code kinds, owner test, refresh and restore (all go through expandGrants)
 *   - client gates (src/lib/entitlement.ts doorOpen, src/lib/serverGrant.ts)
 *   - Phase 4 paid screens (src/lib/paidChunkAccess.ts proGrantOpen, read by functions/paid)
 *
 * Locked owner rule (Oct 30, 2026; ladder confirmed Nov 1, 2026: "Every higher tier unlocks
 * the lower tiers."): White < Student Edition < Media Edition < Instructor (coach) < Pro.
 * Owning a tier (bought, alpha code, owner test, or a legacy flag) opens every tier below it.
 *   Pro     = Pro + Instructor/Coach + Media Edition + Student Edition + White
 *   Coach   = Instructor/Coach + Media Edition + Student Edition + White
 *   Media   = Media Edition (Media Console) + Student Edition + White
 *   Student = Student Edition + White
 *   White   = White
 *
 * Not part of this table (unchanged): Coach Unlimited opens for Pro or a direct coach grant
 * (paidChunkAccess.ts coachUnlimitedGrant), never for White, Student or Media. Seats keep their
 * invite presets for Media Console. Upgrade credit reads purchases, not this table, for the price.
 */
export const IMPLIED_DOORS: Readonly<Record<Door, readonly Door[]>> = {
  white: ['white'],
  student: ['student', 'white'],
  media: ['media', 'student', 'white'],
  coach: ['coach', 'media', 'student', 'white'],
  pro: ['pro', 'coach', 'media', 'student', 'white'],
};

/** Every door the given grants open, in DOORS order. Unknown names are dropped. */
export function impliedDoors(grants: readonly string[]): Door[] {
  const open = new Set<Door>();
  for (const grant of grants) {
    const row = (IMPLIED_DOORS as Record<string, readonly Door[] | undefined>)[grant];
    if (row) row.forEach((door) => open.add(door));
  }
  return DOORS.filter((door) => open.has(door));
}

/** The doors whose grant opens `door` (including itself). */
export function doorsThatOpen(door: Door): Door[] {
  return DOORS.filter((source) => IMPLIED_DOORS[source].includes(door));
}
