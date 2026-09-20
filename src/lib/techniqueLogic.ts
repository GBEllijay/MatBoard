/** Pure Daily Techniques helpers — no IndexedDB. Shared by the store and tests. */

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
