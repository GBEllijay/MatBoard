/**
 * Gym logo on the student's phone.
 * Separate from the Media Console logo so a student can replace or remove
 * a logo they received without changing the coach's saved mark.
 */

import { coachGymLogoFits } from './coachGymFit.ts';
import { fitWithinEdge } from './imageShrink.ts';
import { canvasBlob, openStill, type StillSource } from './phoneStill.ts';
import { assertOriginRoom, isStorageQuotaError, StorageQuotaError } from './storageQuota.ts';

export const STUDENT_GYM_LOGO_KEY = 'matboard.studentGymLogo.v1';

/** Preferred longest edge. Smaller steps are used only when the logo still exceeds the stored cap. */
export const STUDENT_LOGO_MAX_EDGE = 512;
const LOGO_PASSTHROUGH_BYTES = 180_000;

const LOGO_ENCODE_STEPS = [
  { edge: STUDENT_LOGO_MAX_EDGE, quality: 0.86 },
  { edge: STUDENT_LOGO_MAX_EDGE, quality: 0.7 },
  { edge: 384, quality: 0.62 },
  { edge: 256, quality: 0.55 },
] as const;

const LOGO_SAFE = new Set(['image/jpeg', 'image/png', 'image/webp']);

type GymLogoRecord = { version: 1; dataUrl: string };

type Store = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

function defaultStorage(): Store | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readRecord(storage: Pick<Storage, 'getItem'> | null): GymLogoRecord | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STUDENT_GYM_LOGO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GymLogoRecord>;
    if (parsed.version !== 1 || typeof parsed.dataUrl !== 'string' || !coachGymLogoFits(parsed.dataUrl)) return null;
    return { version: 1, dataUrl: parsed.dataUrl };
  } catch {
    return null;
  }
}

/**
 * Gym logo sent by the coach from the gallery master, versioned.
 * Not locked. The student can show the gym logo, their own upload, or the
 * Advantage default, and change that at any time (for example after leaving
 * the school). Student choice always wins.
 *
 * A connected student with no choice yet starts on the gym logo. When the
 * gym sends a newer version, a non-blocking prompt asks "Update?". Ignore
 * hides the prompt for that version, so it does not nag on every open.
 */
export const STUDENT_GYM_LOGO_SYNC_KEY = 'matboard.studentEdition.gymLogoSync.v1';
export const GYM_LOGO_PROMPT = 'Your gym updated its logo. Update?';

export type StudentLogoChoice = 'gym' | 'own' | 'default';

type GymLogoCopy = { logoVersion: number; dataUrl: string; gymName: string };

export type GymLogoSync = {
  version: 1;
  /** Newest logo the gym sent. */
  latest: GymLogoCopy | null;
  /** Gym logo version the student shows when the choice is the gym logo. */
  shown: GymLogoCopy | null;
  /** Omitted until the student picks. Omitted means the gym logo when one is shown. */
  choice?: StudentLogoChoice;
  /** Prompt for this version or older was ignored. */
  ignoredVersion: number;
};

const EMPTY_SYNC: GymLogoSync = { version: 1, latest: null, shown: null, ignoredVersion: 0 };

function readCopy(raw: unknown): GymLogoCopy | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<GymLogoCopy>;
  if (typeof row.dataUrl !== 'string' || !coachGymLogoFits(row.dataUrl)) return null;
  if (typeof row.logoVersion !== 'number' || !Number.isFinite(row.logoVersion) || row.logoVersion < 0) return null;
  return {
    logoVersion: row.logoVersion,
    dataUrl: row.dataUrl,
    gymName: typeof row.gymName === 'string' ? row.gymName.slice(0, 80) : '',
  };
}

export function readGymLogoSync(storage: Pick<Storage, 'getItem'> | null = defaultStorage()): GymLogoSync {
  if (!storage) return EMPTY_SYNC;
  try {
    const raw = storage.getItem(STUDENT_GYM_LOGO_SYNC_KEY);
    if (!raw) return EMPTY_SYNC;
    const parsed = JSON.parse(raw) as Partial<GymLogoSync>;
    if (parsed.version !== 1) return EMPTY_SYNC;
    const sync: GymLogoSync = {
      version: 1,
      latest: readCopy(parsed.latest),
      shown: readCopy(parsed.shown),
      ignoredVersion:
        typeof parsed.ignoredVersion === 'number' && Number.isFinite(parsed.ignoredVersion) ? parsed.ignoredVersion : 0,
    };
    if (parsed.choice === 'gym' || parsed.choice === 'own' || parsed.choice === 'default') sync.choice = parsed.choice;
    return sync;
  } catch {
    return EMPTY_SYNC;
  }
}

