/**
 * Coach connect QR (Advantage Cloud, no Drive folder).
 *
 * One academy-wide code per gym: every instructor scans the same QR. It is
 * reusable. The owner can rotate it, and the old QR then stops working.
 * It never uses or grants an instructor seat.
 *
 * Owner: issueCoachConnect asks the server for the gym's signed link and the
 * panel shows it as a QR next to the instructor seat invites.
 * Instructor: Connect to my academy reads ?coach=…, acceptCoachConnect checks
 * it with the server, and joinCloudAcademy saves the gym's license id so her
 * card shares go to the owner's Advantage Cloud inbox.
 * The code says who showed it (`via`, signed by the server). The phone keeps the
 * signed code (saveCoachVia) so a card share and Send to my instructor reach
 * that instructor.
 */
import { joinCloudAcademy, type AcademyMembership } from './academyMembership.ts';
import { readStoredEntitlementToken } from './studentInboxClient.ts';
import { saveCoachVia } from './instructorAssessmentClient.ts';

export const COACH_CONNECT_PARAM = 'coach';
export const COACH_CONNECT_LINK_KEY = 'matboard.coachConnect.link.v1';
const SIGNED_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem?(key: string): void };

/** The link an instructor opens or scans. Lands on Connect to my academy. */
export function coachConnectUrl(invite: string, origin: string): string {
  const root = origin.trim().replace(/\/$/, '');
  return `${root}/student/connections?${COACH_CONNECT_PARAM}=${encodeURIComponent(invite)}`;
}

/** A coach connect link, or the signed token on its own. Academy folder links return null. */
export function parseCoachConnectInput(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  try {
    const url = new URL(text, 'https://advantage.local');
    const token = url.searchParams.get(COACH_CONNECT_PARAM);
    if (token && SIGNED_RE.test(token)) return token;
  } catch {
    /* a bare token still gets a chance */
  }
  return SIGNED_RE.test(text) ? text : null;
}

export type SavedCoachConnect = { link: string; gymName: string; savedAt: number };

export function readSavedCoachConnect(storage: Pick<Store, 'getItem'>): SavedCoachConnect | null {
  try {
    const raw = storage.getItem(COACH_CONNECT_LINK_KEY);
    if (!raw) return null;
    const row = JSON.parse(raw) as Partial<SavedCoachConnect>;
    if (typeof row.link !== 'string' || !parseCoachConnectInput(row.link)) return null;
    return {
      link: row.link,
      gymName: typeof row.gymName === 'string' ? row.gymName : '',
      savedAt: typeof row.savedAt === 'number' ? row.savedAt : 0,
    };
  } catch {
    return null;
  }
}

async function postJson(
  body: Record<string, unknown>,
  fetchImpl: typeof fetch,
  token?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetchImpl('/api/gym/coach-connect', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  let parsed: Record<string, unknown> = {};
  try {
    parsed = (await response.json()) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  return { status: response.status, body: parsed };
}

/**
 * Owner: get the gym's one coach connect link and keep it on this device.
 * `rotate: true` makes a new code and the old QR stops working.
 */
export async function issueCoachConnect(
  input: { gymName: string; origin: string; rotate?: boolean },
  options: { fetchImpl?: typeof fetch; storage?: Store; token?: string } = {},
): Promise<{ ok: true; saved: SavedCoachConnect } | { ok: false; error: string }> {
  const storage = options.storage ?? localStorage;
  const token = options.token ?? readStoredEntitlementToken(storage);
  if (!token) return { ok: false, error: 'Restore access on this device first.' };
  try {
    const { status, body } = await postJson({ action: input.rotate ? 'rotate' : 'issue', gymName: input.gymName }, options.fetchImpl ?? fetch, token);
    if (status >= 400 || body.ok !== true || typeof body.invite !== 'string') {
      return { ok: false, error: typeof body.error === 'string' ? body.error : 'Could not make the coach connect QR.' };
    }
    const saved: SavedCoachConnect = {
      link: coachConnectUrl(body.invite, input.origin),
      gymName: typeof body.gymName === 'string' ? body.gymName : input.gymName,
      savedAt: Date.now(),
    };
    try {
      storage.setItem(COACH_CONNECT_LINK_KEY, JSON.stringify(saved));
    } catch {
      /* the QR still shows this time */
    }
    return { ok: true, saved };
  } catch {
    return { ok: false, error: 'Could not reach Advantage Cloud. Nothing changed.' };
  }
}

/** Instructor: check the link with the server, then join that academy on Advantage Cloud. */
export async function acceptCoachConnect(
  invite: string,
  options: { fetchImpl?: typeof fetch; storage?: Store } = {},
): Promise<
  { ok: true; gym: string; gymName: string; membership: AcademyMembership; viaInstructorId: string | null } | { ok: false; error: string }
> {
  const storage = options.storage ?? localStorage;
  try {
    const { status, body } = await postJson({ action: 'accept', invite }, options.fetchImpl ?? fetch);
    if (status >= 400 || body.ok !== true || typeof body.gym !== 'string') {
      return { ok: false, error: typeof body.error === 'string' ? body.error : 'This coach connect link is not valid.' };
    }
    const gymName = typeof body.gymName === 'string' ? body.gymName : '';
    const membership = joinCloudAcademy(storage as Parameters<typeof joinCloudAcademy>[0], { license: body.gym, gymName });
    if (!membership) return { ok: false, error: 'This coach connect link is not valid.' };
    // Who showed the code. The signed code is kept as proof for card shares and Send to my instructor.
    const viaInstructorId = typeof body.viaInstructorId === 'string' ? body.viaInstructorId : null;
    saveCoachVia(storage, { gym: body.gym, gymName, viaInstructorId, proof: invite });
    return { ok: true, gym: body.gym, gymName, membership, viaInstructorId };
  } catch {
    return { ok: false, error: 'Could not reach Advantage Cloud. Try again when you are online.' };
  }
}

export type CurrentCoachConnect =
  | { ok: true; saved: SavedCoachConnect }
  | { ok: false; reason: 'none' | 'no-cloud' | 'signed-out' | 'error'; error: string };

/**
 * Instructor Edition: the academy's current coach connect link, read only.
 * A seat never makes or replaces it. 'none' means the owner has not shown it yet.
 */
export async function fetchCurrentCoachConnect(
  input: { origin: string },
  options: { fetchImpl?: typeof fetch; storage?: Pick<Store, 'getItem'>; token?: string } = {},
): Promise<CurrentCoachConnect> {
  const token = options.token ?? readStoredEntitlementToken(options.storage ?? localStorage);
  if (!token) return { ok: false, reason: 'signed-out', error: 'Restore access on this device first.' };
  try {
    const { status, body } = await postJson({ action: 'current' }, options.fetchImpl ?? fetch, token);
    if (status === 200 && body.ok === true && typeof body.invite === 'string') {
      return {
        ok: true,
        saved: {
          link: coachConnectUrl(body.invite, input.origin),
          gymName: typeof body.gymName === 'string' ? body.gymName : '',
          savedAt: Date.now(),
        },
      };
    }
    const error = typeof body.error === 'string' ? body.error : 'Could not load the coach connect QR.';
    if (body.reason === 'none') return { ok: false, reason: 'none', error };
    if (body.reason === 'no-cloud' || status === 403) return { ok: false, reason: 'no-cloud', error };
    return { ok: false, reason: 'error', error };
  } catch {
    return { ok: false, reason: 'error', error: 'Could not reach Advantage Cloud.' };
  }
}
