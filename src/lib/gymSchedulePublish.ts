/**
 * Published gym class schedule. The /schedule editor stays the source of truth
 * in matboard.schedule.v1. When Advantage Cloud is signed in and the D1 table
 * is applied, the gym can publish that board so student phones can read it.
 * If the table is missing or Cloud is off, students fall back to a local copy
 * (this device, or the last published copy this phone already pulled).
 */
import {
  defaultGymCalendar,
  normalizeGymCalendar,
  scheduleForPublish,
  type GymCalendarState,
} from './gymCalendar.ts';

export { scheduleForPublish } from './gymCalendar.ts';
import { ENTITLEMENT_TOKEN_KEY } from './entitlement.ts';
import { ACADEMY_LICENSE_KEY, INBOX_PASS_KEY, licenseIdFromToken, readAcademyLicense, readInboxPass } from './studentInboxClient.ts';

export const PUBLISHED_SCHEDULE_CACHE_KEY = 'matboard.schedule.published.v1';
export const SCHEDULE_STORAGE_KEY = 'matboard.schedule.v1';
export const SCHEDULE_API = '/api/gym/schedule';

const SCHEDULE_JSON_MAX = 80_000;

export type PublishedScheduleResult = {
  available: boolean;
  schedule: GymCalendarState | null;
  updatedAt: number;
  source: 'published' | 'cache' | 'local' | 'none';
};

export type ScheduleAuth = {
  token?: string | null;
  inboxPass?: string | null;
};

function authHeaders(auth: ScheduleAuth = {}): Record<string, string> {
  const token = (auth.token ?? (typeof localStorage === 'undefined' ? '' : localStorage.getItem(ENTITLEMENT_TOKEN_KEY) ?? '')).trim();
  const pass = (auth.inboxPass ?? (typeof localStorage === 'undefined' ? '' : readInboxPass(localStorage))).trim();
  const bearer = token || pass;
  return bearer ? { accept: 'application/json', authorization: `Bearer ${bearer}` } : { accept: 'application/json' };
}

/** Drop logo-sized fields; keep the weekly board and dated specials. */
export function readLocalGymSchedule(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): GymCalendarState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SCHEDULE_STORAGE_KEY);
    if (!raw) return null;
    const schedule = normalizeGymCalendar(JSON.parse(raw));
    return schedule.classes.length || schedule.specials.length ? schedule : null;
  } catch {
    return null;
  }
}

export function readPublishedScheduleCache(
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): { schedule: GymCalendarState; updatedAt: number } | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PUBLISHED_SCHEDULE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { schedule?: unknown; updatedAt?: unknown };
    const schedule = normalizeGymCalendar(parsed.schedule);
    if (!schedule.classes.length && !schedule.specials.length) return null;
    const updatedAt = typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : 0;
    return { schedule, updatedAt };
  } catch {
    return null;
  }
}

export function writePublishedScheduleCache(
  storage: Pick<Storage, 'setItem'>,
  schedule: GymCalendarState,
  updatedAt: number,
): void {
  storage.setItem(PUBLISHED_SCHEDULE_CACHE_KEY, JSON.stringify({ v: 1, schedule: scheduleForPublish(schedule), updatedAt }));
}

export function resolveGymSchedule(input: {
  published?: GymCalendarState | null;
  publishedAt?: number;
  available?: boolean;
  storage?: Pick<Storage, 'getItem'> | null;
}): PublishedScheduleResult {
  const storage = input.storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : input.storage;
  if (input.available && input.published) {
    return { available: true, schedule: input.published, updatedAt: input.publishedAt ?? 0, source: 'published' };
  }
  const cache = readPublishedScheduleCache(storage);
  if (cache) return { available: Boolean(input.available), schedule: cache.schedule, updatedAt: cache.updatedAt, source: 'cache' };
  const local = readLocalGymSchedule(storage);
  if (local) return { available: false, schedule: local, updatedAt: 0, source: 'local' };
  return { available: Boolean(input.available), schedule: null, updatedAt: 0, source: 'none' };
}

export async function fetchPublishedSchedule(
  options: { fetchImpl?: typeof fetch; auth?: ScheduleAuth; storage?: Storage | null } = {},
): Promise<PublishedScheduleResult> {
  const storage = options.storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : options.storage;
  const fetchImpl = options.fetchImpl ?? (typeof fetch === 'undefined' ? undefined : fetch);
  if (!fetchImpl) return resolveGymSchedule({ storage });
  try {
    const response = await fetchImpl(`${SCHEDULE_API}?view=schedule`, { headers: authHeaders(options.auth) });
    if (response.status === 401 || response.status === 403) return resolveGymSchedule({ storage });
    const body = (await response.json()) as {
      ok?: unknown;
      available?: unknown;
      schedule?: unknown;
      updatedAt?: unknown;
    };
    const available = body.available === true && body.ok !== false;
    const schedule =
      body.schedule && typeof body.schedule === 'object' ? scheduleForPublish(normalizeGymCalendar(body.schedule)) : null;
    const updatedAt = typeof body.updatedAt === 'number' && Number.isFinite(body.updatedAt) ? body.updatedAt : 0;
    if (available && schedule && storage) writePublishedScheduleCache(storage, schedule, updatedAt);
    return resolveGymSchedule({ published: schedule, publishedAt: updatedAt, available, storage });
  } catch {
    return resolveGymSchedule({ storage });
  }
}

export async function publishGymSchedule(
  schedule: GymCalendarState,
  options: { fetchImpl?: typeof fetch; auth?: ScheduleAuth } = {},
): Promise<{ ok: boolean; available: boolean; error?: string; updatedAt?: number }> {
  const fetchImpl = options.fetchImpl ?? (typeof fetch === 'undefined' ? undefined : fetch);
  const payload = scheduleForPublish(schedule);
  const json = JSON.stringify(payload);
  if (json.length > SCHEDULE_JSON_MAX) return { ok: false, available: true, error: 'That schedule is too large to publish.' };
  if (!fetchImpl) return { ok: false, available: false, error: 'Not signed in.' };
  try {
    const response = await fetchImpl(SCHEDULE_API, {
      method: 'POST',
      headers: { ...authHeaders(options.auth), 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'publish', schedule: payload }),
    });
    const body = (await response.json()) as { ok?: unknown; available?: unknown; error?: unknown; updatedAt?: unknown };
    if (body.available === false) return { ok: false, available: false, error: 'The schedule table is not on this database yet.' };
    if (!response.ok || body.ok !== true) {
      return { ok: false, available: true, error: typeof body.error === 'string' ? body.error : 'Could not publish the schedule.' };
    }
    return { ok: true, available: true, updatedAt: typeof body.updatedAt === 'number' ? body.updatedAt : Date.now() };
  } catch {
    return { ok: false, available: false, error: 'Could not reach Advantage Cloud.' };
  }
}

export function academyLicenseHint(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): string {
  if (!storage) return '';
  const fromAcademy = readAcademyLicense(storage);
  if (fromAcademy) return fromAcademy;
  try {
    const token = storage.getItem(ENTITLEMENT_TOKEN_KEY)?.trim() ?? '';
    return token ? licenseIdFromToken(token) ?? '' : '';
  } catch {
    return '';
  }
}

export { ACADEMY_LICENSE_KEY, INBOX_PASS_KEY };

export function emptyPublishedSchedule(): GymCalendarState {
  return { ...defaultGymCalendar(), title: '' };
}
