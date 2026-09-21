/** Pure Daily Training Videos helpers — no IndexedDB. Shared by the store and tests. */

export const MAX_TECHNIQUE_CLIPS = 10;

const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.webm', '.mov', '.ogg', '.ogv'] as const;

function fileExtension(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
}

export function isTechniqueVideoFile(file: File): boolean {
  if (file.type && file.type.startsWith('video/')) return true;
  return (VIDEO_EXTENSIONS as readonly string[]).includes(fileExtension(file.name));
}

export function clipSlotsLeft(count: number, max = MAX_TECHNIQUE_CLIPS): number {
  return Math.max(0, max - Math.max(0, count));
}

export function pickAddableVideos(files: readonly File[], slotsLeft: number): File[] {
  if (slotsLeft <= 0) return [];
  return files.filter(isTechniqueVideoFile).slice(0, slotsLeft);
}

export function resolveSelectedId(
  selectedId: string | null,
  ids: readonly string[],
): string | null {
  if (selectedId && ids.includes(selectedId)) return selectedId;
  return ids[0] ?? null;
}

export const DRILL_PRESETS_SEC = [150, 300, 420] as const;
export const MIN_DRILL_SEC = 10;
export const MAX_DRILL_SEC = 30 * 60;
export const DEFAULT_DRILL_SEC = 300;

export function clampDrillSec(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_DRILL_SEC;
  return Math.min(MAX_DRILL_SEC, Math.max(MIN_DRILL_SEC, Math.round(n)));
}

export function isDrillPreset(sec: number): boolean {
  return (DRILL_PRESETS_SEC as readonly number[]).includes(sec);
}

/** Start a stopped drill: resume leftover time, or reset after 0:00 / a new length. */
export function remainingOnStart(remainingMs: number, durationMs: number): number {
  if (remainingMs > 0) return remainingMs;
  return Math.max(0, durationMs);
}

export function tickRemainingMs(remainingMs: number, stepMs: number): number {
  if (stepMs <= 0) return Math.max(0, remainingMs);
  return Math.max(0, remainingMs - stepMs);
}
