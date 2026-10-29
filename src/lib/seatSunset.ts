/** Seats already on a device keep working until this instant, then they need a server registration. */
export const SEAT_SUNSET_ENDS_AT = '2026-12-28T00:00:00.000Z';

let configured: string | null = null;

export function noteSeatSunset(iso: string | null): void {
  configured = iso;
}

export function seatSunsetEndsAt(): string | null {
  return configured;
}

export function isSignedSeatInvite(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 10);
}

/**
 * Unsigned seats stop after the sunset date once config has been loaded.
 * Tests leave the date unset, so existing local seats keep working.
 */
export function legacySeatBlocked(inviteToken: string, now = Date.now()): boolean {
  if (!configured || isSignedSeatInvite(inviteToken)) return false;
  const end = Date.parse(configured);
  return Number.isFinite(end) && now >= end;
}
