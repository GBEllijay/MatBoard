/**
 * Direction B, Focus + drawer.
 * Pure helpers for the coach technique window and Daily Lesson Plan.
 * No storage. Existing plans render through the same block list.
 */

import type { GameBlock, PlanBlock } from './lessonTemplates.ts';
import type { TechniqueBlock, TrainingNotesPlan } from './trainingNotesStore.ts';

/** Sections that close the teaching group. A new technique goes before these. */
const TEACHING_END = new Set<PlanBlock['kind']>(['specific', 'cooldown', 'closing', 'replay']);

/**
 * Where "Add technique" belongs: with the other techniques, before Specific,
 * Cool down, Closing, or a replay card. A technique that was already dragged
 * past that boundary stays where the coach put it.
 */
export function techniqueInsertIndex(blocks: readonly PlanBlock[]): number {
  const boundary = blocks.findIndex((block) => TEACHING_END.has(block.kind));
  const limit = boundary < 0 ? blocks.length : boundary;
  for (let index = limit - 1; index >= 0; index -= 1) {
    if (blocks[index]?.kind === 'technique') return index + 1;
  }
  for (let index = limit - 1; index >= 0; index -= 1) {
    const kind = blocks[index]?.kind;
    if (kind === 'warmup' || kind === 'intro' || kind === 'game') return index + 1;
  }
  return limit;
}

export type FocusVideoKind = 'warmup' | 'technique' | 'cooldown';

export type FocusVideoStep = {
  id: string;
  kind: FocusVideoKind;
  blockIndex: number;
  /** 1-based among techniques. Warm-up and cool down leave this empty. */
  techniqueOrdinal: number | null;
};

/** Warm-up, techniques, and cool down in the order the class teaches them. */
export function focusVideoSteps(blocks: readonly PlanBlock[]): FocusVideoStep[] {
  let techniqueOrdinal = 0;
  const steps: FocusVideoStep[] = [];
  blocks.forEach((block, blockIndex) => {
    if (block.kind !== 'warmup' && block.kind !== 'technique' && block.kind !== 'cooldown') return;
    if (block.kind === 'technique') techniqueOrdinal += 1;
    const id = block.kind === 'technique' ? `technique:${block.id}` : `${block.kind}:${blockIndex}`;
    steps.push({
      id,
      kind: block.kind,
      blockIndex,
      techniqueOrdinal: block.kind === 'technique' ? techniqueOrdinal : null,
    });
  });
  return steps;
}

/** Open on the first technique. A class with none opens on warm-up or cool down. */
export function defaultFocusStepIndex(steps: readonly FocusVideoStep[]): number {
  const technique = steps.findIndex((step) => step.kind === 'technique');
  return technique >= 0 ? technique : 0;
}

export function focusStepLabel(step: FocusVideoStep | null, techniqueCount: number): string {
  if (!step) return 'Class';
  if (step.kind === 'warmup') return 'Warm-up';
  if (step.kind === 'cooldown') return 'Cool down';
  const count = Math.max(techniqueCount, step.techniqueOrdinal ?? 1);
  return `Technique ${step.techniqueOrdinal ?? 1} of ${count}`;
}

export function focusStepRef(step: FocusVideoStep): { role: 'warmup' } | { role: 'cooldown' } | { role: 'technique'; index: number } {
  if (step.kind === 'warmup') return { role: 'warmup' };
  if (step.kind === 'cooldown') return { role: 'cooldown' };
  return { role: 'technique', index: Math.max(0, (step.techniqueOrdinal ?? 1) - 1) };
}

export function notesPreview(text: string, maxChars = 160): { text: string; clipped: boolean } {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return { text: '', clipped: false };
  if (clean.length <= maxChars) return { text: clean, clipped: false };
  const slice = clean.slice(0, maxChars);
  const space = slice.lastIndexOf(' ');
  const cut = space > 60 ? slice.slice(0, space) : slice;
  return { text: `${cut.trim()}…`, clipped: true };
}

export type LessonBlockCopy = {
  title: string;
  notes: string;
  expected: string;
  water: boolean;
};

/** Title and notes for one saved block. Missing pieces stay empty so old plans still render. */
export function lessonBlockCopy(plan: TrainingNotesPlan, block: PlanBlock): LessonBlockCopy {
  if (block.kind === 'intro') {
    return { title: 'Intro', notes: plan.intro, expected: plan.introExpected, water: false };
  }
  if (block.kind === 'warmup') {
    return { title: 'Warm-up', notes: plan.warmupNote, expected: plan.warmupExpected, water: false };
  }
  if (block.kind === 'specific') {
    return { title: 'Specific Training / Rounds', notes: plan.specificNote, expected: plan.specificExpected, water: false };
  }
  if (block.kind === 'cooldown') {
    return { title: 'Cool down', notes: plan.cooldownNote, expected: plan.cooldownExpected, water: false };
  }
  if (block.kind === 'closing') {
    return { title: 'Closing', notes: plan.closing, expected: '', water: false };
  }
  if (block.kind === 'technique') {
    const tech = plan.techniques.find((item) => item.id === block.id);
    return copyFromNamed(tech, 'Technique');
  }
  if (block.kind === 'game') {
    const game = plan.games?.find((item) => item.id === block.id);
    return copyFromNamed(game, 'Game');
  }
  if (block.kind === 'replay') {
    const replay = plan.replays?.find((item) => item.id === block.id);
    return { title: replay?.title.trim() || 'Video replay', notes: replay?.notes ?? '', expected: '', water: false };
  }
  return { title: 'Section', notes: '', expected: '', water: false };
}

function copyFromNamed(block: TechniqueBlock | GameBlock | undefined, fallback: string): LessonBlockCopy {
  return {
    title: block?.title.trim() || fallback,
    notes: block?.notes ?? '',
    expected: block?.expected ?? '',
    water: block?.waterBreak === true,
  };
}
