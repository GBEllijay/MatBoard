/**
 * Daily Lesson Plan templates.
 * Adult is the structure a plan already had: intro, warm-up, three techniques,
 * specific training, cool down, and closing.
 * Kids starts from that and puts a Game between Technique 1 and Technique 2
 * in place of Technique 3.
 * Competition points this plan at the Competition Class Curriculum. That
 * curriculum keeps its own saved days.
 * A template only sets the starting blocks. The coach can reorder, add, and
 * remove after that. Plans saved before templates have no `template` or
 * `blocks` and still open as Adult.
 */

import {
  EXPECTED_MAX,
  MAX_TECHNIQUES,
  TECHNIQUE_NOTES_MAX,
  TECHNIQUE_TITLE_MAX,
  createTechnique,
  planHasContent,
  type PlanVideoRef,
  type TechniqueBlock,
  type TrainingNotesPlan,
} from './trainingNotesStore.ts';
import { clampText } from './plainValue.ts';

export const LESSON_TEMPLATES = ['adult', 'kids', 'competition'] as const;
export type LessonTemplateId = (typeof LESSON_TEMPLATES)[number];

export const LESSON_TEMPLATE_LABELS: Record<LessonTemplateId, string> = {
  adult: 'Adult class',
  kids: 'Kids class',
  competition: 'Competition class',
};

export const MAX_GAMES = 20;

const SECTION_KINDS = ['intro', 'warmup', 'specific', 'cooldown', 'closing'] as const;
export type PlanSectionKind = (typeof SECTION_KINDS)[number];

export type PlanBlock =
  | { kind: PlanSectionKind }
  | { kind: 'technique'; id: string }
  | { kind: 'game'; id: string };

export type GameBlock = {
  id: string;
  title: string;
  notes: string;
  expected: string;
  waterBreak: boolean;
};

let idSeq = 0;

