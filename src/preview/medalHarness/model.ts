/**
 * Disposable medal-communication harness.
 * Real student-file and coach-update functions are called unmodified.
 * Medal, podium, team-award, and photo claims live only in this harness.
 * They are not a production sync.
 */

import { acceptCoachCompetitionUpdate, buildCoachCompetitionUpdate } from '../../lib/coachCompetitionUpdate.ts';
import { competitionOf } from '../../lib/progress/competition.ts';
import { emptyUpdateLedger } from '../../lib/coachRankUpdate.ts';
import { exportProgressPacket, parseProgressPacket } from '../../lib/progress/format.ts';
import type { MatchResult, StudentProgressReport } from '../../lib/progress/types.ts';
import { addCompetitionMatch, addCompetitionResult, addTournament } from '../../lib/studentCompetition.ts';
import { blankStudentReport } from '../../lib/studentEdition.ts';
import { assignStudentId } from '../../lib/studentIdentity.ts';

export const HARNESS_PATH = '/preview/medal-harness';
export const HARNESS_STUDENT_ID = 'coach-bot-three';
export const HARNESS_STUDENT_NAME = 'Coach Bot Three';
export const HARNESS_INSTRUCTOR_ID = 'instructor-bot-one';
export const HARNESS_INSTRUCTOR_NAME = 'Instructor Bot One';
export const HARNESS_ACADEMY = 'Harness Gym';
export const HARNESS_STORAGE_KEY = 'matboard.TEST-HARNESS.medal.v1';
export const HARNESS_ENVELOPE_KIND = 'test-harness-envelope';

export const INSTRUCTOR_FIXTURE = {
  id: HARNESS_INSTRUCTOR_ID,
  name: HARNESS_INSTRUCTOR_NAME,
  teachingYears: 12,
  lineage: 'Instructor Bot One → Master Carlos',
  note: 'Fictional test credential. Master Carlos in this harness is a test name only. It is not a verified line and it is not the owner profile.',
} as const;

export type ClaimMedal = 'gold' | 'silver' | 'bronze' | null;

export type HarnessClaim = {
  id: string;
  studentId: string;
  academy: string;
  tournament: string;
  date: string;
  division: string;
  classKind: 'division' | 'open' | 'team';
  medal: ClaimMedal;
  matches: readonly { result: MatchResult }[];
  rankingPoints: number | null;
  teamPlace: 1 | 2 | 3 | null;
  photoName: string | null;
};

export const HARNESS_CLAIMS: readonly HarnessClaim[] = [
  { id: 'claim-gold', studentId: HARNESS_STUDENT_ID, academy: HARNESS_ACADEMY, tournament: 'Harness Open 2026', date: '2026-06-01', division: 'Middleweight', classKind: 'division', medal: 'gold', matches: [{ result: 'win' }, { result: 'win' }], rankingPoints: 9, teamPlace: null, photoName: 'fake-bracket.svg' },
  { id: 'claim-silver-loss', studentId: HARNESS_STUDENT_ID, academy: HARNESS_ACADEMY, tournament: 'Harness Open 2026', date: '2026-06-01', division: 'Middleweight', classKind: 'division', medal: 'silver', matches: [{ result: 'loss' }], rankingPoints: null, teamPlace: null, photoName: null },
  { id: 'claim-gold-nofight', studentId: HARNESS_STUDENT_ID, academy: HARNESS_ACADEMY, tournament: 'Harbor Test 2026', date: '2026-04-20', division: 'Lightweight', classKind: 'division', medal: 'gold', matches: [], rankingPoints: null, teamPlace: null, photoName: null },
  { id: 'claim-open', studentId: HARNESS_STUDENT_ID, academy: HARNESS_ACADEMY, tournament: 'Harness Open 2026', date: '2026-06-01', division: 'Open class', classKind: 'open', medal: 'bronze', matches: [{ result: 'win' }], rankingPoints: null, teamPlace: null, photoName: 'fake-bracket.svg' },
  { id: 'claim-team', studentId: HARNESS_STUDENT_ID, academy: HARNESS_ACADEMY, tournament: 'Harness Open 2026', date: '2026-06-01', division: 'Adults team', classKind: 'team', medal: null, matches: [], rankingPoints: null, teamPlace: 2, photoName: null },
  { id: 'claim-other-gym', studentId: HARNESS_STUDENT_ID, academy: 'Other Gym', tournament: 'Elsewhere 2025', date: '2025-01-01', division: 'Middleweight', classKind: 'division', medal: 'gold', matches: [{ result: 'win' }], rankingPoints: null, teamPlace: null, photoName: null },
];

