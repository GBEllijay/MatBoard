/**
 * "Send to my instructor" on the student phone, and "Assessments waiting" on the coach phone.
 * Server: src/server/instructorAssessments.ts (POST /api/gym/assessments). In-app only, no push.
 *
 * Student phone keys (per Student Edition profile, through the profile scope):
 *   matboard.studentEdition.coachVia.v1          the signed coach connect code she scanned, and who showed it
 *   matboard.studentEdition.assessmentSends.v1   which saved check-ins went to an instructor
 * Coach phone keys:
 *   matboard.coach.assessmentsWaiting.v1         last list from Advantage Cloud (badge + list)
 *   matboard.coach.receivedSelfAssessments.v1    student self scores received over Cloud, by Student Edition id.
 *                                                Coach device only. Never in roster backups or master.json.
 */

import { readCloudBearer } from './advantageCloudMedia.ts';
import { keptStudentCoachUpdates } from './coachProgressFile.ts';
import {
  ASSESSMENT_FACE_IDS,
  ASSESSMENT_NOTE_MAX,
  ASSESSMENT_SUBMISSION_KIND,
  readAssessmentSubmission,
  readInstructorAssessmentItem,
  type AssessmentSubmission,
  type InstructorAssessmentItem,
} from './instructorAssessments.ts';
import { isInstructorId } from './instructorIdentity.ts';
import type { AssessmentEntry, AssessmentScores } from './studentAssessment.ts';
import { inboxPassLicense, readAcademyLicense, readInboxPass, studentIdFromInboxPass } from './studentInboxClient.ts';

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export const COACH_VIA_KEY = 'matboard.studentEdition.coachVia.v1';
export const ASSESSMENT_SENDS_KEY = 'matboard.studentEdition.assessmentSends.v1';
export const ASSESSMENTS_WAITING_KEY = 'matboard.coach.assessmentsWaiting.v1';
export const RECEIVED_SELF_KEY = 'matboard.coach.receivedSelfAssessments.v1';
export const ASSESSMENTS_WAITING_EVENT = 'matboard-assessments-waiting';
export const SEND_TO_INSTRUCTOR_LABEL = 'Send to my instructor';
const LICENSE_RE = /^[A-Za-z0-9_-]{8,80}$/;
const SIGNED_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const RECEIVED_PER_STUDENT = 20;

function readJson<T>(storage: Pick<Store, 'getItem'>, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: Store, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full; the next pull tries again */
  }
}

function announce(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(ASSESSMENTS_WAITING_EVENT));
  }
}

/* ------------------------------- student: via ------------------------------- */

export type CoachVia = { gym: string; gymName: string; viaInstructorId: string | null; proof: string; savedAt: number };

/** Keep the scanned code. The server reads who showed it from the signature, not from this copy. */
export function saveCoachVia(storage: Store, input: Omit<CoachVia, 'savedAt'>, now = Date.now()): CoachVia | null {
  if (!LICENSE_RE.test(input.gym) || !SIGNED_RE.test(input.proof) || input.proof.length > 4000) return null;
  const row: CoachVia = {
    gym: input.gym,
    gymName: input.gymName.slice(0, 80),
    viaInstructorId: isInstructorId(input.viaInstructorId) ? input.viaInstructorId : null,
    proof: input.proof,
    savedAt: now,
  };
  writeJson(storage, COACH_VIA_KEY, row);
  return row;
}

/** The saved code for this gym, or null. A code from another gym is ignored. */
export function readCoachVia(storage: Pick<Store, 'getItem'>, license?: string): CoachVia | null {
  const row = readJson<Partial<CoachVia>>(storage, COACH_VIA_KEY);
  if (!row || typeof row.gym !== 'string' || !LICENSE_RE.test(row.gym)) return null;
  if (typeof row.proof !== 'string' || !SIGNED_RE.test(row.proof)) return null;
  if (license && row.gym !== license) return null;
  return {
    gym: row.gym,
    gymName: typeof row.gymName === 'string' ? row.gymName : '',
    viaInstructorId: isInstructorId(row.viaInstructorId) ? row.viaInstructorId : null,
    proof: row.proof,
    savedAt: typeof row.savedAt === 'number' ? row.savedAt : 0,
  };
}

/* ---------------------------- student: submission ---------------------------- */

export function buildAssessmentSubmission(input: {
  entry: Pick<AssessmentEntry, 'id' | 'date' | 'note' | 'scores'>;
  studentId: string;
  profileId: string;
  studentName?: string;
  via?: CoachVia | null;
  now?: number;
}): AssessmentSubmission | null {
  const now = input.now ?? Date.now();
  const scores: Record<string, number> = {};
  for (const id of ASSESSMENT_FACE_IDS) {
    const value = (input.entry.scores as Partial<Record<string, unknown>>)[id];
    if (typeof value === 'number') scores[id] = value;
  }
  const submissionId = `${input.entry.id}-${now.toString(36)}`.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80);
  const draft: Record<string, unknown> = {
    kind: ASSESSMENT_SUBMISSION_KIND,
    v: 1,
    submissionId,
    studentId: input.studentId,
    profileId: input.profileId,
    date: input.entry.date,
    note: (input.entry.note ?? '').trim().slice(0, ASSESSMENT_NOTE_MAX),
    scores,
    sentAt: now,
  };
  if (input.studentName?.trim()) draft.studentName = input.studentName.trim().slice(0, 80);
  if (input.via) {
    draft.via = input.via.proof;
    if (input.via.viaInstructorId) draft.assignedInstructorId = input.via.viaInstructorId;
  }
  return readAssessmentSubmission(draft);
}

