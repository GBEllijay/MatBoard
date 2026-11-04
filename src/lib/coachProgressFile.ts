/**
 * "Make a file for my coach": what changed since the last file, for the coach.
 *
 * In the file (each section only when it changed since the last file):
 *  - profile: name, gym, start date, gi / no-gi
 *  - card: belt, stripes, date awarded (competitor card)
 *  - competition: A/B/C game and tournaments marked Entered (registered), never Considering
 *  - weight: new weigh-ins, goal weight and weigh-in day, only when the student
 *    turned on "Share my weight updates with my coach" (off by default)
 *  - assessments: self-assessments added since the last file
 * Never in the file: promotion photos, any photo, the journal, move-permission
 * toggles (techniquePolicy), results, bracket notes, the gym logo, the spreadsheet.
 * Weight is never sent while the opt-in is off.
 *
 * The coach import only fills blanks. Belt and stripes are coach-owned and wait
 * for an Instructor / Coach seat (or the owner) to approve them.
 */

import type { SyncActor } from './coachSync.ts';
import { canAcceptCardShare } from './coachStudentInbox.ts';
import type { AssessmentEntry } from './studentAssessment.ts';
import type { Student, StudentDraft } from './rosterStore.ts';
import type { CompetitionGames, StudentProgressReport } from './progress/types.ts';

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export const STUDENT_COACH_UPDATE_KIND = 'student-coach-update';
export const COACH_FILE_SNAPSHOT_KEY = 'matboard.studentEdition.coachFileSnapshot.v1';
export const COACH_STUDENT_UPDATES_KEY = 'matboard.coach.studentUpdates.v1';
const TEXT_MAX = 80;
const NOTE_MAX = 400;
const UPDATES_MAX = 60;
/** Student opt-in: weight updates go in the coach file only when this is '1'. */
export const SHARE_WEIGHT_WITH_COACH_KEY = 'matboard.studentEdition.shareWeightWithCoach.v1';

