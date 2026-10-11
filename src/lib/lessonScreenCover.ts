import { ADVANTAGE_MARK_SRC } from './gymLogo.ts';

/**
 * What a mirrored gym TV shows while a coach hides the Daily Lesson Plan.
 * Stored on this device only. It does not touch saved lesson plans.
 *
 * Phone-to-TV class casting in this app is screen mirroring (the TV shows
 * the phone). Match scoreboards have a separate Presentation API receiver,
 * and the Media Console slideshow can include the class schedule, but neither
 * is a second screen for this page. The cover therefore fills the phone.
 */
export const LESSON_SCREEN_COVER_KEY = 'matboard.lessonScreenCover.v1';

export const LESSON_COVER_MODES = ['logo', 'schedule', 'black'] as const;
export type LessonCoverMode = (typeof LESSON_COVER_MODES)[number];

export const LESSON_COVER_LABELS: Record<LessonCoverMode, string> = {
  logo: 'Logo',
  schedule: 'Schedule',
  black: 'Black',
};

export const DEFAULT_LESSON_COVER_MODE: LessonCoverMode = 'logo';

type LessonCoverRecord = {
  version: 1;
  mode: LessonCoverMode;
};

export function isLessonCoverMode(value: unknown): value is LessonCoverMode {
  return typeof value === 'string' && (LESSON_COVER_MODES as readonly string[]).includes(value);
}

function readRecord(): LessonCoverRecord | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LESSON_SCREEN_COVER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LessonCoverRecord>;
    if (parsed.version !== 1 || !isLessonCoverMode(parsed.mode)) return null;
    return { version: 1, mode: parsed.mode };
  } catch {
    return null;
  }
}

/** Last cover the coach picked. Logo until they choose something else. */
export function readLessonCoverMode(): LessonCoverMode {
  return readRecord()?.mode ?? DEFAULT_LESSON_COVER_MODE;
}

export function writeLessonCoverMode(mode: LessonCoverMode): void {
  if (!isLessonCoverMode(mode)) return;
  const record: LessonCoverRecord = { version: 1, mode };
  try {
    localStorage.setItem(LESSON_SCREEN_COVER_KEY, JSON.stringify(record));
  } catch {
    /* private mode / quota — the in-memory choice still applies this visit */
  }
}

/**
 * Logo cover. A gym logo already saved on this device wins.
 * Otherwise the Advantage mark. The schedule board's own picture is not used.
 */
export function lessonCoverLogoSrc(gymLogo: string | null | undefined): string {
  const gym = gymLogo?.trim() ?? '';
  if (gym.startsWith('data:image/')) return gym;
  return ADVANTAGE_MARK_SRC;
}

/**
 * Same board the Media Console cast uses: Month when that template is saved,
 * otherwise the week board (including List, which the TV does not cast).
 */
export function lessonCoverScheduleKind(template: string | null | undefined): 'week' | 'month' {
  return template === 'monthly' ? 'month' : 'week';
}
