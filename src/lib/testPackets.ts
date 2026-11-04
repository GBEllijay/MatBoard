/** Test helpers only: one sample packet of every coach → student kind. */
import { buildCoachCompetitionUpdate } from './coachCompetitionUpdate.ts';
import { buildCoachRankUpdate } from './coachRankUpdate.ts';
import {
  buildCoachAssessmentUpdate,
  buildCoachBeltProgressUpdate,
  buildCoachGymLogoUpdate,
  buildCoachNoteUpdate,
  type SyncPacket,
} from './coachSync.ts';

export const TEST_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
export const TEST_LOGO_2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export function testMemory() {
  const bag = new Map<string, string>();
  return {
    bag,
    getItem: (key: string) => bag.get(key) ?? null,
    setItem: (key: string, value: string) => {
      bag.set(key, value);
    },
    removeItem: (key: string) => {
      bag.delete(key);
    },
  };
}

function must<T>(built: { ok: true; packet: T } | { ok: false; error: string }): T {
  if (!built.ok) throw new Error(built.error);
  return built.packet;
}

export function everyTestPacket(studentId = 'stu-alex', now = 50): SyncPacket[] {
  return [
    must(
      buildCoachRankUpdate({
        studentId,
        belt: 'Blue',
        stripeCount: 1,
        promotionDate: '2026-11-03',
        now,
        updateId: `rank-${studentId}`,
      }),
    ),
    must(
      buildCoachCompetitionUpdate({
        studentId,
        tournamentName: 'Mock open',
        date: '2026-11-01',
        matches: [{ opponent: 'Sam', result: 'win', method: 'sub' }],
        now,
        updateId: `comp-${studentId}`,
      }),
    ),
    must(
      buildCoachBeltProgressUpdate({
        studentId,
        belt: 'Blue',
        issuedOn: '2026-11-03',
        benchmarks: [{ targetId: 'guard-retention', name: 'Guard retention', coachStatus: 'working' }],
        now,
        updateId: `belt-${studentId}`,
      }),
    ),
    must(
      buildCoachAssessmentUpdate({
        studentId,
        date: '2026-11-03',
        scores: { guard: 4, passing: 3 },
        strengths: 'Grips',
        weaknesses: 'Cardio',
        now,
        updateId: `assess-${studentId}`,
      }),
    ),
    must(
      buildCoachNoteUpdate({
        studentId,
        note: 'Keep elbows tight in closed guard.',
        issuedOn: '2026-11-03',
        journalDate: '2026-11-02',
        now,
        updateId: `note-${studentId}`,
      }),
    ),
    must(
      buildCoachGymLogoUpdate({
        studentId,
        master: { dataUrl: TEST_LOGO, version: 10, gymName: 'Advantage' },
        now,
        updateId: `logo-${studentId}`,
      }),
    ),
  ];
}