function writeGymLogoSync(storage: Store, sync: GymLogoSync): void {
  try {
    storage.setItem(STUDENT_GYM_LOGO_SYNC_KEY, JSON.stringify(sync));
  } catch (error) {
    if (isStorageQuotaError(error)) throw new StorageQuotaError(0);
    throw error;
  }
}

/**
 * A gym logo arrived from the coach. Newest version wins; an older or equal
 * one is ignored. A student with no choice and no logo of their own starts
 * on it with no prompt. Everyone else gets only the optional prompt.
 */
export function receiveGymLogo(
  input: { logoVersion: number; dataUrl: string; gymName?: string },
  storage: Store | null = defaultStorage(),
): 'started' | 'prompt' | 'ignored' {
  if (!storage || !coachGymLogoFits(input.dataUrl)) return 'ignored';
  if (!Number.isFinite(input.logoVersion) || input.logoVersion < 0) return 'ignored';
  const sync = readGymLogoSync(storage);
  if (sync.latest && sync.latest.logoVersion >= input.logoVersion) return 'ignored';
  const copy: GymLogoCopy = {
    logoVersion: input.logoVersion,
    dataUrl: input.dataUrl,
    gymName: (input.gymName ?? '').trim().slice(0, 80),
  };
  const fresh = !sync.shown && !sync.choice && !readRecord(storage);
  writeGymLogoSync(storage, fresh ? { ...sync, latest: copy, shown: copy } : { ...sync, latest: copy });
  return fresh ? 'started' : 'prompt';
}

/** True when a newer gym logo is waiting and the student has not ignored it. */
export function gymLogoPromptDue(storage: Pick<Storage, 'getItem'> | null = defaultStorage()): boolean {
  const sync = readGymLogoSync(storage);
  if (!sync.latest) return false;
  if (sync.latest.logoVersion <= sync.ignoredVersion) return false;
  const showingLatest = sync.shown?.logoVersion === sync.latest.logoVersion && (sync.choice ?? 'gym') === 'gym';
  return !showingLatest;
}

/** Update: show the newest gym logo. This sets the choice to the gym logo. */
export function acceptGymLogoUpdate(storage: Store | null = defaultStorage()): boolean {
  if (!storage) return false;
  const sync = readGymLogoSync(storage);
  if (!sync.latest) return false;
  writeGymLogoSync(storage, { ...sync, shown: sync.latest, choice: 'gym', ignoredVersion: sync.latest.logoVersion });
  return true;
}

/** Ignore: keep what is showing. The prompt stays away until a newer version. */
export function ignoreGymLogoUpdate(storage: Store | null = defaultStorage()): void {
  if (!storage) return;
  const sync = readGymLogoSync(storage);
  if (!sync.latest) return;
  writeGymLogoSync(storage, { ...sync, ignoredVersion: sync.latest.logoVersion });
}

/** Student choice. 'gym' reverts to the newest gym logo the student has. */
export function chooseStudentLogo(choice: StudentLogoChoice, storage: Store | null = defaultStorage()): void {
  if (!storage) return;
  const sync = readGymLogoSync(storage);
  if (choice === 'gym') {
    const target = sync.latest ?? sync.shown;
    writeGymLogoSync(storage, {
      ...sync,
      choice: 'gym',
      shown: target,
      ignoredVersion: Math.max(sync.ignoredVersion, target?.logoVersion ?? 0),
    });
    return;
  }
  writeGymLogoSync(storage, { ...sync, choice });
}

export function studentLogoChoice(storage: Pick<Storage, 'getItem'> | null = defaultStorage()): StudentLogoChoice | null {
  return readGymLogoSync(storage).choice ?? null;
}

/**
 * The logo every student screen shows. Student choice wins:
 * own upload, the Advantage default (null), or the gym logo. With no choice,
 * the gym logo when one is shown, else the logo kept on this phone.
 */