export type HarnessLog = { origin: 'real-function' | 'harness'; action: string; detail: string };

export type HarnessEnvelope = {
  kind: typeof HARNESS_ENVELOPE_KIND;
  studentId: string;
  instructorId: string;
  realBackup: string;
  claims: HarnessClaim[];
  note: string;
};

const NOW = 1_700_000_000_000;

function tournamentDraft(name: string, date: string, division: string) {
  return {
    name,
    date,
    location: 'Test mat',
    division,
    weightClass: '',
    deadline: '',
    link: '',
    status: 'entered' as const,
    targetWeight: '',
    targetUnit: 'lb' as const,
  };
}

/** Real student file. Medals are not written into it. */
export function buildHarnessStudentReport(): { report: StudentProgressReport; log: HarnessLog[] } {
  const log: HarnessLog[] = [];
  let report = assignStudentId(blankStudentReport(NOW), HARNESS_STUDENT_ID, NOW);
  report = {
    ...report,
    profile: { ...report.profile, displayName: HARNESS_STUDENT_NAME, gymName: HARNESS_ACADEMY, belt: 'blue' },
  };
  log.push({ origin: 'real-function', action: 'blankStudentReport + assignStudentId', detail: HARNESS_STUDENT_ID });
  const seen = new Set<string>();
  let stamp = NOW + 1;
  for (const claim of HARNESS_CLAIMS) {
    if (claim.studentId !== HARNESS_STUDENT_ID || claim.academy !== HARNESS_ACADEMY) continue;
    if (claim.classKind === 'team') continue;
    const key = `${claim.tournament}|${claim.date}|${claim.division}`;
    if (seen.has(key)) continue;
    seen.add(key);
    report = addTournament(report, tournamentDraft(claim.tournament, claim.date, claim.division), stamp);
    const tournament = competitionOf(report).tournaments.at(-1);
    report = addCompetitionResult(report, { tournamentId: tournament?.id ?? '', tournamentName: claim.tournament, division: claim.division }, stamp + 1);
    const result = competitionOf(report).results.at(-1);
    let matchStamp = stamp + 2;
    for (const match of claim.matches) {
      if (!result) break;
      report = addCompetitionMatch(report, result.id, { opponent: 'Test opponent', result: match.result, method: '', note: 'Harness fixture match. Not a medal.', date: claim.date }, matchStamp);
      matchStamp += 1;
    }
    log.push({ origin: 'real-function', action: 'addTournament + addCompetitionResult + addCompetitionMatch', detail: `${claim.tournament} · ${claim.division} · ${claim.matches.length} matches` });
    stamp += 20;
  }
  log.push({ origin: 'harness', action: 'medal sidecar kept out of the student file', detail: `${HARNESS_CLAIMS.length} claims, including a team place and another gym` });
  return { report, log };
}

export function exportRealBackup(report: StudentProgressReport): string {
  return exportProgressPacket(report);
}

export function buildHarnessEnvelope(report: StudentProgressReport, claims: readonly HarnessClaim[] = HARNESS_CLAIMS): HarnessEnvelope {
  return {
    kind: HARNESS_ENVELOPE_KIND,
    studentId: report.studentId,
    instructorId: HARNESS_INSTRUCTOR_ID,
    realBackup: exportRealBackup(report),
    claims: claims.map((claim) => ({ ...claim, matches: [...claim.matches] })),
    note: 'Harness only. The real backup string is inside realBackup. Medal claims are not instructor-certified.',
  };
}

export type InstructorRead = {
  origin: 'real-function' | 'harness';
  ok: boolean;
  certified: false;
  academyTotalsChanged: false;
  title: string;
  detail: string;
  realKind: string;
  matchCount: number;
  uncertifiedClaims: HarnessClaim[];
};

function matchCountOf(report: StudentProgressReport): number {
  return competitionOf(report).results.reduce((sum, result) => sum + result.matches.length, 0);
}

