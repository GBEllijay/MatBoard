/** Test-only fixture: a Competitor Roster plan as the progress import stores it. Not imported by the app. */
import type { ImportedCompetitionPlan } from '../progress/competition';
import { normalizeRoster } from '../rosterStore.ts';

export function competitionPlanFixture(): ImportedCompetitionPlan {
  const t = (id: string, name: string, date: string, status: string, extra: Record<string, unknown> = {}) => ({ id, name, date, location: 'Atlanta, GA', division: 'Adult Purple Gi', weightClass: 'Feather', deadline: '', link: '', status, targetWeight: 141.5, targetUnit: 'lb', goals: [], ...extra });
  const m = (id: string, opponent: string, result: string, method: string, date: string) => ({ id, opponent, result, method, note: '', date });
  const plan = {
    studentId: 'stu-maya', displayName: 'Maya', importedAt: Date.parse('2026-11-02T15:00:00Z'), sourceUpdatedAt: Date.parse('2026-11-02T14:00:00Z'),
    games: { a: { techniques: 'Armbar from mount', notes: 'Finish the grip' }, b: { techniques: '', notes: '' }, c: { techniques: '', notes: '' } },
    tournaments: [t('t1', 'Appalachian Grappling Open', '2026-11-15', 'entered'), t('t2', 'Chattahoochee No-Gi Invitational', '2026-12-06', 'considering'), t('t3', 'North Georgia Submission Series', '2027-01-17', 'entered'), t('t0', 'Peach State Spring Open', '2026-04-11', 'entered')],
    weighIns: [{ id: 'w1', date: '2026-11-03', weight: 139.6, unit: 'lb', note: '' }],
    results: [
      { id: 'r1', tournamentId: 't0', tournamentName: 'Peach State Spring Open', division: 'Adult Purple Gi · Feather', matches: [m('m1', 'Dana Shafer', 'win', 'sub', '2026-04-11'), m('m2', 'Riley Thompson', 'win', 'points', '2026-04-11'), m('m3', 'Sam Winfield', 'loss', 'advantage', '2026-04-11')], bracket: [], bracketPhoto: false },
      { id: 'r2', tournamentId: '', tournamentName: 'Fall Classic', division: 'Adult Purple No-Gi', matches: [m('m4', 'Riley Thompson', 'win', 'sub', '2026-09-20'), m('m5', 'Priya Nair', 'loss', 'points', '2026-09-20')], bracket: [], bracketPhoto: false },
    ],
    weightUnit: 'lb', goalWeight: 141.5, goalUnit: 'lb', weighDate: '2026-11-14',
  };
  const roster = normalizeRoster({ version: 1, students: [{ id: 'c1', name: 'Maya Alvarez', belt: 'Purple', division: 'Adult Featherweight', gym: 'Ellijay Academy', photo: '', lastPromotion: '2026-06-01', lastPromotionDetail: 'Purple belt', note: '' }], ready: {}, gamePlans: {}, competitionPlans: { c1: plan } });
  const parsed = roster.competitionPlans.c1;
  if (!parsed) throw new Error('fixture plan did not normalize');
  return parsed;
}