export function readStudentGymLogo(storage: Pick<Storage, 'getItem'> | null = defaultStorage()): string | null {
  const sync = readGymLogoSync(storage);
  const own = readRecord(storage)?.dataUrl ?? null;
  if (sync.choice === 'own') return own;
  if (sync.choice === 'default') return null;
  if (sync.choice === 'gym') return sync.shown?.dataUrl ?? null;
  return sync.shown?.dataUrl ?? own;
}

export function writeStudentGymLogo(dataUrl: string, storage: Store | null = defaultStorage()): void {
  if (!coachGymLogoFits(dataUrl)) throw new Error('too-large');
  if (!storage) return;
  const record: GymLogoRecord = { version: 1, dataUrl };
  try {
    storage.setItem(STUDENT_GYM_LOGO_KEY, JSON.stringify(record));
  } catch (error) {
    if (isStorageQuotaError(error)) throw new StorageQuotaError(0);
    throw error;
  }
}

export function clearStudentGymLogo(storage: Store | null = defaultStorage()): void {
  try {
    if (storage?.removeItem) storage.removeItem(STUDENT_GYM_LOGO_KEY);
    else storage?.setItem(STUDENT_GYM_LOGO_KEY, '');
  } catch {
    /* private mode */
  }
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(file.name);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  const mime = blob.type === 'image/png' || blob.type === 'image/webp' ? blob.type : 'image/jpeg';
  return `data:${mime};base64,${btoa(binary)}`;
}

function drawLogo(still: StillSource, edge: number, opaque: boolean): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const fitted = fitWithinEdge(still.width, still.height, edge);
  const canvas = document.createElement('canvas');
  canvas.width = fitted.width;
  canvas.height = fitted.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (opaque) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, fitted.width, fitted.height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  still.draw(ctx, 0, 0, still.width, still.height, 0, 0, fitted.width, fitted.height);
  return canvas;
}

/**
 * Scale a picked logo so it fits on this phone.
 * A small JPEG, PNG, or WebP that is already within the edge is kept.
 * Throws `not-image`, `undecodable`, `unencoded`, or `too-large`.
 */
async function logoFromFile(file: File): Promise<string> {
  if (!isImageFile(file)) throw new Error('not-image');
  const still = await openStill(file);
  try {
    if (
      LOGO_SAFE.has(file.type) &&
      still.width <= STUDENT_LOGO_MAX_EDGE &&
      still.height <= STUDENT_LOGO_MAX_EDGE &&
      file.size <= LOGO_PASSTHROUGH_BYTES
    ) {
      const original = await blobToDataUrl(file);
      if (coachGymLogoFits(original)) return original;
    }
    let produced = false;
    const keepAlpha = file.type === 'image/png' || file.type === 'image/webp';
    for (const step of LOGO_ENCODE_STEPS) {
      const transparent = keepAlpha ? drawLogo(still, step.edge, false) : null;
      const opaque = drawLogo(still, step.edge, true);
      if (!transparent && !opaque) throw new Error('unencoded');
      const encoded: Array<[HTMLCanvasElement, string]> = [];
      if (transparent) {
        encoded.push([transparent, 'image/png'], [transparent, 'image/webp']);
      }
      if (opaque) encoded.push([opaque, 'image/jpeg'], [opaque, 'image/webp']);
      for (const [canvas, mime] of encoded) {
        const blob = await canvasBlob(canvas, mime, step.quality);
        if (!blob) continue;
        produced = true;
        const dataUrl = await blobToDataUrl(blob);
        if (coachGymLogoFits(dataUrl)) return dataUrl;
      }
    }
    throw new Error(produced ? 'too-large' : 'unencoded');
  } finally {
    still.close();
  }
}

/** Save a picked photo as the student's gym logo. Returns the stored data URL. */
export async function saveStudentGymLogoFile(file: File, storage: Store | null = defaultStorage()): Promise<string> {
  const dataUrl = await logoFromFile(file);
  await assertOriginRoom(JSON.stringify({ version: 1, dataUrl }).length);
  writeStudentGymLogo(dataUrl, storage);
  chooseStudentLogo('own', storage);
  return dataUrl;
}
