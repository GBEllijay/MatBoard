/**
 * One gym folder tree per license.
 * The same relative paths are the layout for Advantage Cloud, Google Drive,
 * OneDrive, and a PC folder. Google Photos albums are not part of this tree.
 *
 * The button sets the purpose. The file type does not pick the folder.
 * A gallery photo or short video never lands under videos/.
 */

export const GYM_TREE_ROOT = 'advantage-gym';

export const GALLERY_LANES = ['pending', 'approved', 'rejected'] as const;
export type GalleryLane = (typeof GALLERY_LANES)[number];

export const GYM_PURPOSES = [
  'gallery',
  'daily-video',
  'lesson',
  'student-file',
  'student-assessment',
  'instructor-assessment',
  'instructor-pointer',
  'events',
  'pro-shop',
  'handoff-invite',
  'handoff-review',
  'technique-tree',
  'roster',
  'student-photo',
] as const;
export type GymPurpose = (typeof GYM_PURPOSES)[number];

export type GymMediaKind = 'photo' | 'video' | 'json' | 'file';

/** Who is holding the control. A student is never a gallery uploader. */
export type GymActor = 'owner' | 'instructor' | 'program-director' | 'coach' | 'assistant' | 'student' | 'none';

export type GymRouteRefusal =
  | 'missing-purpose'
  | 'students-no-gallery'
  | 'students-no-daily-video'
  | 'role-hidden'
  | 'bad-date'
  | 'missing-student-code';

export type GymRoute =
  | {
      ok: true;
      purpose: GymPurpose;
      path: string;
      fileName: string;
      lane: GalleryLane | null;
      kind: GymMediaKind;
    }
  | { ok: false; reason: GymRouteRefusal };

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Local Media Console folder id to the tree folder. `shop` is `pro-shop`. */
export function treeFolderForConsole(folderId: 'gallery' | 'shop' | 'events'): string {
  if (folderId === 'shop') return 'pro-shop';
  if (folderId === 'events') return 'events';
  return 'gallery/approved';
}

export function isGymPurpose(value: unknown): value is GymPurpose {
  return typeof value === 'string' && (GYM_PURPOSES as readonly string[]).includes(value);
}

export function safePathSegment(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/^\.+/, '')
    .slice(0, 80);
  return cleaned || fallback;
}