/** What Instructor Bot One can actually learn from a pasted file. */
export function readForInstructor(text: string): InstructorRead {
  const base = { certified: false as const, academyTotalsChanged: false as const, uncertifiedClaims: [] as HarnessClaim[], matchCount: 0, realKind: 'none' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ...base, origin: 'real-function', ok: false, title: 'Not JSON', detail: 'The real parser cannot read this text.' };
  }
  if (raw && typeof raw === 'object' && (raw as { kind?: string }).kind === HARNESS_ENVELOPE_KIND) {
    const envelope = raw as HarnessEnvelope;
    const parsed = parseProgressPacket(envelope.realBackup ?? '');
    const claims = Array.isArray(envelope.claims) ? dedupeClaims(envelope.claims) : [];
    if (!parsed.ok || parsed.value.kind !== 'student-progress-report') {
      return { ...base, origin: 'harness', ok: false, title: 'Envelope rejected', detail: 'The harness wrapper is not a production packet, and the inner backup did not parse as a student file.', uncertifiedClaims: claims };
    }
    if (parsed.value.studentId !== HARNESS_STUDENT_ID) {
      return { ...base, origin: 'real-function', ok: false, realKind: parsed.value.kind, title: 'Wrong student', detail: `This file is for ${parsed.value.studentId}, not ${HARNESS_STUDENT_ID}. It was not applied.` };
    }
    return {
      ...base,
      origin: 'harness',
      ok: true,
      realKind: parsed.value.kind,
      matchCount: matchCountOf(parsed.value),
      uncertifiedClaims: claims.filter((claim) => claim.academy === HARNESS_ACADEMY),
      title: 'No production send',
      detail: 'The real backup has matches only. Medal, open-class, and team-award claims stay uncertified. They were not added to an instructor record or an academy total. There is no student-to-instructor channel.',
    };
  }
  const parsed = parseProgressPacket(text);
  if (!parsed.ok) {
    return { ...base, origin: 'real-function', ok: false, title: 'Schema rejected', detail: parsed.errors.join(' ') };
  }
  if (parsed.value.kind === 'coach-competition-update') {
    const applied = acceptCoachCompetitionUpdate(buildHarnessStudentReport().report, parsed.value, emptyUpdateLedger(), {}, NOW);
    return {
      ...base,
      origin: 'real-function',
      ok: false,
      realKind: parsed.value.kind,
      title: applied.applied ? 'Coach-to-student packet' : 'Wrong student or repeat',
      detail: applied.applied
        ? 'This is the existing coach-to-student direction. It is not a student medal sent to the instructor, and this harness does not keep that acceptance.'
        : 'The real accept function refused this packet for this student, or it was already in the ledger.',
    };
  }
  if (parsed.value.kind === 'student-progress-report') {
    if (parsed.value.studentId !== HARNESS_STUDENT_ID) {
      return { ...base, origin: 'real-function', ok: false, realKind: parsed.value.kind, title: 'Wrong student', detail: `Student file ${parsed.value.studentId} is not ${HARNESS_STUDENT_ID}.` };
    }
    return {
      ...base,
      origin: 'real-function',
      ok: true,
      realKind: parsed.value.kind,
      matchCount: matchCountOf(parsed.value),
      title: 'Student file read',
      detail: 'The real parser read a student progress file. It has no medal field, so nothing was certified.',
    };
  }
  return { ...base, origin: 'real-function', ok: false, realKind: parsed.value.kind, title: 'Wrong role', detail: `A ${parsed.value.kind} file is not a student medal handoff.` };
}

export function dedupeClaims(claims: readonly HarnessClaim[]): HarnessClaim[] {
  const seen = new Set<string>();
  const rows: HarnessClaim[] = [];
  for (const claim of claims) {
    if (seen.has(claim.id)) continue;
    seen.add(claim.id);
    rows.push(claim);
  }
  return rows;
}

export function restoreRealBackup(text: string): { ok: true; report: StudentProgressReport } | { ok: false; error: string } {
  const parsed = parseProgressPacket(text);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') {
    return { ok: false, error: parsed.ok ? `Restored kind was ${parsed.value.kind}.` : parsed.errors.join(' ') };
  }
  return { ok: true, report: parsed.value };
}

export function wrongStudentCoachPacket(): string {
  const built = buildCoachCompetitionUpdate({
    studentId: 'someone-else',
    tournamentName: 'Wrong student event',
    date: '2026-02-02',
    matches: [{ opponent: 'Pat', result: 'win', method: '' }],
    now: NOW,
    updateId: 'wrong-student-packet',
  });
  if (!built.ok) throw new Error(built.error);
  return exportProgressPacket(built.packet);
}

export function repeatAcceptRefused(report: StudentProgressReport): boolean {
  const built = buildCoachCompetitionUpdate({
    studentId: report.studentId,
    tournamentName: 'Repeat Cup',
    date: '2026-03-03',
    matches: [{ opponent: 'Pat', result: 'loss', method: '' }],
    now: NOW,
    updateId: 'repeat-once',
  });
  if (!built.ok) throw new Error(built.error);
  const first = acceptCoachCompetitionUpdate(report, built.packet, emptyUpdateLedger(), {}, NOW);
  const second = acceptCoachCompetitionUpdate(first.report, built.packet, first.ledger, {}, NOW + 1);
  return first.applied === true && second.applied === false;
}
