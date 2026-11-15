/**
 * Open or buy state for each card on /products (src/pages/Home.tsx).
 * Kept pure so a test can feed it a real seat pass and check what the instructor sees.
 *
 * A live instructor seat opens what its pass grants: White, Student Edition, Instructor
 * Edition, and Advantage Pro (the academy's console, filtered by the seat's switches).
 * None of those may show a price, a locked look, or a demo. Media Edition is not on a
 * seat pass; it only opens when the seat's switches include Media Console.
 */

import { proConsoleEntryOpen, type ProSurfaceInput, coachDoorOpen, homeConsoleLabel, mediaEditionDoorOpen } from './productNames.ts';
import { ownerEditionTarget } from './ownerHome.ts';
import type { EntitlementClaims } from './entitlementToken.ts';

export type TileState = 'open' | 'buy';

export type HomeTileInput = {
  door: ProSurfaceInput;
  claims: EntitlementClaims | null;
  nowMs: number;
  amnesty: boolean;
  settled: boolean;
  whiteUnlocked: boolean;
  coachUnlocked: boolean;
  /** Student Edition entitled (or the ?student=1 demo is showing). */
  studentOpen: boolean;
  /** True when Student Edition is the demo, not the real edition. */
  studentDemo: boolean;
  cloudOpen: boolean;
};

export type HomeTiles = {
  white: TileState;
  student: TileState | 'demo';
  media: TileState;
  instructor: TileState;
  pro: TileState;
  /** Where the open Pro card goes. Null when it is a buy card. */
  proTo: '/pro' | '/pro-plus-cloud' | null;
  /** The Pro card also shows the owner Pro + Cloud button. Never for a seat. */
  cloudButton: boolean;
  /** Show the Pro price line on a buy card. */
  proPrice: boolean;
};

export function homeTiles(input: HomeTileInput): HomeTiles {
  const { door } = input;
  const access = { claims: input.claims, amnesty: input.amnesty };
  const seated = door.seated;
  const consoleOpen = proConsoleEntryOpen(door, access.claims, input.nowMs, access.amnesty);
  const consoleLabel = homeConsoleLabel(door);
  const proTo = ownerEditionTarget({ entry: 'pro', settled: input.settled, seated, proConsoleOpen: consoleOpen, cloudOpen: input.cloudOpen });
  const cloudTo = ownerEditionTarget({ entry: 'pro-cloud', settled: input.settled, seated, proConsoleOpen: consoleOpen, cloudOpen: input.cloudOpen });
  const openProHome = proTo === '/pro' && (!seated || Boolean(consoleLabel));
  const openCloudHome = input.cloudOpen && cloudTo === '/pro-plus-cloud';
  return {
    white: input.whiteUnlocked ? 'open' : 'buy',
    student: input.studentOpen ? (input.studentDemo ? 'demo' : 'open') : 'buy',
    media: mediaEditionDoorOpen(door) ? 'open' : 'buy',
    instructor: coachDoorOpen(door.proUnlocked, input.coachUnlocked, seated) ? 'open' : 'buy',
    pro: openProHome || openCloudHome ? 'open' : 'buy',
    proTo: openProHome ? '/pro' : openCloudHome ? '/pro-plus-cloud' : null,
    cloudButton: openCloudHome,
    proPrice: !seated,
  };
}
