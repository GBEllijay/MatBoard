/**
 * Who recorded an academy event: the signed-in seat, or the owner of this device.
 * The name is the role label, not an email address.
 */

import { entitlementSnapshot } from './entitlement.ts';
import { setGymActorReader } from './gymEventLog.ts';
import { INSTRUCTOR_PRESETS, readCurrentSeat } from './instructorSeats.ts';

const ROLE_LABEL = new Map(INSTRUCTOR_PRESETS.map((preset) => [preset.id, preset.label]));

export function installGymActor(): void {
  setGymActorReader(() => {
    const claims = entitlementSnapshot().claims;
    const seat = readCurrentSeat();
    const license = (claims?.gym || claims?.sub || 'local').trim().slice(0, 80);
    if (seat) {
      return {
        licenseId: license || 'local',
        seatId: seat.id,
        name: (seat.presetId && ROLE_LABEL.get(seat.presetId)) || 'Instructor',
      };
    }
    return { licenseId: license || 'local', seatId: 'owner', name: 'Owner' };
  });
}
