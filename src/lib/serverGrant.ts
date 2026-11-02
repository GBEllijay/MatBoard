import { clearRelocksFor } from './entitlement.ts';
import { impliedDoors } from './tierImplications.ts';
import { setCoachUnlocked } from './coachUnlock.ts';
import { setProUnlocked } from './proUnlock.ts';
import { setStudentEditionUnlocked } from './studentUnlock.ts';
import { setWhiteExpiry, setWhiteUnlocked } from './whiteUnlock.ts';

export type ServerDoor = 'white' | 'student' | 'coach' | 'pro' | 'media' | 'seat';

/** Apply the doors a server redeem or checkout confirm returned. Codes stay on the server. */
export function applyServerGrant(input: { grants?: unknown; expiresAt?: unknown }): boolean {
  if (!Array.isArray(input.grants) || input.grants.length === 0) return false;
  const listed = input.grants.filter((door): door is ServerDoor => typeof door === 'string');
  // Same tier rule as the server and the pass (tierImplications.ts).
  const grants = new Set<ServerDoor>([...listed, ...impliedDoors(listed)]);
  const expiry = typeof input.expiresAt === 'string' ? input.expiresAt : null;
  if (grants.has('white')) {
    setWhiteUnlocked(true);
    setWhiteExpiry(expiry);
  }
  if (grants.has('coach')) setCoachUnlocked(true);
  if (grants.has('pro')) setProUnlocked(true);
  if (grants.has('student')) setStudentEditionUnlocked(true);
  // Media has no on-device flag. It opens from the signed pass; clear its lock mark.
  if (grants.has('media')) clearRelocksFor(['media']);
  return true;
}