export type InstructorSend =
  | { ok: true; id: string; instructorId: string; status: string; duplicate: boolean }
  | { ok: false; reason: 'no-pass' | 'unbound' | 'denied' | 'busy' | 'refused' | 'offline' | 'invalid'; error: string };

export const SEND_COPY: Record<Exclude<InstructorSend, { ok: true }>['reason'], string> = {
  'no-pass': 'Connect to your academy on Advantage Cloud first. Your coach can also use Make a file for my coach.',
  unbound: 'Advantage Cloud is not on this site. Use Make a file for my coach instead.',
  denied: 'Your academy pass on this phone is not accepted. Ask your coach to reconnect you.',
  busy: 'Your instructor already has your last ones waiting, or you just sent one. Try again later.',
  refused: 'Advantage Cloud did not take that check-in.',
  offline: 'Could not reach Advantage Cloud. Nothing was sent.',
  invalid: 'Save this check-in first, with at least one rating.',
};

function fail(reason: Exclude<InstructorSend, { ok: true }>['reason'], error?: string): InstructorSend {
  return { ok: false, reason, error: error || SEND_COPY[reason] };
}

export type AssessmentSendRecord = { id: string; instructorId: string; sentAt: number; date: string };

export function readAssessmentSends(storage: Pick<Store, 'getItem'>): Record<string, AssessmentSendRecord> {
  const row = readJson<Record<string, AssessmentSendRecord>>(storage, ASSESSMENT_SENDS_KEY);
  return row && typeof row === 'object' && !Array.isArray(row) ? row : {};
}

