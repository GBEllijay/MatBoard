/**
 * On-device links from today's Daily Lesson Plan to Daily Training Videos and Technique Tree.
 * No cloud. Video clips stay in the Daily Training IndexedDB plan (one board, treated as today).
 * Lesson days stay in `matboard.coach.trainingNotes.v1`. Trees stay in `matboard.coach.techniqueTree.v1`.
 *
 * Video pairing is parallel slot order, not title text and not lesson `slotId`:
 * - Warm-up → the Warm-up video slot
 * - Technique / Drill N → the Nth technique video slot (Drill 1 is index 0)
 * - Cool down → the Cool down video slot
 * Drill 1–3 always offer a preview. A later “Add another” drill offers one only when Videos
 * has that same extra slot. No clip means an empty disabled preview, not a broken image.
 *
 * Technique Tree pairing, first hit wins:
 * 1. Explicit `treeId` saved on that drill from the picker, when the tree still exists.
 * 2. Otherwise the drill title, case-insensitive:
 *    - `Name (Base position)` or `Name / Base position` (also `Name/Base`)
 *      links the tree whose base (root title) matches. One tree with that base is enough.
 *      Several trees with that base link only when the name also matches one tree name.
 *    - A plain title links when it equals exactly one tree name or base title.
 * Warm-up and Cool down do not link a tree.
 * Specific Training / Rounds is a lesson note only. Videos has no slot for it.
 */

import { MIN_TECHNIQUE_SLOTS, type VideoPlan, type VideoSlot } from './techniqueLogic.ts';

export type LessonSlotRef =
  | { role: 'warmup' }
  | { role: 'cooldown' }
  | { role: 'technique'; index: number };

export type LessonTreeCandidate = {
  id: string;
  name: string;
  /** Root title. Empty when the tree has no base yet. */
  rootTitle: string;
};

export function parallelVideoSlot(plan: VideoPlan, ref: LessonSlotRef): VideoSlot | null {
  if (ref.role === 'warmup') return plan.slots.find((slot) => slot.kind === 'warmup') ?? null;
  if (ref.role === 'cooldown') return plan.slots.find((slot) => slot.kind === 'cooldown') ?? null;
  const techniques = plan.slots.filter((slot) => slot.kind === 'technique');
  return techniques[ref.index] ?? null;
}

/**
 * Whether this lesson section should show a video preview.
 * `techniqueSlotCount` is null while the video board is still loading.
 */
export function lessonSlotOffersVideo(ref: LessonSlotRef, techniqueSlotCount: number | null): boolean {
  if (ref.role !== 'technique') return true;
  if (ref.index < MIN_TECHNIQUE_SLOTS) return true;
  return techniqueSlotCount != null && ref.index < techniqueSlotCount;
}

export function techniquesLaunchPath(slotId: string): string {
  const params = new URLSearchParams({ slot: slotId, play: '1' });
  return `/techniques?${params.toString()}`;
}

export function techniqueTreeLaunchPath(treeId: string): string {
  const params = new URLSearchParams({ tree: treeId });
  return `/technique-tree?${params.toString()}`;
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Pull a base position out of `Name (Base)` or `Name / Base`. */
export function parseTechniqueTitle(title: string): { name: string; base: string | null } {
  const trimmed = title.trim().replace(/\s+/g, ' ');
  const paren = trimmed.match(/^(.*)\(([^)]+)\)\s*$/);
  if (paren) {
    const name = paren[1].trim();
    const base = paren[2].trim();
    if (name && base) return { name, base };
  }
  const slashAt = trimmed.lastIndexOf('/');
  if (slashAt > 0) {
    const name = trimmed.slice(0, slashAt).trim();
    const base = trimmed.slice(slashAt + 1).trim();
    if (name && base) return { name, base };
  }
  return { name: trimmed, base: null };
}

/**
 * Resolve the tree for one drill.
 * A stored id wins when that tree is still on the phone. A missing id falls through to the title.
 */
export function matchLessonTree(
  title: string,
  treeId: string | undefined,
  trees: readonly LessonTreeCandidate[],
): LessonTreeCandidate | null {
  const storedId = treeId?.trim();
  if (storedId) {
    const stored = trees.find((tree) => tree.id === storedId);
    if (stored) return stored;
  }

  const parsed = parseTechniqueTitle(title);
  const name = norm(parsed.name);
  if (!name) return null;
  const withBase = trees.filter((tree) => tree.rootTitle.trim());

  if (parsed.base) {
    const base = norm(parsed.base);
    const rooted = withBase.filter((tree) => norm(tree.rootTitle) === base);
    if (rooted.length === 1) return rooted[0];
    const named = rooted.filter((tree) => norm(tree.name) === name);
    if (named.length === 1) return named[0];
    return null;
  }

  const exact = withBase.filter((tree) => norm(tree.rootTitle) === name || norm(tree.name) === name);
  if (exact.length === 1) return exact[0];
  return null;
}
