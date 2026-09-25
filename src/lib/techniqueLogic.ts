/**
 * Pure Daily Training Videos helpers — no IndexedDB. Shared by the store and tests.
 *
 * Clips live in on-device slots: optional Warm-up, Technique / Drill cards, optional Cool down.
 * One clip per slot. Storage quota is the only limit on how many clips this device keeps.
 * Technique slot ids stay stable on this device. Lesson Plan links by parallel order
 * (Warm-up, Drill 1, …) in lessonLinks.ts, not by matching these ids to lesson text.
 */

export const WARMUP_SLOT_ID = 'warmup';
export const COOLDOWN_SLOT_ID = 'cooldown';
export const MIN_TECHNIQUE_SLOTS = 3;
export const MAX_TECHNIQUE_SLOTS = 10;

const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.webm', '.mov', '.ogg', '.ogv'] as const;

function fileExtension(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
}

export function isTechniqueVideoFile(file: File): boolean {
  if (file.type && file.type.startsWith('video/')) return true;
  return (VIDEO_EXTENSIONS as readonly string[]).includes(fileExtension(file.name));
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

export type SlotKind = 'warmup' | 'technique' | 'cooldown';

export type VideoSlot = {
  /** Warm-up and Cool down use fixed ids. Technique ids are stable on this device. */
  slotId: string;
  kind: SlotKind;
  clipId: string | null;
  drillSec: number;
};

export type VideoPlan = {
  version: 2;
  /** Warm-up, technique cards, then Cool down. Cool down stays last. */
  slots: VideoSlot[];
  selectedSlotId: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function techniqueSlot(slotId: string, drillSec = DEFAULT_DRILL_SEC, clipId: string | null = null): VideoSlot {
  return { slotId, kind: 'technique', clipId, drillSec: clampDrillSec(drillSec) };
}

function endSlot(slotId: typeof WARMUP_SLOT_ID | typeof COOLDOWN_SLOT_ID, kind: 'warmup' | 'cooldown'): VideoSlot {
  return { slotId, kind, clipId: null, drillSec: DEFAULT_DRILL_SEC };
}

function defaultTechniqueId(used: readonly string[], index: number): string {
  const taken = new Set(used);
  let n = index + 1;
  let id = `tech-${n}`;
  while (taken.has(id) || id === WARMUP_SLOT_ID || id === COOLDOWN_SLOT_ID) {
    n += 1;
    id = `tech-${n}`;
  }
  return id;
}

export function isTimedSlot(slot: VideoSlot): boolean {
  return slot.kind === 'technique';
}

export function techniqueIndex(plan: VideoPlan, slotId: string): number {
  return plan.slots.filter((slot) => slot.kind === 'technique').findIndex((slot) => slot.slotId === slotId);
}

export function slotTitle(slot: VideoSlot, techniqueOrdinal: number): string {
  if (slot.kind === 'warmup') return 'Warm-up (optional)';
  if (slot.kind === 'cooldown') return 'Cool down (optional)';
  return `Technique / Drill ${techniqueOrdinal + 1}`;
}

export function clipCount(plan: VideoPlan): number {
  const ids = new Set<string>();
  for (const slot of plan.slots) {
    if (slot.clipId) ids.add(slot.clipId);
  }
  return ids.size;
}

/** Any card can take a clip. Origin storage quota is the hard stop, not a count. */
export function canAssignClip(plan: VideoPlan, slotId: string): boolean {
  return plan.slots.some((item) => item.slotId === slotId);
}

export function nextTechniqueSlotId(plan: VideoPlan): string {
  return defaultTechniqueId(
    plan.slots.map((slot) => slot.slotId),
    plan.slots.filter((slot) => slot.kind === 'technique').length,
  );
}

export function emptyVideoPlan(): VideoPlan {
  return planFromFlatClips({ clipIds: [] });
}

/**
 * Map the old flat clip list onto technique cards, in list order.
 * Warm-up and Cool down stay empty. The old global drill length is copied onto every technique.
 */
export function planFromFlatClips(input: {
  clipIds: readonly string[];
  selectedClipId?: string | null;
  drillSec?: number;
}): VideoPlan {
  const drillSec = clampDrillSec(input.drillSec ?? DEFAULT_DRILL_SEC);
  const clips = [...new Set(input.clipIds.filter((id) => id.trim()))];
  const count = Math.min(MAX_TECHNIQUE_SLOTS, Math.max(MIN_TECHNIQUE_SLOTS, clips.length));
  const used: string[] = [];
  const techniques: VideoSlot[] = [];
  for (let index = 0; index < count; index += 1) {
    const slotId = defaultTechniqueId(used, index);
    used.push(slotId);
    techniques.push(techniqueSlot(slotId, drillSec, clips[index] ?? null));
  }
  const slots: VideoSlot[] = [endSlot(WARMUP_SLOT_ID, 'warmup'), ...techniques, endSlot(COOLDOWN_SLOT_ID, 'cooldown')];
  const selectedSlotId =
    slots.find((slot) => slot.clipId && slot.clipId === input.selectedClipId)?.slotId ??
    slots.find((slot) => slot.clipId)?.slotId ??
    techniques[0]?.slotId ??
    WARMUP_SLOT_ID;
  return { version: 2, slots, selectedSlotId };
}

export function selectSlot(plan: VideoPlan, slotId: string): VideoPlan {
  if (!plan.slots.some((slot) => slot.slotId === slotId)) return plan;
  if (plan.selectedSlotId === slotId) return plan;
  return { ...plan, selectedSlotId: slotId };
}

export function setSlotDrill(plan: VideoPlan, slotId: string, drillSec: number): VideoPlan {
  const clamped = clampDrillSec(drillSec);
  const slot = plan.slots.find((item) => item.slotId === slotId);
  if (!slot || slot.kind !== 'technique' || slot.drillSec === clamped) return plan;
  return {
    ...plan,
    slots: plan.slots.map((item) => (item.slotId === slotId ? { ...item, drillSec: clamped } : item)),
  };
}

/** One clip lives in one slot. Assigning it here clears it from any other slot. */
export function setSlotClip(plan: VideoPlan, slotId: string, clipId: string | null): VideoPlan {
  if (!plan.slots.some((slot) => slot.slotId === slotId)) return plan;
  let changed = false;
  const slots = plan.slots.map((slot) => {
    if (slot.slotId === slotId) {
      if (slot.clipId !== clipId) changed = true;
      return { ...slot, clipId };
    }
    if (clipId && slot.clipId === clipId) {
      changed = true;
      return { ...slot, clipId: null };
    }
    return slot;
  });
  return changed ? { ...plan, slots } : plan;
}

/** Insert Technique / Drill N immediately before Cool down. */
export function insertTechniqueSlot(plan: VideoPlan, slotId: string): VideoPlan | null {
  const trimmed = slotId.trim();
  if (!trimmed || trimmed === WARMUP_SLOT_ID || trimmed === COOLDOWN_SLOT_ID) return null;
  if (plan.slots.some((slot) => slot.slotId === trimmed)) return null;
  const techniques = plan.slots.filter((slot) => slot.kind === 'technique');
  if (techniques.length >= MAX_TECHNIQUE_SLOTS) return null;
  const slot = techniqueSlot(trimmed);
  const cooldownIndex = plan.slots.findIndex((item) => item.kind === 'cooldown');
  const slots = [...plan.slots];
  slots.splice(cooldownIndex === -1 ? slots.length : cooldownIndex, 0, slot);
  return { ...plan, slots };
}

function parseSlot(value: unknown, known: ReadonlySet<string>): { slot: VideoSlot; changed: boolean } | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const kind = raw.kind;
  if (kind !== 'warmup' && kind !== 'technique' && kind !== 'cooldown') return null;
  const slotId = typeof raw.slotId === 'string' ? raw.slotId.trim().slice(0, 80) : '';
  if (!slotId) return null;
  if (kind === 'warmup' && slotId !== WARMUP_SLOT_ID) return null;
  if (kind === 'cooldown' && slotId !== COOLDOWN_SLOT_ID) return null;
  if (kind === 'technique' && (slotId === WARMUP_SLOT_ID || slotId === COOLDOWN_SLOT_ID)) return null;
  const clipRaw = typeof raw.clipId === 'string' && raw.clipId.trim() ? raw.clipId : null;
  const clipKnown = Boolean(clipRaw && known.has(clipRaw));
  const clipId = clipKnown ? clipRaw : null;
  const hadDrill = typeof raw.drillSec === 'number' && Number.isFinite(raw.drillSec);
  const drillSec = clampDrillSec(hadDrill ? (raw.drillSec as number) : DEFAULT_DRILL_SEC);
  const changed = Boolean(clipRaw && !clipKnown) || (kind === 'technique' && hadDrill && drillSec !== raw.drillSec);
  return { slot: { slotId, kind, clipId, drillSec }, changed };
}

function planSignature(plan: VideoPlan): string {
  return JSON.stringify({
    version: plan.version,
    selectedSlotId: plan.selectedSlotId,
    slots: plan.slots.map((slot) => ({
      slotId: slot.slotId,
      kind: slot.kind,
      clipId: slot.clipId,
      drillSec: slot.drillSec,
    })),
  });
}

/** Repair a stored plan. Unknown clip ids are cleared. Cool down is forced last. */
export function sanitizeVideoPlan(
  raw: unknown,
  knownClipIds: readonly string[],
): { plan: VideoPlan; changed: boolean } {
  const known = new Set(knownClipIds);
  const record = asRecord(raw);
  const rawSlots = record && Array.isArray(record.slots) ? record.slots : null;
  if (!record || record.version !== 2 || !rawSlots) {
    return { plan: planFromFlatClips({ clipIds: knownClipIds }), changed: true };
  }

  let changed = false;
  const parsed: VideoSlot[] = [];
  for (const item of rawSlots) {
    const result = parseSlot(item, known);
    if (!result) {
      changed = true;
      continue;
    }
    if (result.changed) changed = true;
    parsed.push(result.slot);
  }

  const kinds = parsed.map((slot) => slot.kind);
  const orderOk =
    kinds[0] === 'warmup' &&
    kinds[kinds.length - 1] === 'cooldown' &&
    kinds.slice(1, -1).every((kind) => kind === 'technique') &&
    kinds.filter((kind) => kind === 'warmup').length === 1 &&
    kinds.filter((kind) => kind === 'cooldown').length === 1;
  if (!orderOk) changed = true;

  const seenIds = new Set<string>();
  const seenClips = new Set<string>();
  const takeClip = (clipId: string | null): string | null => {
    if (!clipId || seenClips.has(clipId)) {
      if (clipId) changed = true;
      return null;
    }
    seenClips.add(clipId);
    return clipId;
  };

  const warmupSource = parsed.find((slot) => slot.kind === 'warmup');
  if (!warmupSource) changed = true;
  const warmup: VideoSlot = {
    slotId: WARMUP_SLOT_ID,
    kind: 'warmup',
    clipId: takeClip(warmupSource?.clipId ?? null),
    drillSec: warmupSource?.drillSec ?? DEFAULT_DRILL_SEC,
  };

  const techniques: VideoSlot[] = [];
  for (const slot of parsed) {
    if (slot.kind !== 'technique') continue;
    if (seenIds.has(slot.slotId)) {
      changed = true;
      continue;
    }
    if (techniques.length >= MAX_TECHNIQUE_SLOTS) {
      changed = true;
      continue;
    }
    seenIds.add(slot.slotId);
    techniques.push({ ...slot, clipId: takeClip(slot.clipId), drillSec: clampDrillSec(slot.drillSec) });
  }
  while (techniques.length < MIN_TECHNIQUE_SLOTS) {
    const slotId = defaultTechniqueId([...seenIds], techniques.length);
    seenIds.add(slotId);
    techniques.push(techniqueSlot(slotId));
    changed = true;
  }

  const cooldownSource = parsed.find((slot) => slot.kind === 'cooldown');
  if (!cooldownSource) changed = true;
  const cooldown: VideoSlot = {
    slotId: COOLDOWN_SLOT_ID,
    kind: 'cooldown',
    clipId: takeClip(cooldownSource?.clipId ?? null),
    drillSec: cooldownSource?.drillSec ?? DEFAULT_DRILL_SEC,
  };

  const slots = [warmup, ...techniques, cooldown];
  const selectedRaw = typeof record.selectedSlotId === 'string' ? record.selectedSlotId : '';
  const selectedSlotId = slots.some((slot) => slot.slotId === selectedRaw)
    ? selectedRaw
    : (slots.find((slot) => slot.clipId)?.slotId ?? techniques[0].slotId);
  if (selectedSlotId !== selectedRaw) changed = true;

  const plan: VideoPlan = { version: 2, slots, selectedSlotId };
  if (!changed && planSignature(plan) !== planSignature({ version: 2, slots: parsed as VideoSlot[], selectedSlotId: selectedRaw })) {
    changed = true;
  }
  return { plan, changed };
}

/**
 * Clips saved before slots existed, or left behind by a repair, fill empty technique cards first.
 * Does not delete leftovers that have no empty card.
 */
export function assignOrphanClips(
  plan: VideoPlan,
  orderedClipIds: readonly string[],
): { plan: VideoPlan; changed: boolean } {
  const assigned = new Set(plan.slots.flatMap((slot) => (slot.clipId ? [slot.clipId] : [])));
  const orphans = orderedClipIds.filter((id, index, all) => id && all.indexOf(id) === index && !assigned.has(id));
  if (!orphans.length) return { plan, changed: false };

  let next = plan;
  let changed = false;
  for (const clipId of orphans) {
    let slot = next.slots.find((item) => item.kind === 'technique' && !item.clipId);
    if (!slot && next.slots.filter((item) => item.kind === 'technique').length < MAX_TECHNIQUE_SLOTS) {
      const inserted = insertTechniqueSlot(next, nextTechniqueSlotId(next));
      if (inserted) {
        next = inserted;
        slot = next.slots.find((item) => item.kind === 'technique' && !item.clipId);
      }
    }
    if (!slot) slot = next.slots.find((item) => item.kind === 'warmup' && !item.clipId);
    if (!slot) slot = next.slots.find((item) => item.kind === 'cooldown' && !item.clipId);
    if (!slot) break;
    next = setSlotClip(next, slot.slotId, clipId);
    changed = true;
  }
  return { plan: next, changed };
}
