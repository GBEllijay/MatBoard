/**
 * The gym file a head coach hands to students.
 * Import from coach reads the name and logo. An older coach file has neither.
 */

import { coachGymLogoFits } from './coachGymFit.ts';
import { exportProgressPacket } from './progress/format.ts';
import { PROGRESS_SCHEMA_VERSION, type CoachGymBrand, type CoachPlanPacket } from './progress/types.ts';

export const GYM_BRAND_FILE_ID = 'gym-brand';
export const GYM_BRAND_FILE_NAME = 'advantage-gym-file.json';

export function isGymBrandFile(packet: Pick<CoachPlanPacket, 'id' | 'kind' | 'plan'>): boolean {
  return packet.kind === 'coach-plan' && packet.id === GYM_BRAND_FILE_ID && packet.plan.title === 'Gym' && packet.plan.focus.length === 0;
}

/** Coach plan whose only job is the gym name and logo. It does not replace a lesson plan. */
export function buildGymBrandFile(input: { name: string; logo?: string | null; issuedOn: string; now?: number }): string {
  const name = input.name.trim().slice(0, 80);
  const logo = input.logo && coachGymLogoFits(input.logo) ? input.logo : undefined;
  const gym: CoachGymBrand = logo ? { name, logo } : { name };
  const packet: CoachPlanPacket = {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    kind: 'coach-plan',
    id: GYM_BRAND_FILE_ID,
    studentId: 'gym',
    updatedAt: input.now ?? Date.now(),
    plan: {
      title: 'Gym',
      issuedOn: input.issuedOn,
      note: '',
      focus: [],
    },
    gym,
  };
  return exportProgressPacket(packet);
}