function createId(prefix: string): string {
  idSeq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${idSeq.toString(36)}-${rand}`;
}

export function createGame(): GameBlock {
  return {
    id: createId('game'),
    title: '',
    notes: '',
    expected: '',
    waterBreak: false,
  };
}

export function isLessonTemplate(value: unknown): value is LessonTemplateId {
  return value === 'adult' || value === 'kids' || value === 'competition';
}

export function activeLessonTemplate(plan: Pick<TrainingNotesPlan, 'template'>): LessonTemplateId {
  return plan.template ?? 'adult';
}

export function gameHasContent(game: GameBlock): boolean {
  return Boolean(game.title.trim() || game.notes.trim() || game.expected.trim() || game.waterBreak);
}

/** A chosen template or a saved block list is part of the plan, even before any notes. */
export function planStructureStored(plan: Pick<TrainingNotesPlan, 'template' | 'blocks' | 'games'>): boolean {
  if (plan.template) return true;
  if (plan.blocks) return true;
  return Boolean(plan.games?.some(gameHasContent));
}

export function templateChangeNeedsConfirm(plan: TrainingNotesPlan): boolean {
  if (plan.template === 'competition') return true;
  if (planHasContent(plan)) return true;
  return Boolean(plan.games?.some(gameHasContent));
}

function isSectionKind(value: unknown): value is PlanSectionKind {
  return typeof value === 'string' && (SECTION_KINDS as readonly string[]).includes(value);
}

export function implicitAdultBlocks(plan: Pick<TrainingNotesPlan, 'techniques'>): PlanBlock[] {
  return [
    { kind: 'intro' },
    { kind: 'warmup' },
    ...plan.techniques.map((tech) => ({ kind: 'technique' as const, id: tech.id })),
    { kind: 'specific' },
    { kind: 'cooldown' },
    { kind: 'closing' },
  ];
}

/** Blocks to render. A missing list is the Adult order already stored on the plan. */
export function lessonBlocks(plan: TrainingNotesPlan): PlanBlock[] {
  if (plan.blocks) return plan.blocks;
  return implicitAdultBlocks(plan);
}

function techniqueIds(blocks: readonly PlanBlock[]): string[] {
  return blocks.filter((block) => block.kind === 'technique').map((block) => block.id);
}

function blockSignature(blocks: readonly PlanBlock[]): string {
  return blocks
    .map((block) => (block.kind === 'technique' ? `technique:${block.id}` : block.kind === 'game' ? 'game' : block.kind))
    .join('|');
}

function adultSignature(plan: TrainingNotesPlan): string {
  const ids = plan.techniques.slice(0, 3).map((tech) => tech.id);
  return ['intro', 'warmup', ...ids.map((id) => `technique:${id}`), 'specific', 'cooldown', 'closing'].join('|');
}

function kidsSignature(plan: TrainingNotesPlan): string {
  const ids = plan.techniques.slice(0, 2).map((tech) => tech.id);
  return ['intro', 'warmup', ids[0] ? `technique:${ids[0]}` : 'technique:', 'game', ids[1] ? `technique:${ids[1]}` : 'technique:', 'specific', 'cooldown', 'closing'].join('|');
}

export function templateAlreadyApplied(plan: TrainingNotesPlan, template: LessonTemplateId): boolean {
  if (template === 'competition') return plan.template === 'competition';
  const current = plan.template ?? 'adult';
  if (current !== template) return false;
  if (!plan.blocks) return template === 'adult';
  const starter = template === 'kids' ? kidsSignature(plan) : adultSignature(plan);
  return blockSignature(plan.blocks) === starter;
}

export function remapTechniqueVideos(
  videos: readonly PlanVideoRef[] | undefined,
  fromIds: readonly string[],
  toIds: readonly string[],
): PlanVideoRef[] | undefined {
  if (!videos) return undefined;
  const toIndex = new Map(toIds.map((id, index) => [id, index]));
  const next: PlanVideoRef[] = [];
  for (const row of videos) {
    if (row.section !== 'technique') {
      next.push({ ...row });
      continue;
    }
    const id = fromIds[row.index ?? -1];
    if (!id) continue;
    const index = toIndex.get(id);
    if (index == null) continue;
    next.push({ ...row, index });
  }
  return next;
}

function withStructure(
  plan: TrainingNotesPlan,
  blocks: PlanBlock[],
  techniques: TechniqueBlock[],
  games: GameBlock[] | undefined,
  template: LessonTemplateId,
): TrainingNotesPlan {
  const videos = remapTechniqueVideos(
    plan.videos,
    plan.techniques.map((tech) => tech.id),
    techniques.map((tech) => tech.id),
  );
  const next: TrainingNotesPlan = {
    ...plan,
    template,
    blocks,
    techniques,
  };
  if (games) next.games = games;
  else delete next.games;
  if (videos) next.videos = videos;
  else if (plan.videos) next.videos = videos ?? [];
  return next;
}

function adultStarter(plan: TrainingNotesPlan): { blocks: PlanBlock[]; techniques: TechniqueBlock[] } {
  const techniques = plan.techniques.slice(0, 3).map((tech) => ({ ...tech }));
  while (techniques.length < 3) techniques.push(createTechnique());
  return { techniques, blocks: implicitAdultBlocks({ techniques }) };
}

function kidsStarter(plan: TrainingNotesPlan): { blocks: PlanBlock[]; techniques: TechniqueBlock[]; games: GameBlock[] } {
  const techniques = plan.techniques.slice(0, 2).map((tech) => ({ ...tech }));
  while (techniques.length < 2) techniques.push(createTechnique());
  const game = plan.games?.[0] ? { ...plan.games[0] } : createGame();
  const blocks: PlanBlock[] = [
    { kind: 'intro' },
    { kind: 'warmup' },
    { kind: 'technique', id: techniques[0].id },
    { kind: 'game', id: game.id },
    { kind: 'technique', id: techniques[1].id },
    { kind: 'specific' },
    { kind: 'cooldown' },
    { kind: 'closing' },
  ];
  return { techniques, games: [game], blocks };
}

/** Replace the starting blocks. Shared notes on blocks that remain stay put. */
export function applyLessonTemplate(plan: TrainingNotesPlan, template: LessonTemplateId): TrainingNotesPlan {
  if (template === 'competition') return { ...plan, template: 'competition' };
  if (template === 'kids') {
    const starter = kidsStarter(plan);
    return withStructure(plan, starter.blocks, starter.techniques, starter.games, 'kids');
  }
  const starter = adultStarter(plan);
  const next = withStructure(plan, starter.blocks, starter.techniques, undefined, 'adult');
  delete next.games;
  return next;
}

function ensureListed(plan: TrainingNotesPlan): TrainingNotesPlan {
  if (plan.blocks) return plan;
  return { ...plan, template: plan.template ?? 'adult', blocks: implicitAdultBlocks(plan) };
}

function gamesFor(plan: TrainingNotesPlan, blocks: readonly PlanBlock[]): GameBlock[] {
  const byId = new Map((plan.games ?? []).map((game) => [game.id, game]));
  const games: GameBlock[] = [];
  for (const block of blocks) {
    if (block.kind !== 'game') continue;
    const game = byId.get(block.id);
    if (game) games.push(game);
  }
  return games;
}

function techniquesFor(plan: TrainingNotesPlan, blocks: readonly PlanBlock[]): TechniqueBlock[] {
  const byId = new Map(plan.techniques.map((tech) => [tech.id, tech]));
  const techniques: TechniqueBlock[] = [];
  for (const block of blocks) {
    if (block.kind !== 'technique') continue;
    const tech = byId.get(block.id);
    if (tech) techniques.push(tech);
  }
  return techniques;
}

function commitBlocks(plan: TrainingNotesPlan, blocks: PlanBlock[]): TrainingNotesPlan {
  const techniques = techniquesFor(plan, blocks);
  const games = gamesFor(plan, blocks);
  return withStructure(plan, blocks, techniques, games.length ? games : plan.games ? [] : undefined, plan.template ?? 'adult');
}

export function moveLessonBlock(plan: TrainingNotesPlan, index: number, direction: -1 | 1): TrainingNotesPlan {
  const listed = ensureListed(plan);
  const blocks = listed.blocks ? [...listed.blocks] : [];
  const next = index + direction;
  if (index < 0 || index >= blocks.length || next < 0 || next >= blocks.length) return plan;
  const [block] = blocks.splice(index, 1);
  blocks.splice(next, 0, block);
  return commitBlocks(listed, blocks);
}

export function addLessonTechnique(plan: TrainingNotesPlan): TrainingNotesPlan {
  if (techniqueIds(lessonBlocks(plan)).length >= MAX_TECHNIQUES) return plan;
  const listed = ensureListed(plan);
  const tech = createTechnique();
  const blocks = [...(listed.blocks ?? []), { kind: 'technique' as const, id: tech.id }];
  const techniques = [...techniquesFor(listed, listed.blocks ?? []), tech];
  return withStructure(listed, blocks, techniques, gamesFor(listed, blocks), listed.template ?? 'adult');
}

export function addLessonGame(plan: TrainingNotesPlan): TrainingNotesPlan {
  if ((plan.games?.length ?? 0) >= MAX_GAMES && lessonBlocks(plan).filter((block) => block.kind === 'game').length >= MAX_GAMES) {
    return plan;
  }
  const gameCount = lessonBlocks(plan).filter((block) => block.kind === 'game').length;
  if (gameCount >= MAX_GAMES) return plan;
  const listed = ensureListed(plan);
  const game = createGame();
  const blocks = [...(listed.blocks ?? []), { kind: 'game' as const, id: game.id }];
  const games = [...gamesFor(listed, listed.blocks ?? []), game];
  return withStructure(listed, blocks, techniquesFor(listed, blocks), games, listed.template ?? 'adult');
}

export function removeLessonBlock(plan: TrainingNotesPlan, index: number): TrainingNotesPlan {
  const listed = ensureListed(plan);
  const blocks = listed.blocks ? [...listed.blocks] : [];
  if (index < 0 || index >= blocks.length) return plan;
  blocks.splice(index, 1);
  return commitBlocks(listed, blocks);
}

export function blockHeading(block: PlanBlock, techniqueOrdinal: number, gameOrdinal: number): string {
  if (block.kind === 'technique') return `Technique / Drill ${techniqueOrdinal}`;
  if (block.kind === 'game') return gameOrdinal === 1 ? 'Game' : `Game ${gameOrdinal}`;
  if (block.kind === 'intro') return 'Intro';
  if (block.kind === 'warmup') return 'Warm-up';
  if (block.kind === 'specific') return 'Specific Training / Rounds';
  if (block.kind === 'cooldown') return 'Cool down';
  return 'Closing';
}

export function blockKey(block: PlanBlock, index: number): string {
  if (block.kind === 'technique' || block.kind === 'game') return `${block.kind}:${block.id}`;
  return `${block.kind}:${index}`;
}

function cleanGame(value: unknown): { game: GameBlock; repaired: boolean } | null {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  if (!raw) return null;
  const idValue = typeof raw.id === 'string' ? raw.id.trim() : '';
  const id = idValue ? idValue.slice(0, 80) : createId('game');
  const title = clampText(raw.title, TECHNIQUE_TITLE_MAX);
  const notes = clampText(raw.notes, TECHNIQUE_NOTES_MAX);
  const expected = clampText(raw.expected, EXPECTED_MAX);
  const repaired =
    !idValue ||
    raw.id !== id ||
    raw.title !== title ||
    raw.notes !== notes ||
    raw.expected !== expected ||
    (raw.waterBreak !== true && raw.waterBreak !== false);
  return {
    repaired,
    game: { id, title, notes, expected, waterBreak: raw.waterBreak === true },
  };
}

export function sanitizeLessonStructure(
  raw: Record<string, unknown> | null,
  techniques: TechniqueBlock[],
): {
  template: LessonTemplateId | undefined;
  blocks: PlanBlock[] | undefined;
  games: GameBlock[] | undefined;
  techniques: TechniqueBlock[];
  repaired: boolean;
} {
  let repaired = false;
  let template: LessonTemplateId | undefined;
  if (raw && Object.prototype.hasOwnProperty.call(raw, 'template')) {
    if (isLessonTemplate(raw.template)) template = raw.template;
    else repaired = true;
  }

  let games: GameBlock[] | undefined;
  if (raw && Object.prototype.hasOwnProperty.call(raw, 'games')) {
    if (!Array.isArray(raw.games)) {
      games = [];
      repaired = true;
    } else {
      games = [];
      const seen = new Set<string>();
      for (const item of raw.games) {
        const next = cleanGame(item);
        if (!next) {
          repaired = true;
          continue;
        }
        if (next.repaired) repaired = true;
        if (seen.has(next.game.id)) {
          next.game.id = createId('game');
          repaired = true;
        }
        seen.add(next.game.id);
        games.push(next.game);
        if (games.length >= MAX_GAMES) break;
      }
      if (games.length !== raw.games.length) repaired = true;
    }
  }

  const gameIds = new Set((games ?? []).map((game) => game.id));
  const techniqueIdsPresent = new Set(techniques.map((tech) => tech.id));
  let blocks: PlanBlock[] | undefined;
  if (raw && Object.prototype.hasOwnProperty.call(raw, 'blocks')) {
    if (!Array.isArray(raw.blocks)) {
      repaired = true;
    } else if (raw.blocks.length === 0) {
      blocks = [];
    } else {
      const next: PlanBlock[] = [];
      const seenSections = new Set<string>();
      const seenRefs = new Set<string>();
      for (const item of raw.blocks) {
        const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
        if (!row || typeof row.kind !== 'string') {
          repaired = true;
          continue;
        }
        if (isSectionKind(row.kind)) {
          if (seenSections.has(row.kind)) {
            repaired = true;
            continue;
          }
          seenSections.add(row.kind);
          next.push({ kind: row.kind });
          continue;
        }
        if (row.kind !== 'technique' && row.kind !== 'game') {
          repaired = true;
          continue;
        }
        const id = typeof row.id === 'string' ? row.id.trim().slice(0, 80) : '';
        if (!id || seenRefs.has(`${row.kind}:${id}`)) {
          repaired = true;
          continue;
        }
        if (row.kind === 'technique' && !techniqueIdsPresent.has(id)) {
          repaired = true;
          continue;
        }
        if (row.kind === 'game' && !gameIds.has(id)) {
          repaired = true;
          continue;
        }
        seenRefs.add(`${row.kind}:${id}`);
        next.push({ kind: row.kind, id });
      }
      if (!next.length) repaired = true;
      else {
        blocks = next;
        if (next.length !== raw.blocks.length) repaired = true;
      }
    }
  }

  let aligned = techniques;
  if (blocks) {
    const ordered = techniquesFor({ techniques } as TrainingNotesPlan, blocks);
    if (ordered.length !== techniques.length || ordered.some((tech, index) => tech.id !== techniques[index]?.id)) {
      repaired = true;
      aligned = ordered;
    }
    const usedGames = new Set(blocks.filter((block) => block.kind === 'game').map((block) => block.id));
    if (games && games.some((game) => !usedGames.has(game.id))) {
      games = games.filter((game) => usedGames.has(game.id));
      repaired = true;
    }
  }

  return { template, blocks, games, techniques: aligned, repaired };
}
