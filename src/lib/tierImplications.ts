import { DOORS, type Door } from './entitlementToken.ts';

/**
 * THE tier rule. One table, used by every gate:
 *   - server grants and the signed pass scope (src/server/grantMatrix.ts expandGrants)
 *   - Stripe products, code kinds, owner test, refresh and restore (all go through expandGrants)
 *   - client gates (src/lib/entitlement.ts doorOpen, src/lib/serverGrant.ts)
 *   - Phase 4 paid screens (src/lib/paidChunkAccess.ts proGrantOpen, read by functions/paid)
 *
 * Locked owner rule (Oct 30, 2026): each tier unlocks everything below it.
 *   Pro   = Pro + Coach/Instructor + Student Edition + White + Media Edition
 *   Coach = Coach/Instructor + White
 *   Media = Media Edition (Media Console) + White (Scoreboard and Round Timer)
 *   Student Edition is a separate journal product. It opens only itself.
 *   White opens only itself.
 *
 * Media Edition (Oct 31, 2026): 'media' is a door in entitlementToken.ts DOORS, its own row
 * opens Media + White, and the pro row includes it. Coach does not open Media.
 */
export const IMPLIED_DOORS: Readonly<Record<Door, readonly Door[]>> = {
  white: ['white'],
  student: ['student'],
  coach: ['coach', 'white'],
  pro: [
    'pro',
    'coach',
    'student',
    'white',
    'media',
  ],
  media: ['media', 'white'],
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
