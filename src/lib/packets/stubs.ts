/**
 * Instructor, academy, and media packets.
 * The envelope is real. The sections describe the work still to do.
 * Import previews them and does not restore them.
 */

import { buildPacket, PACKET_APP_VERSION, type AdvantagePacket, type PacketKind, type PacketPreview } from './core.ts';

export type PacketPlanSection = {
  name: string;
  detail: string;
};

export type PacketPlan = {
  kind: Exclude<PacketKind, 'student'>;
  status: 'designed';
  /** Short reason this kind is where it is in the queue. */
  priority: string;
  summary: string;
  sections: PacketPlanSection[];
  excluded: string[];
};

export const PACKET_PLANS: Record<Exclude<PacketKind, 'student'>, PacketPlan> = {
  instructor: {
    kind: 'instructor',
    status: 'designed',
    priority: 'After the academy packet.',
    summary: 'Instructor character sheet and the teaching records stored on this device.',
    sections: [
      { name: 'characterSheet', detail: 'Name, photo, belt, teaching start, and the stat sheet.' },
      { name: 'techniqueTree', detail: 'Technique tree (matboard.coach.techniqueTree.v1).' },
      { name: 'trainingNotes', detail: 'Daily lesson notes (matboard.coach.trainingNotes.v1).' },
      { name: 'competitionCurriculum', detail: 'Competition curriculum kept for this instructor.' },
      { name: 'lessonTemplates', detail: 'Lesson templates stored on this device.' },
    ],
    excluded: ['Instructor seat session', 'OAuth tokens', 'Stripe customer ids', 'License redemption codes'],
  },
  academy: {
    kind: 'academy',
    status: 'designed',
    priority: 'Next. Academy info has no export today, so clearing the cache means typing it again.',
    summary: 'Academy profile, branding, lineage, roster, schedule, and settings.',
    sections: [
      { name: 'profile', detail: 'Gym name, founded date, founders, lineage, and whether lineage is shown.' },
      { name: 'branding', detail: 'Gym logo on this device.' },
      { name: 'roster', detail: 'Student roster. Roster notes stay in the academy packet.' },
      { name: 'schedule', detail: 'Class schedule.' },
      { name: 'events', detail: 'Gym event log.' },
      { name: 'settings', detail: 'Gallery approval and other academy settings that are not licenses.' },
    ],
    excluded: ['Stripe', 'Seat invite tokens', 'License codes', 'Drive OAuth tokens', 'Plus Cloud credentials'],
  },
  media: {
    kind: 'media',
    status: 'designed',
    priority: 'After academy and instructor.',
    summary: 'Media Console items and settings. Plus Cloud bytes stay in the owner cloud account.',
    sections: [
      { name: 'library', detail: 'Local gallery items, shop slides, and event slides.' },
      { name: 'settings', detail: 'Gallery approval, playback, and other console settings on this device.' },
      {
        name: 'cloudIndex',
        detail:
          'A later file may list Plus Cloud object ids and names. It does not embed those bytes and it does not include credentials or signed URLs.',
      },
    ],
    excluded: ['Cloud credentials', 'Signed URLs', 'Stripe'],
  },
};

export async function buildDesignedPacket(
  kind: Exclude<PacketKind, 'student'>,
  now = new Date(),
): Promise<{ packet: AdvantagePacket; text: string }> {
  const plan = PACKET_PLANS[kind];
  return buildPacket({
    kind,
    createdAt: now.toISOString(),
    appVersion: PACKET_APP_VERSION,
    sections: { status: 'designed', plan },
  });
}

export function describeDesignedPacket(packet: AdvantagePacket): PacketPreview {
  const plan = packet.sections.plan as Partial<PacketPlan> | undefined;
  const lines = [
    `${packet.kind[0]?.toUpperCase() ?? ''}${packet.kind.slice(1)} packet · designed, not imported in this build`,
    typeof plan?.summary === 'string' ? plan.summary : '',
    typeof plan?.priority === 'string' ? plan.priority : '',
    'Checksums verified. This build does not restore this packet.',
  ].filter((line) => line.length > 0);
  return { title: `${packet.kind} packet`, lines, restorable: false };
}
