/**
 * Daily Training Videos slot plan for one calendar day.
 * Clip bytes stay in the technique clip store. This record is ids and names only.
 * Advantage does not host the files.
 */

import { sanitizeVideoPlan, type VideoPlan } from './techniqueLogic.ts';
import { isWithinRetention, localDateKey } from './trainingNotesStore.ts';

export const TECHNIQUE_PLAN_DATES_KEY = 'matboard.techniquePlanDates.v1';

type DateStore = { version: 1; days: Record<string, unknown> };

function emptyStore(): DateStore {
  return { version: 1, days: {} };
}

export function readTechniquePlanDateStore(raw: string | null): DateStore {
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw) as Partial<DateStore>;
    if (!parsed || parsed.version !== 1 || !parsed.days || typeof parsed.days !== 'object') return emptyStore();
    return { version: 1, days: parsed.days };
  } catch {
    return emptyStore();
  }
}

export function techniquePlanForDate(
  store: DateStore,
  dateKey: string,
  knownClipIds: readonly string[],
): VideoPlan | null {
  if (!store.days[dateKey]) return null;
  return sanitizeVideoPlan(store.days[dateKey], knownClipIds).plan;
}

/** Keep plans inside the lesson retention window and write this day's snapshot. */
export function rememberTechniquePlanDate(
  store: DateStore,
  dateKey: string,
  plan: VideoPlan,
  todayKey: string,
): DateStore {
  const days: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(store.days)) {
    if (isWithinRetention(key, todayKey)) days[key] = value;
  }
  if (isWithinRetention(dateKey, todayKey)) days[dateKey] = plan;
  return { version: 1, days };
}

/** Clip ids saved on any day except `exceptDate`, so today's board does not steal them. */
export function clipIdsOnOtherPlanDates(store: DateStore, exceptDate: string): string[] {
  const ids: string[] = [];
  for (const [dateKey, raw] of Object.entries(store.days)) {
    if (dateKey === exceptDate || !raw || typeof raw !== 'object') continue;
    const slots = (raw as { slots?: unknown }).slots;
    if (!Array.isArray(slots)) continue;
    for (const slot of slots) {
      if (!slot || typeof slot !== 'object') continue;
      const clipId = (slot as { clipId?: unknown }).clipId;
      if (typeof clipId === 'string' && clipId) ids.push(clipId);
    }
  }
  return ids;
}

function loadStore(): DateStore {
  if (typeof localStorage === 'undefined') return emptyStore();
  try {
    return readTechniquePlanDateStore(localStorage.getItem(TECHNIQUE_PLAN_DATES_KEY));
  } catch {
    return emptyStore();
  }
}

function writeStore(store: DateStore): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(TECHNIQUE_PLAN_DATES_KEY, JSON.stringify(store));
  } catch {
    /* The clip bytes are already on this device. */
  }
}

export function saveTechniquePlanOnDate(dateKey: string, plan: VideoPlan, todayKey = localDateKey()): void {
  writeStore(rememberTechniquePlanDate(loadStore(), dateKey, plan, todayKey));
}

export function storedTechniquePlan(dateKey: string, knownClipIds: readonly string[]): VideoPlan | null {
  return techniquePlanForDate(loadStore(), dateKey, knownClipIds);
}

export function otherDateClipIds(exceptDate = localDateKey()): string[] {
  return clipIdsOnOtherPlanDates(loadStore(), exceptDate);
}