/** Send one saved check-in. The student's own entry is never changed. */
export async function sendAssessmentToInstructor(
  storage: Store,
  input: { entry: Pick<AssessmentEntry, 'id' | 'date' | 'note' | 'scores'>; profileId: string; studentName?: string },
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<InstructorSend> {
  const pass = readInboxPass(storage);
  const license = (pass && inboxPassLicense(pass)) || '';
  const studentId = (pass && studentIdFromInboxPass(pass)) || '';
  if (!pass || !license || !studentId) return fail('no-pass');
  if (readAcademyLicense(storage) && readAcademyLicense(storage) !== license) return fail('denied');
  const submission = buildAssessmentSubmission({
    entry: input.entry,
    studentId,
    profileId: input.profileId,
    studentName: input.studentName,
    via: readCoachVia(storage, license),
    now,
  });
  if (!submission) return fail('invalid');
  try {
    const response = await fetchImpl('/api/gym/assessments', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${pass}` },
      body: JSON.stringify({ action: 'submit', license, studentId, submission }),
    });
    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    const error = typeof body.error === 'string' ? body.error : '';
    if (response.status === 503) return fail('unbound');
    if (response.status === 403) return fail('denied', error);
    if (response.status === 429) return fail('busy', error);
    if (!response.ok || body.ok !== true || typeof body.id !== 'string') return fail('refused', error);
    const instructorId = typeof body.instructorId === 'string' ? body.instructorId : '';
    const sends = readAssessmentSends(storage);
    sends[input.entry.id] = { id: body.id, instructorId, sentAt: now, date: input.entry.date };
    writeJson(storage, ASSESSMENT_SENDS_KEY, sends);
    return { ok: true, id: body.id, instructorId, status: typeof body.status === 'string' ? body.status : 'pending', duplicate: body.duplicate === true };
  } catch {
    return fail('offline');
  }
}

/* ------------------------------ coach: waiting ------------------------------ */

export type WaitingState = { items: InstructorAssessmentItem[]; owner: boolean; instructorId: string; checkedAt: number };

export function readAssessmentsWaiting(storage: Pick<Store, 'getItem'> | null): WaitingState {
  const row = storage ? readJson<Partial<WaitingState>>(storage, ASSESSMENTS_WAITING_KEY) : null;
  const items = Array.isArray(row?.items) ? row!.items.flatMap((item) => readInstructorAssessmentItem(item) ?? []) : [];
  return {
    items,
    owner: row?.owner === true,
    instructorId: typeof row?.instructorId === 'string' ? row.instructorId : '',
    checkedAt: typeof row?.checkedAt === 'number' ? row.checkedAt : 0,
  };
}

/** Badge count: items still waiting for this instructor (pending or seen). */
export function assessmentsWaitingCount(storage: Pick<Store, 'getItem'> | null): number {
  return readAssessmentsWaiting(storage).items.filter((item) => item.status !== 'responded').length;
}

/** Keep received self scores on this coach device, by Student Edition id. */
export function keepReceivedSelfScores(storage: Store, items: readonly InstructorAssessmentItem[]): void {
  const kept = readJson<Record<string, AssessmentEntry[]>>(storage, RECEIVED_SELF_KEY) ?? {};
  for (const item of items) {
    const { studentId, submissionId, date, note, scores } = item.submission;
    const list = Array.isArray(kept[studentId]) ? kept[studentId] : [];
    const id = `cloud-${submissionId}`;
    if (list.some((row) => row.id === id)) continue;
    kept[studentId] = [...list, { id, date, note, scores: scores as AssessmentScores }]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-RECEIVED_PER_STUDENT);
  }
  writeJson(storage, RECEIVED_SELF_KEY, kept);
}

/**
 * Self view on the coach's student card: self-assessments from kept student files
 * ("Make a file for my coach") plus those received over Advantage Cloud. Oldest first.
 */
export function selfAssessmentsForStudent(storage: Pick<Store, 'getItem'> | null, linkedStudentId: string | undefined): AssessmentEntry[] {
  if (!storage || !linkedStudentId) return [];
  const rows: AssessmentEntry[] = [];
  const seen = new Set<string>();
  for (const update of keptStudentCoachUpdates(storage, linkedStudentId)) {
    for (const entry of update.assessments ?? []) {
      const id = `file-${entry.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push({ id, date: entry.date, note: entry.note ?? '', scores: entry.scores as unknown as AssessmentScores });
    }
  }
  const cloud = readJson<Record<string, AssessmentEntry[]>>(storage, RECEIVED_SELF_KEY)?.[linkedStudentId];
  for (const entry of Array.isArray(cloud) ? cloud : []) {
    if (!entry || typeof entry.id !== 'string' || seen.has(entry.id) || typeof entry.date !== 'string') continue;
    seen.add(entry.id);
    rows.push({ id: entry.id, date: entry.date, note: typeof entry.note === 'string' ? entry.note : '', scores: entry.scores ?? ({} as AssessmentScores) });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

async function coachPost(
  payload: Record<string, unknown>,
  options: { fetchImpl?: typeof fetch; token?: string | null },
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const token = options.token ?? readCloudBearer();
  if (!token) return { ok: false, status: 0, error: 'Restore access on this device first.' };
  try {
    const response = await (options.fetchImpl ?? fetch)('/api/gym/assessments', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    if (!response.ok || body.ok !== true) {
      return { ok: false, status: response.status, error: typeof body.error === 'string' ? body.error : 'Advantage Cloud did not answer.' };
    }
    return { ok: true, body };
  } catch {
    return { ok: false, status: 0, error: 'Could not reach Advantage Cloud.' };
  }
}

/** Pull this instructor's waiting assessments (the owner sees every instructor's). */
export async function refreshAssessmentsWaiting(
  options: { storage?: Store | null; fetchImpl?: typeof fetch; token?: string | null; now?: number } = {},
): Promise<{ ok: true; waiting: number } | { ok: false; error: string }> {
  const storage = options.storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : options.storage;
  const result = await coachPost({ action: 'list' }, options);
  if (!result.ok) return { ok: false, error: result.error };
  const items = Array.isArray(result.body.items) ? result.body.items.flatMap((item) => readInstructorAssessmentItem(item) ?? []) : [];
  if (storage) {
    const state: WaitingState = {
      items,
      owner: result.body.owner === true,
      instructorId: typeof result.body.instructorId === 'string' ? result.body.instructorId : '',
      checkedAt: options.now ?? Date.now(),
    };
    writeJson(storage, ASSESSMENTS_WAITING_KEY, state);
    keepReceivedSelfScores(storage, items);
    announce();
  }
  return { ok: true, waiting: items.filter((item) => item.status !== 'responded').length };
}

/** Mark one item seen, or responded with the Coach Sync update id. */
export async function markAssessment(
  id: string,
  status: 'seen' | 'responded',
  options: { responseId?: string; storage?: Store | null; fetchImpl?: typeof fetch; token?: string | null } = {},
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const result = await coachPost({ action: 'mark', id, status, ...(options.responseId ? { responseId: options.responseId } : {}) }, options);
  if (!result.ok) return { ok: false, error: result.error };
  const next = typeof result.body.status === 'string' ? result.body.status : status;
  const storage = options.storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : options.storage;
  if (storage) {
    const state = readAssessmentsWaiting(storage);
    state.items = state.items.map((item) =>
      item.id === id ? { ...item, status: next as InstructorAssessmentItem['status'], ...(options.responseId ? { responseId: options.responseId } : {}) } : item,
    );
    writeJson(storage, ASSESSMENTS_WAITING_KEY, state);
    announce();
  }
  return { ok: true, status: next };
}

/** Reply form prefill: the student's own day, scores, and note. The coach changes what they disagree with. */
export function replyPrefill(item: InstructorAssessmentItem): { date: string; scores: Record<string, number>; note: string } {
  return { date: item.submission.date, scores: { ...item.submission.scores } as Record<string, number>, note: '' };
}

export function subscribeAssessmentsWaiting(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(ASSESSMENTS_WAITING_EVENT, fn);
  return () => window.removeEventListener(ASSESSMENTS_WAITING_EVENT, fn);
}
