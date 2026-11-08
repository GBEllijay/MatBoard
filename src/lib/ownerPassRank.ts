import type { EntitlementClaims } from './entitlementToken.ts';
import { ownerTestActive } from './ownerTestGrant.ts';
import { impliedDoors } from './tierImplications.ts';

type RankableDoor = {
  seat: unknown;
  seated: boolean;
  seatGrantsMedia: boolean;
  programDirectorSeat: boolean;
  coachMenus: boolean;
};

/**
 * An owner unlock, an alpha-pro code, or a Pro pass outranks a seat session
 * for the Pro console and the seat banner. The seat stays signed in. A seat
 * token by itself does not outrank. A locked Pro subscription does not.
 */
export function ownerPassOutranksSeat(claims: EntitlementClaims | null): boolean {
  if (ownerTestActive('pro')) return true;
  if (!claims) return false;
  if (claims.tier === 'seat' || claims.src === 'seat') return false;
  if (claims.subs?.state === 'locked') return false;
  if (!impliedDoors(claims.grants).includes('pro')) return false;
  if (claims.src === 'owner' || claims.tier === 'owner') return true;
  if (claims.grants.includes('pro') && (claims.src === 'code' || claims.src === 'stripe')) return true;
  return false;
}

/**
 * The invite form is the owner's. A seat session on the same phone does not
 * hide it while an owner or alpha-pro pass outranks that seat. A seat token
 * still cannot issue invites.
 */
export function inviteBlockedAsSeat(seat: unknown, claims: EntitlementClaims | null): boolean {
  if (!seat) return false;
  return !ownerPassOutranksSeat(claims);
}

/** Drop the seat from a door while an owner or alpha-pro pass is on this device. */
export function rankSeatDoor<T extends RankableDoor>(door: T, claims: EntitlementClaims | null): T {
  if (!ownerPassOutranksSeat(claims)) return door;
  return {
    ...door,
    seat: null,
    seated: false,
    seatGrantsMedia: false,
    programDirectorSeat: false,
    coachMenus: false,
  };
}
