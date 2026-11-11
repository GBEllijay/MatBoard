/**
 * Plus Cloud lapse. Sharing through Advantage Cloud stops.
 * Everything that does not need the cloud keeps working.
 * The download window is 60 days. The internal recovery note stays off this module.
 */

export const CLOUD_DOWNLOAD_DAYS = 60;
export const CLOUD_DOWNLOAD_MS = CLOUD_DOWNLOAD_DAYS * 24 * 60 * 60 * 1000;

export const CLOUD_SEEN_KEY = 'matboard.plusCloud.seenActive.v1';
export const CLOUD_LAPSED_KEY = 'matboard.plusCloud.lapsedAt.v1';

export const LAPSE_PAUSED = 'Cloud sharing is paused. Everything on this phone still works.';
/**
 * What “paused” means. Same condition as the notice: this browser once had
 * Advantage Pro Plus Cloud open, and the pass signed in here does not open it now.
 * Wording only. The condition is unchanged.
 */
export const LAPSE_WHY =
  "What is paused: the pass signed in on this browser does not include Advantage Pro Plus Cloud right now. That happens when the Cloud subscription has ended, when this browser is signed in with an instructor seat instead of the gym owner's pass, or when no pass is signed in here. Sign in again with the owner pass that has Advantage Cloud and this notice goes away. The days left count from when this browser first saw Cloud off.";
export const LAPSE_CONNECT =
  'To use these files on another device, connect Google Drive, OneDrive, or a folder on this computer.';
export const LAPSE_REMOVED =
  'The Advantage Cloud copy has been removed. Files already on this phone, and any folder you downloaded, are still yours.';
export const LAPSE_DOWNLOADED = 'Saved advantage-gym-folder.txt on this phone.';

export type CloudLapsePhase =
  | { phase: 'hidden' }
  | { phase: 'download'; daysLeft: number }
  | { phase: 'removed' };

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem?: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

export function downloadDaysLeft(lapsedAt: number, now: number): number {
  const left = lapsedAt + CLOUD_DOWNLOAD_MS - now;
  if (left <= 0) return 0;
  return Math.ceil(left / (24 * 60 * 60 * 1000));
}

export function downloadButtonLabel(daysLeft: number): string {
  const days = daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
  return `Download my gym folder. ${days}`;
}

export function cloudLapsePhase(input: {
  seenActive: boolean;
  lapsedAt: number | null;
  now: number;
  cloudActive: boolean;
}): CloudLapsePhase {
  if (!input.seenActive || input.cloudActive) return { phase: 'hidden' };
  if (input.lapsedAt == null || !Number.isFinite(input.lapsedAt)) return { phase: 'hidden' };
  const daysLeft = downloadDaysLeft(input.lapsedAt, input.now);
  if (daysLeft <= 0) return { phase: 'removed' };
  return { phase: 'download', daysLeft };
}

export function readCloudLapse(storage: MemoryStore | null | undefined, now = Date.now(), cloudActive = false): CloudLapsePhase {
  if (!storage) return { phase: 'hidden' };
  const seen = storage.getItem(CLOUD_SEEN_KEY) === '1';
  const raw = storage.getItem(CLOUD_LAPSED_KEY);
  const lapsedAt = raw ? Number(raw) : null;
  return cloudLapsePhase({
    seenActive: seen,
    lapsedAt: lapsedAt != null && Number.isFinite(lapsedAt) ? lapsedAt : null,
    now,
    cloudActive,
  });
}

/** Remember that Cloud was on, and stamp the lapse the first time it is off. */
export function syncCloudLapse(storage: MemoryStore | null | undefined, cloudActive: boolean, now = Date.now()): void {
  if (!storage?.setItem) return;
  if (cloudActive) {
    storage.setItem(CLOUD_SEEN_KEY, '1');
    storage.removeItem?.(CLOUD_LAPSED_KEY);
    return;
  }
  if (storage.getItem(CLOUD_SEEN_KEY) !== '1') return;
  if (!storage.getItem(CLOUD_LAPSED_KEY)) storage.setItem(CLOUD_LAPSED_KEY, String(now));
}

/** A plain folder list the phone can save. Bytes already on the phone stay on the phone. */
export function gymFolderDownloadText(): string {
  return [
    'Advantage gym folder',
    'gallery/approved/',
    'gallery/pending/',
    'gallery/rejected/',
    'videos/daily/',
    'lessons/current/',
    'lessons/archive/',
    'students/',
    'instructors/',
    'handoff/invites/',
    'handoff/reviews/',
    'events/',
    'pro-shop/',
    '',
    'Photos and videos already on this phone stay on this phone.',
    'Connect Google Drive, OneDrive, or a folder on this computer to keep a copy there.',
  ].join('\n');
}