export function isCalendarDateKey(value: string): boolean {
  if (!DATE_KEY.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * ISO week, Monday start. `2026-09-28` (a Monday) is `2026-W40`.
 * The week id uses the Thursday rule so a week that crosses New Year stays one id.
 */
export function lessonWeekId(dateKey: string): string | null {
  if (!isCalendarDateKey(dateKey)) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** Current-week folder names that are no longer this week. Archive those. */
export function weeksReadyToArchive(folderNames: readonly string[], todayKey: string): string[] {
  const current = lessonWeekId(todayKey);
  if (!current) return [];
  return folderNames.filter((name) => /^(\d{4})-W(\d{2})$/.test(name) && name !== current);
}

export function archiveWeekPath(weekId: string): string | null {
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  return `lessons/archive/${match[1]}/${weekId}`;
}

/**
 * Photos and videos attached to a lesson plan.
 * The plan text stays `lessons/current/{week}/{date}.json`.
 * These files sit beside that plan, under the same week.
 */
export function lessonMediaPath(dateKey: string, fileName: string): string | null {
  const week = lessonWeekId(dateKey);
  if (!week) return null;
  const base = fileName.split(/[/\\]/).pop() ?? '';
  const name = safePathSegment(base, 'lesson-media');
  return `lessons/current/${week}/media/${dateKey}/${name}`;
}

function fileNameOf(value: string, fallback: string): string {
  const base = value.split(/[/\\]/).pop() ?? '';
  return safePathSegment(base, fallback);
}

/**
 * Decide the relative path. A missing purpose stays on the phone.
 * Gallery videos stay in gallery/. They do not fall through to videos/daily.
 */
export function routeUpload(input: {
  purpose: GymPurpose | '' | null | undefined;
  role: GymActor;
  kind: GymMediaKind;
  dateKey: string;
  fileName: string;
  approvalRequired?: boolean;
  studentCode?: string;
  seatId?: string;
}): GymRoute {
  if (!input.purpose || !isGymPurpose(input.purpose)) return { ok: false, reason: 'missing-purpose' };
  if (!isCalendarDateKey(input.dateKey) && input.purpose !== 'events' && input.purpose !== 'pro-shop' && input.purpose !== 'handoff-invite' && input.purpose !== 'handoff-review' && input.purpose !== 'technique-tree' && input.purpose !== 'roster') {
    return { ok: false, reason: 'bad-date' };
  }
  const purpose = input.purpose;
  if (purpose === 'gallery' && input.role === 'student') return { ok: false, reason: 'students-no-gallery' };
  if (purpose === 'gallery' && input.role === 'none') return { ok: false, reason: 'role-hidden' };
  // A program director may drop a video in the day's daily videos for instructors. Lesson plans stay closed.
  if (purpose === 'daily-video' && (input.role === 'student' || input.role === 'none')) {
    return { ok: false, reason: input.role === 'student' ? 'students-no-daily-video' : 'role-hidden' };
  }
  if (purpose === 'lesson' && (input.role === 'student' || input.role === 'program-director' || input.role === 'none')) {
    return { ok: false, reason: 'role-hidden' };
  }
  if ((purpose === 'student-file' || purpose === 'student-assessment') && input.role !== 'student') {
    return { ok: false, reason: 'role-hidden' };
  }

  if (purpose === 'gallery') {
    const lane: GalleryLane = input.approvalRequired ? 'pending' : 'approved';
    const fileName = fileNameOf(input.fileName, input.kind === 'video' ? 'class-clip' : 'class-photo');
    return {
      ok: true,
      purpose,
      lane,
      kind: input.kind,
      fileName,
      path: `gallery/${lane}/${input.dateKey}/${fileName}`,
    };
  }

  if (purpose === 'daily-video') {
    const fileName = fileNameOf(input.fileName, 'training-video');
    return {
      ok: true,
      purpose,
      lane: null,
      kind: input.kind,
      fileName,
      path: `videos/daily/${input.dateKey}/${fileName}`,
    };
  }

  if (purpose === 'lesson') {
    const week = lessonWeekId(input.dateKey);
    if (!week) return { ok: false, reason: 'bad-date' };
    return {
      ok: true,
      purpose,
      lane: null,
      kind: 'json',
      fileName: `${input.dateKey}.json`,
      path: `lessons/current/${week}/${input.dateKey}.json`,
    };
  }

  if (purpose === 'student-file' || purpose === 'student-assessment') {
    const code = safePathSegment(input.studentCode ?? '', '');
    if (!code) return { ok: false, reason: 'missing-student-code' };
    if (purpose === 'student-assessment') {
      return {
        ok: true,
        purpose,
        lane: null,
        kind: 'json',
        fileName: `${input.dateKey}.json`,
        path: `students/${code}/assessments/${input.dateKey}.json`,
      };
    }
    const fileName = fileNameOf(input.fileName, 'student-file');
    return {
      ok: true,
      purpose,
      lane: null,
      kind: input.kind,
      fileName,
      path: `students/${code}/inbox/${input.dateKey}/${fileName}`,
    };
  }

  if (purpose === 'instructor-assessment') {
    const code = safePathSegment(input.studentCode ?? '', '');
    if (!code) return { ok: false, reason: 'missing-student-code' };
    return {
      ok: true,
      purpose,
      lane: null,
      kind: 'json',
      fileName: `${input.dateKey}.json`,
      path: `students/${code}/from-instructor/${input.dateKey}.json`,
    };
  }

  if (purpose === 'student-photo') {
    // Head coach only, after an explicit publish. Never an automatic upload.
    if (input.role !== 'owner' && input.role !== 'instructor') return { ok: false, reason: 'role-hidden' };
    const code = safePathSegment(input.studentCode ?? '', '');
    if (!code) return { ok: false, reason: 'missing-student-code' };
    const fileName = fileNameOf(input.fileName, 'student-photo');
    return {
      ok: true,
      purpose,
      lane: null,
      kind: 'photo',
      fileName,
      path: `students/${code}/photos/approved/${fileName}`,
    };
  }

  if (purpose === 'instructor-pointer') {
    const code = safePathSegment(input.studentCode ?? '', '');
    const seat = safePathSegment(input.seatId ?? '', '');
    if (!code || !seat) return { ok: false, reason: 'missing-student-code' };
    const fileName = `${input.dateKey}-${code}.json`;
    return {
      ok: true,
      purpose,
      lane: null,
      kind: 'json',
      fileName,
      path: `instructors/${seat}/inbox/${fileName}`,
    };
  }

  if (purpose === 'events' || purpose === 'pro-shop') {
    if (input.role === 'student' || input.role === 'none') return { ok: false, reason: 'role-hidden' };
    const fileName = fileNameOf(input.fileName, purpose === 'events' ? 'event-photo' : 'product-card');
    return { ok: true, purpose, lane: null, kind: input.kind, fileName, path: `${purpose}/${fileName}` };
  }

  if (purpose === 'handoff-invite' || purpose === 'handoff-review') {
    if (input.role !== 'owner' && input.role !== 'instructor') return { ok: false, reason: 'role-hidden' };
    const fileName = fileNameOf(input.fileName, purpose === 'handoff-invite' ? 'invite.json' : 'review.json');
    const folder = purpose === 'handoff-invite' ? 'handoff/invites' : 'handoff/reviews';
    return { ok: true, purpose, lane: null, kind: 'json', fileName, path: `${folder}/${fileName}` };
  }

  const fileName = fileNameOf(input.fileName, `${purpose}.json`);
  return { ok: true, purpose, lane: null, kind: input.kind, fileName, path: `${purpose}/${fileName}` };
}

/** Parent folders for a relative file path. The file name is not included. */
export function parentSegments(relativePath: string): string[] {
  const parts = relativePath.split('/').filter(Boolean);
  parts.pop();
  return parts;
}

export const GALLERY_ROUTE_NOTE =
  'Class photos and short clips go to the gallery. They do not go in the instructor video folder.';

export const STUDENT_GALLERY_HIDDEN =
  'Students do not upload class photos. Send a file from your inbox, or keep the photo on this phone.';

export const DAILY_VIDEO_LANE_NOTE =
  'Daily training videos go in videos/daily. Older clips in Videos and training-videos stay where they are.';
