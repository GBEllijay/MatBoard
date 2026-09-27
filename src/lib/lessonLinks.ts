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
 * has that same extra slot. No clip means an empty preview, not a broken image.
 * The play control does not start the clip. It opens Daily Training Videos on that section
 * (`focus=1`, `section`, `date`, optional `slot` and technique `index`) so the coach can
 * add, replace, or remove the video. `play=1` is not part of that link.
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

import { localDateKey, planDayStamp } from './trainingNotesStore.ts';
import {
  MIN_TECHNIQUE_SLOTS,
  techniqueIndex,
  type VideoPlan,
  type VideoSlot,
} from './techniqueLogic.ts';

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

const LESSON_SECTIONS = ['warmup', 'technique', 'cooldown'] as const;
export type LessonSection = (typeof LESSON_SECTIONS)[number];
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type LessonVideoFocus = {
  /** True when the URL asks Daily Training Videos to land on a lesson section. */
  active: boolean;
  /** Lesson Plan sends this. It selects the card and does not start playback. */
  focus: boolean;
  /**
   * Legacy links may still send `play=1` without `focus=1`. Those start the clip.
   * A lesson focus link never plays, even if `play` is also present.
   */
  play: boolean;
  slotId: string | null;
  section: LessonSection | null;
  /** Zero-based technique ordinal. Warm-up and Cool down leave this empty. */
  index: number | null;
  /** Lesson day, `YYYY-MM-DD`. Informational — the video board is still one plan. */
  date: string | null;
};

function lessonSection(value: string | null): LessonSection | null {
  if (!value) return null;
  return (LESSON_SECTIONS as readonly string[]).includes(value) ? (value as LessonSection) : null;
}

/**
 * Daily Lesson Plan → Daily Training Videos.
 * Query: `focus=1`, `section` (`warmup` | `technique` | `cooldown`), `date` (`YYYY-MM-DD`),
 * optional `slot` (video slot id) and `index` (zero-based technique ordinal).
 * No `play` param — the coach lands on that card to add, replace, or remove a clip.
 */
export function techniquesFocusPath(input: {
  section: LessonSection;
  date: string;
  slotId?: string | null;
  index?: number;
}): string {
  const params = new URLSearchParams();
  params.set('focus', '1');
  params.set('section', input.section);
  params.set('date', input.date);
  const slotId = input.slotId?.trim();
  if (slotId) params.set('slot', slotId);
  if (
    input.section === 'technique' &&
    input.index != null &&
    Number.isInteger(input.index) &&
    input.index >= 0
  ) {
    params.set('index', String(input.index));
  }
  return `/techniques?${params.toString()}`;
}

export function parseLessonVideoFocus(params: URLSearchParams): LessonVideoFocus {
  const section = lessonSection(params.get('section'));
  const slotRaw = params.get('slot')?.trim() ?? '';
  const slotId = slotRaw ? slotRaw : null;
  const dateRaw = params.get('date')?.trim() ?? '';
  const date = DATE_KEY.test(dateRaw) ? dateRaw : null;
  const indexRaw = params.get('index');
  const indexNum = indexRaw == null || indexRaw === '' ? Number.NaN : Number(indexRaw);
  const index =
    Number.isInteger(indexNum) && indexNum >= 0 && indexNum < 100 ? indexNum : null;
  const focus = params.get('focus') === '1';
  const play = params.get('play') === '1' && !focus;
  return {
    active: focus || play || Boolean(slotId) || Boolean(section),
    focus,
    play,
    slotId,
    section,
    index,
    date,
  };
}

function slotForSection(
  plan: VideoPlan,
  section: LessonSection | null,
  index: number | null,
): VideoSlot | null {
  if (section === 'warmup') return plan.slots.find((slot) => slot.kind === 'warmup') ?? null;
  if (section === 'cooldown') return plan.slots.find((slot) => slot.kind === 'cooldown') ?? null;
  if (section === 'technique' && index != null) {
    return plan.slots.filter((slot) => slot.kind === 'technique')[index] ?? null;
  }
  return null;
}

/**
 * Lesson section + index wins. That is the same parallel order as the lesson preview.
 * A bare `slot` id is only the fallback for older links that did not send a section.
 */
export function resolveFocusedSlot(plan: VideoPlan, focus: LessonVideoFocus): VideoSlot | null {
  const bySection = slotForSection(plan, focus.section, focus.index);
  if (bySection) return bySection;
  if (!focus.slotId) return null;
  return plan.slots.find((slot) => slot.slotId === focus.slotId) ?? null;
}

/** Banner copy once Daily Training Videos has selected the lesson card. */
export function lessonFocusStatus(
  plan: VideoPlan,
  focus: LessonVideoFocus,
  slot: VideoSlot,
  today = localDateKey(),
): string {
  const ordinal =
    slot.kind === 'technique'
      ? focus.section === 'technique' && focus.index != null
        ? focus.index
        : Math.max(0, techniqueIndex(plan, slot.slotId))
      : 0;
  const name =
    slot.kind === 'warmup'
      ? 'Warm-up'
      : slot.kind === 'cooldown'
        ? 'Cool down'
        : `Technique / Drill ${ordinal + 1}`;
  const when = !focus.date
    ? 'Daily Lesson Plan'
    : focus.date === today
      ? "today's Daily Lesson Plan"
      : `the ${planDayStamp(focus.date)} Daily Lesson Plan`;
  return `From ${when} · ${name}. Add, replace, or remove the video on this card.`;
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