export function readShareWeightWithCoach(storage: Pick<Store, 'getItem'> | null): boolean {
  try {
    return storage?.getItem(SHARE_WEIGHT_WITH_COACH_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeShareWeightWithCoach(storage: Store, on: boolean): void {
  storage.setItem(SHARE_WEIGHT_WITH_COACH_KEY, on ? '1' : '0');
}

export type CoachUpdateSection = 'profile' | 'card' | 'competition' | 'weight' | 'assessments';

export type UpdateTournament = {
  id: string;
  name: string;
  date: string;
  location: string;
  division: string;
  weightClass: string;
  targetWeight: number | null;
  targetUnit: string;
};

export type UpdateWeight = {
  unit: string;
  goalWeight: number | null;
  goalUnit: string;
  weighDate: string;
  weighIns: { id: string; date: string; weight: number; unit: string }[];
};

export type StudentCoachUpdate = {
  schemaVersion: 1;
  kind: typeof STUDENT_COACH_UPDATE_KIND;
  updateId: string;
  studentId: string;
  sentAt: number;
  /** Epoch ms of the previous file, or 0 for the first file. */
  since: number;
  profile?: { displayName: string; gymName: string; startedOn: string; trainingStyle: string };
  card?: { belt: string; stripes: number; awardedOn: string };
  competition?: {
    games: { tag: string; techniques: string; notes: string }[];
    tournaments: UpdateTournament[];
  };
  weight?: UpdateWeight;
  assessments?: { id: string; date: string; note: string; scores: Record<string, number> }[];
};

type Snapshot = { at: number; sections: Partial<Record<CoachUpdateSection, string>>; assessmentIds: string[]; weighInIds: string[] };

function clip(value: unknown, max = TEXT_MAX): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function readSnapshot(storage: Pick<Store, 'getItem'>): Snapshot {
  try {
    const raw = storage.getItem(COACH_FILE_SNAPSHOT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Snapshot>) : null;
    if (!parsed) return { at: 0, sections: {}, assessmentIds: [], weighInIds: [] };
    return {
      at: typeof parsed.at === 'number' ? parsed.at : 0,
      sections: parsed.sections && typeof parsed.sections === 'object' ? parsed.sections : {},
      assessmentIds: Array.isArray(parsed.assessmentIds) ? parsed.assessmentIds.filter((id) => typeof id === 'string') : [],
      weighInIds: Array.isArray(parsed.weighInIds) ? parsed.weighInIds.filter((id) => typeof id === 'string') : [],
    };
  } catch {
    return { at: 0, sections: {}, assessmentIds: [], weighInIds: [] };
  }
}

function games(value: CompetitionGames | undefined) {
  if (!value) return [];
  return Object.entries(value)
    .map(([tag, game]) => ({ tag, techniques: clip(game?.techniques, NOTE_MAX), notes: clip(game?.notes, NOTE_MAX) }))
    .filter((row) => row.techniques || row.notes);
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1000 ? Math.round(value * 10) / 10 : null;
}

function tournamentRow(row: Partial<UpdateTournament> & Record<string, unknown>): UpdateTournament {
  return {
    id: clip(row.id),
    name: clip(row.name),
    date: clip(row.date, 10),
    location: clip(row.location),
    division: clip(row.division),
    weightClass: clip(row.weightClass, 40),
    targetWeight: num(row.targetWeight),
    targetUnit: clip(row.targetUnit, 4),
  };
}

function sections(report: StudentProgressReport) {
  const profile = {
    displayName: clip(report.profile.displayName),
    gymName: clip(report.profile.gymName),
    startedOn: clip(report.profile.startedOn, 10),
    trainingStyle: clip(report.profile.trainingStyle ?? '', 10),
  };
  const card = {
    belt: clip(report.profile.belt, 20),
    stripes: report.rank?.tapeCount ?? 0,
    awardedOn: clip(report.rank?.awardedOn ?? '', 10),
  };
  const competition = {
    games: games(report.competition?.games),
    tournaments: (report.competition?.tournaments ?? [])
      // Entered = registered. Considering never goes to the coach.
      .filter((row) => row.status === 'entered')
      .map((row) => tournamentRow(row)),
  };
  return { profile, card, competition };
}

export type BuiltCoachUpdate = {
  update: StudentCoachUpdate;
  name: string;
  json: string;
  included: CoachUpdateSection[];
  /** Save after the file goes out, so the next file has only newer changes. */
  snapshot: Snapshot;
};

export function buildCoachUpdateFile(
  report: StudentProgressReport,
  input: {
    storage: Pick<Store, 'getItem'>;
    assessments: readonly AssessmentEntry[];
    studentId?: string;
    /** Defaults to the student's opt-in in storage. */
    shareWeight?: boolean;
    now?: number;
    today?: string;
  },
): BuiltCoachUpdate {
  const now = input.now ?? Date.now();
  const today = input.today ?? new Date(now).toISOString().slice(0, 10);
  const before = readSnapshot(input.storage);
  const parts = sections(report);
  const studentId = clip(input.studentId || report.studentId);
  const update: StudentCoachUpdate = {
    schemaVersion: 1,
    kind: STUDENT_COACH_UPDATE_KIND,
    updateId: `scu-${studentId}-${now}`.slice(0, 120),
    studentId,
    sentAt: now,
    since: before.at,
  };
  const included: CoachUpdateSection[] = [];
  const next: Snapshot = { at: now, sections: { ...before.sections }, assessmentIds: [...before.assessmentIds], weighInIds: [...before.weighInIds] };
  for (const key of ['profile', 'card', 'competition'] as const) {
    const value = parts[key];
    const text = JSON.stringify(value);
    next.sections[key] = text;
    if (before.sections[key] === text) continue;
    if (key === 'competition' && !parts.competition.games.length && !parts.competition.tournaments.length && !before.sections[key]) continue;
    (update as Record<string, unknown>)[key] = value;
    included.push(key);
  }
  const shareWeight = input.shareWeight ?? readShareWeightWithCoach(input.storage);
  const competition = report.competition;
  const allWeighIns = shareWeight ? competition?.weighIns ?? [] : [];
  if (shareWeight && competition) {
    const goal = { unit: clip(competition.weightUnit, 4), goalWeight: num(competition.goalWeight), goalUnit: clip(competition.goalUnit ?? '', 4), weighDate: clip(competition.weighDate ?? '', 10) };
    const goalText = JSON.stringify(goal);
    const newWeighIns = allWeighIns
      .filter((row) => !before.weighInIds.includes(row.id))
      .flatMap((row) => {
        const weight = num(row.weight);
        return weight === null ? [] : [{ id: clip(row.id), date: clip(row.date, 10), weight, unit: clip(row.unit, 4) }];
      })
      .slice(-60);
    const goalChanged = before.sections.weight !== goalText && Boolean(goal.goalWeight !== null || goal.weighDate || before.sections.weight);
    next.sections.weight = goalText;
    if (newWeighIns.length || goalChanged) {
      update.weight = { ...goal, weighIns: newWeighIns };
      included.push('weight');
    }
  }
  // Weigh-ins seen while the opt-in is on are not sent again.
  next.weighInIds = [...new Set([...before.weighInIds, ...allWeighIns.map((row) => row.id)])].slice(-400);
  const fresh = input.assessments.filter((entry) => !before.assessmentIds.includes(entry.id));
  if (fresh.length) {
    update.assessments = fresh.map((entry) => ({
      id: clip(entry.id),
      date: clip(entry.date, 10),
      note: clip(entry.note, NOTE_MAX),
      scores: { ...entry.scores },
    }));
    included.push('assessments');
  }
  next.assessmentIds = [...new Set([...before.assessmentIds, ...input.assessments.map((entry) => entry.id)])].slice(-400);
  const json = JSON.stringify(update);
  const safe = (report.profile.displayName || 'student').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'student';
  return { update, name: `advantage-update-for-coach-${safe}-${today}.json`, json, included, snapshot: next };
}

export function markCoachFileSent(storage: Store, built: BuiltCoachUpdate): void {
  storage.setItem(COACH_FILE_SNAPSHOT_KEY, JSON.stringify(built.snapshot));
}

/* Coach side ----------------------------------------------------------- */

export function readStudentCoachUpdate(raw: unknown): StudentCoachUpdate | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<StudentCoachUpdate>;
  if (row.kind !== STUDENT_COACH_UPDATE_KIND || row.schemaVersion !== 1) return null;
  const studentId = clip(row.studentId);
  const updateId = clip(row.updateId, 120);
  if (!studentId || !updateId) return null;
  // Rebuild field by field: anything else in the file is dropped.
  const out: StudentCoachUpdate = {
    schemaVersion: 1,
    kind: STUDENT_COACH_UPDATE_KIND,
    updateId,
    studentId,
    sentAt: typeof row.sentAt === 'number' ? row.sentAt : 0,
    since: typeof row.since === 'number' ? row.since : 0,
  };
  if (row.profile) {
    out.profile = {
      displayName: clip(row.profile.displayName),
      gymName: clip(row.profile.gymName),
      startedOn: clip(row.profile.startedOn, 10),
      trainingStyle: clip(row.profile.trainingStyle, 10),
    };
  }
  if (row.card) {
    const stripes = Number(row.card.stripes);
    out.card = {
      belt: clip(row.card.belt, 20),
      stripes: Number.isInteger(stripes) && stripes >= 0 && stripes <= 10 ? stripes : 0,
      awardedOn: clip(row.card.awardedOn, 10),
    };
  }
  if (row.competition) {
    out.competition = {
      games: (Array.isArray(row.competition.games) ? row.competition.games : []).slice(0, 6).map((game) => ({
        tag: clip(game?.tag, 4),
        techniques: clip(game?.techniques, NOTE_MAX),
        notes: clip(game?.notes, NOTE_MAX),
      })),
      tournaments: (Array.isArray(row.competition.tournaments) ? row.competition.tournaments : [])
        .slice(0, 40)
        .map((t) => tournamentRow((t ?? {}) as Partial<UpdateTournament> & Record<string, unknown>)),
    };
  }
  if (row.weight && typeof row.weight === 'object') {
    const w = row.weight;
    out.weight = {
      unit: clip(w.unit, 4),
      goalWeight: num(w.goalWeight),
      goalUnit: clip(w.goalUnit, 4),
      weighDate: clip(w.weighDate, 10),
      weighIns: (Array.isArray(w.weighIns) ? w.weighIns : []).slice(0, 60).flatMap((entry) => {
        const weight = num(entry?.weight);
        return weight === null ? [] : [{ id: clip(entry?.id), date: clip(entry?.date, 10), weight, unit: clip(entry?.unit, 4) }];
      }),
    };
  }
  if (Array.isArray(row.assessments)) {
    out.assessments = row.assessments.slice(0, 60).map((entry) => ({
      id: clip(entry?.id),
      date: clip(entry?.date, 10),
      note: clip(entry?.note, NOTE_MAX),
      scores: Object.fromEntries(
        Object.entries(entry?.scores ?? {}).filter(([, v]) => typeof v === 'number' && v >= 1 && v <= 5).slice(0, 12),
      ),
    }));
  }
  return out;
}

type Decided = { updateId: string; decision: 'applied' | 'dismissed'; at: number };
/**
 * kept: applied updates, whole. Weight and tournaments that have no field on
 * the roster card stay here, so nothing in the student's file is lost.
 */
type UpdatesState = { pending: StudentCoachUpdate[]; decided: Decided[]; kept: StudentCoachUpdate[] };
const KEPT_MAX = 200;

function readUpdates(storage: Pick<Store, 'getItem'>): UpdatesState {
  try {
    const raw = storage.getItem(COACH_STUDENT_UPDATES_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<UpdatesState>) : null;
    return {
      pending: (Array.isArray(parsed?.pending) ? parsed.pending : []).flatMap((row) => {
        const update = readStudentCoachUpdate(row);
        return update ? [update] : [];
      }),
      decided: Array.isArray(parsed?.decided) ? parsed.decided.slice(-200) : [],
      kept: (Array.isArray(parsed?.kept) ? parsed.kept : []).flatMap((row) => {
        const update = readStudentCoachUpdate(row);
        return update ? [update] : [];
      }),
    };
  } catch {
    return { pending: [], decided: [], kept: [] };
  }
}

function writeUpdates(storage: Store, state: UpdatesState): void {
  storage.setItem(COACH_STUDENT_UPDATES_KEY, JSON.stringify(state));
}

export type UpdateReceive = 'pending' | 'duplicate' | 'invalid';

export function receiveStudentCoachUpdate(storage: Store, raw: unknown): UpdateReceive {
  const update = readStudentCoachUpdate(raw);
  if (!update) return 'invalid';
  const state = readUpdates(storage);
  if (state.pending.some((row) => row.updateId === update.updateId) || state.decided.some((row) => row.updateId === update.updateId)) {
    return 'duplicate';
  }
  writeUpdates(storage, { ...state, pending: [...state.pending, update].slice(-UPDATES_MAX) });
  return 'pending';
}

/** Applied updates for one student, oldest first: tournaments and weight kept whole. */
export function keptStudentCoachUpdates(storage: Pick<Store, 'getItem'>, studentId: string): StudentCoachUpdate[] {
  return readUpdates(storage).kept.filter((row) => row.studentId === studentId);
}

/** Latest kept competition data for one student: entered tournaments and weigh-ins. */
export function studentCompetitorSummary(storage: Pick<Store, 'getItem'>, studentId: string) {
  const tournaments = new Map<string, UpdateTournament>();
  const weighIns = new Map<string, UpdateWeight['weighIns'][number]>();
  let goal: Omit<UpdateWeight, 'weighIns'> | null = null;
  for (const row of keptStudentCoachUpdates(storage, studentId)) {
    if (row.competition) {
      // Each file carries the student's whole entered list, so the latest list wins.
      tournaments.clear();
      for (const t of row.competition.tournaments) tournaments.set(t.id || `${t.name}-${t.date}`, t);
    }
    if (row.weight) {
      const { weighIns: rows, ...rest } = row.weight;
      goal = rest;
      for (const w of rows) weighIns.set(w.id || `${w.date}-${w.weight}`, w);
    }
  }
  return {
    tournaments: [...tournaments.values()].sort((a, b) => a.date.localeCompare(b.date)),
    weighIns: [...weighIns.values()].sort((a, b) => a.date.localeCompare(b.date)),
    goal,
  };
}

export function pendingStudentCoachUpdates(storage: Pick<Store, 'getItem'>): StudentCoachUpdate[] {
  return readUpdates(storage).pending;
}

/** Student-owned fields: fill blanks on the linked card only. */
export function studentUpdateFillPatch(card: Student, update: StudentCoachUpdate): Partial<StudentDraft> {
  const patch: Partial<StudentDraft> = {};
  if (update.profile) {
    if (!card.name.trim() && update.profile.displayName) patch.name = update.profile.displayName;
    if (!card.gym.trim() && update.profile.gymName) patch.gym = update.profile.gymName;
  }
  // Competitor data: a blank bout division takes the next entered tournament's division.
  if (!card.division.trim() && update.competition?.tournaments.length) {
    const sent = new Date(update.sentAt || Date.now()).toISOString().slice(0, 10);
    const rows = [...update.competition.tournaments].sort((a, b) => a.date.localeCompare(b.date));
    const next = rows.find((t) => t.date >= sent && t.division) ?? [...rows].reverse().find((t) => t.division);
    if (next) patch.division = [next.division, next.weightClass].filter(Boolean).join(' / ').slice(0, TEXT_MAX);
  }
  return patch;
}

/** Coach-owned fields. Never applied without approval. */
export function studentUpdateRankPatch(update: StudentCoachUpdate): Partial<StudentDraft> | null {
  if (!update.card?.belt) return null;
  return { belt: update.card.belt, stripes: update.card.stripes } as Partial<StudentDraft>;
}

export type UpdateRoster = {
  students: readonly Student[];
  update(id: string, draft: Partial<StudentDraft>): Student | null;
};

export type UpdateApply =
  | { ok: true; card: Student; filled: string[]; rank: 'approved' | 'not-approved' | 'none' }
  | { ok: false; reason: 'not-pending' | 'no-linked-card' | 'not-allowed' };

/**
 * Apply a student update to the card linked to that student ID.
 * Blanks fill. Belt and stripes change only with `approveRank` from a seat
 * that may accept student cards.
 */
export function applyStudentCoachUpdate(
  storage: Store,
  updateId: string,
  roster: UpdateRoster,
  options: { actor: SyncActor; approveRank: boolean; now?: number },
): UpdateApply {
  const state = readUpdates(storage);
  const update = state.pending.find((row) => row.updateId === updateId);
  if (!update) return { ok: false, reason: 'not-pending' };
  if (options.approveRank && !canAcceptCardShare(options.actor)) return { ok: false, reason: 'not-allowed' };
  const card = roster.students.find((row) => row.linkedStudentId === update.studentId && !row.guestId);
  if (!card) return { ok: false, reason: 'no-linked-card' };
  const patch: Partial<StudentDraft> = studentUpdateFillPatch(card, update);
  const rank = studentUpdateRankPatch(update);
  let rankState: 'approved' | 'not-approved' | 'none' = rank ? 'not-approved' : 'none';
  if (rank && options.approveRank) {
    Object.assign(patch, rank);
    rankState = 'approved';
  }
  const saved = Object.keys(patch).length ? roster.update(card.id, patch) ?? card : card;
  writeUpdates(storage, {
    pending: state.pending.filter((row) => row.updateId !== updateId),
    decided: [...state.decided, { updateId, decision: 'applied' as const, at: options.now ?? Date.now() }].slice(-200),
    kept: [...state.kept, update].slice(-KEPT_MAX),
  });
  return { ok: true, card: saved, filled: Object.keys(patch), rank: rankState };
}

export function dismissStudentCoachUpdate(storage: Store, updateId: string, now = Date.now()): void {
  const state = readUpdates(storage);
  writeUpdates(storage, {
    pending: state.pending.filter((row) => row.updateId !== updateId),
    decided: [...state.decided, { updateId, decision: 'dismissed' as const, at: now }].slice(-200),
    kept: state.kept,
  });
}
