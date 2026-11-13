/**
 * Practical benchmarks: views, visibility rules and counting.
 * Advantage ships no benchmark list. Every belt starts empty, and the student
 * adds what their instructor gives them (or a coach sends). A list already
 * saved in a student's file is left exactly as it is.
 */

import { beltModeOf, ibjjfAge } from './beltBook.ts';
import { FUNDAMENTAL_LIVE_LEVEL, fundamentalLevelLabel, fundamentalLevelOf, type FundamentalLevel } from './fundamentals.ts';
import type {
  BenchmarkStage,
  ProgressBelt,
  RubricCheckpoint,
  RubricCriterion,
  RubricLevel,
  StudentProfile,
  StudentProgressReport,
  TechniquePolicy,
  TrainingStyle,
} from './progress/types.ts';
import { BENCHMARK_STAGES } from './progress/types.ts';

export const BENCHMARK_DISCLAIMER_SHORT =
  'General guidelines only.';

export const BENCHMARK_DISCLAIMER_MEDIUM =
  'General guidelines only. Advantage does not set requirements and does not include a benchmark list. Your federation and your instructor decide all actual requirements, stripes and promotions. Add the benchmarks your instructor gives you.';

/** Shown on the promotion to black list, beside the age note. */
export const BLACK_BELT_AGE_NOTE = 'Age 19+. An Adult Brown Belt World Champion may be promoted at 18.';

export const IBJJF_RULEBOOK_URL = 'https://ibjjf.com/books-videos';

export const COMPETITION_PROMPT =
  'Competition. Tap to add: results, a game plan, or what you want from competing, only if you compete.';

export const STAGE_SHORT: Record<BenchmarkStage, string> = {
  'stripe-1': 'Stripe 1',
  'stripe-2': 'Stripe 2',
  'stripe-3': 'Stripe 3',
  'stripe-4': 'Stripe 4',
  promotion: 'Promotion',
};


const ADULT_RANK: Partial<Record<ProgressBelt, number>> = {
  white: 0,
  blue: 1,
  purple: 2,
  brown: 3,
  black: 4,
  coral: 5,
  redWhite: 6,
  red: 7,
};

const BROWN_AND_UP = new Set<ProgressBelt>(['brown', 'black', 'coral', 'redWhite', 'red']);

export type LevelInfo = { level: number; categoryId: string };

/** A set means "at least live" (level 3). A map carries the real level. */
export type LearnedIndex = ReadonlySet<string> | ReadonlyMap<string, LevelInfo>;

export type ResolvedPolicy = Required<TechniquePolicy>;

export type BenchmarkView = {
  belt: ProgressBelt;
  trainingStyle: TrainingStyle;
  policy: ResolvedPolicy;
};

export type BenchmarkGroup = {
  id: string;
  title: string;
  rows: RubricCheckpoint[];
};

/** Adult belts that once carried a built-in list. They now start empty. */
export const ADULT_BENCHMARK_BELTS = ['white', 'blue', 'purple', 'brown'] as const satisfies readonly ProgressBelt[];

function emptyAdultLevel(belt: ProgressBelt): RubricLevel {
  return {
    id: `level.${belt}`,
    name: belt.charAt(0).toUpperCase() + belt.slice(1),
    belt,
    checkpoints: [],
    starterAck: true,
  };
}

let cachedLevels: RubricLevel[] | null = null;

/** Empty white through brown levels. No benchmark ships with Advantage. */
export function adultStarterLevels(): RubricLevel[] {
  if (!cachedLevels) {
    cachedLevels = ADULT_BENCHMARK_BELTS.map((belt) => emptyAdultLevel(belt));
  }
  return cachedLevels;
}

/**
 * Heading for a stripe group. Only rows already saved with a stage use it.
 * Plain stage names only; there are no built-in stripe themes.
 */
export function stripeHeading(_belt: ProgressBelt, stage: BenchmarkStage): string {
  return STAGE_SHORT[stage] ?? '';
}

const BENCHMARK_BELT_TOKEN = 'white|blue|purple|brown|black|grey|yellow|orange|green|coral|redWhite|red';
const BENCHMARK_ANCHOR_RE = new RegExp(`^(?:(checkpoint|rubric)\\.)?(${BENCHMARK_BELT_TOKEN})\\.(.+)$`);

export type BenchmarkAnchor = {
  belt: ProgressBelt;
  /** Card to bring into view. A criterion hash opens the checkpoint that holds it. */
  elementId: string;
};

/**
 * Fundamentals links use `checkpoint.{belt}.{slug}`.
 * A short hash such as `blue.my-benchmark` names the same card.
 */
export function benchmarkAnchorFromHash(hash: string): BenchmarkAnchor | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const match = BENCHMARK_ANCHOR_RE.exec(id);
  if (!match) return null;
  const belt = match[2] as ProgressBelt;
  const slug = match[3]?.trim() ?? '';
  if (!slug || slug.includes('#')) return null;
  return { belt, elementId: `checkpoint.${belt}.${slug}` };
}

export function defaultTechniquePolicy(
  belt: ProgressBelt,
  age: number | null,
  mode: 'adult' | 'kids' = 'adult',
): ResolvedPolicy {
  if (mode === 'kids') {
    return {
      straightAnkleLock: age != null && age >= 16,
      wristLocks: false,
      legLocks: false,
      heelHooks: false,
      competition: false,
    };
  }
  const rank = ADULT_RANK[belt] ?? 0;
  return {
    straightAnkleLock: age == null || age >= 16,
    wristLocks: rank >= 1,
    legLocks: false,
    heelHooks: false,
    competition: false,
  };
}

export function effectiveTechniquePolicy(
  profile: StudentProfile,
  belt: ProgressBelt,
  age: number | null,
  mode: 'adult' | 'kids' = 'adult',
): ResolvedPolicy {
  const defaults = defaultTechniquePolicy(belt, age, mode);
  const saved = profile.techniquePolicy ?? {};
  return {
    straightAnkleLock: saved.straightAnkleLock ?? defaults.straightAnkleLock,
    wristLocks: saved.wristLocks ?? defaults.wristLocks,
    legLocks: saved.legLocks ?? defaults.legLocks,
    heelHooks: saved.heelHooks ?? defaults.heelHooks,
    competition: saved.competition ?? defaults.competition,
  };
}

export type AgeIllegalTechnique = {
  catalogId: string;
  name: string;
  policy: keyof TechniquePolicy;
  reason: string;
};

/** Techniques hidden because they are illegal at this age. A saved override brings one back. */
export function ageIllegalTechniques(report: StudentProgressReport): AgeIllegalTechnique[] {
  const mode = beltModeOf(report);
  const year = report.beltBook?.birthYear;
  const age = typeof year === 'number' ? ibjjfAge(year) : null;
  const policy = effectiveTechniquePolicy(report.profile, report.profile.belt, age, mode);
  const child = mode === 'kids' || (age != null && age < 16);
  const rows: AgeIllegalTechnique[] = [];
  if (child && !policy.straightAnkleLock) {
    rows.push({
      catalogId: 'sub.straight-ankle-lock',
      name: 'Straight ankle lock',
      policy: 'straightAnkleLock',
      reason: 'Illegal under 16.',
    });
  }
  if (mode === 'kids' && !policy.wristLocks) {
    rows.push({ catalogId: 'sub.wrist-lock', name: 'Wrist lock', policy: 'wristLocks', reason: 'Illegal for kids.' });
  }
  if (mode === 'kids' && !policy.legLocks) {
    rows.push({ catalogId: '', name: 'Leg locks', policy: 'legLocks', reason: 'Illegal for this age.' });
  }
  if (mode === 'kids' && !policy.heelHooks) {
    rows.push({ catalogId: '', name: 'Heel hooks', policy: 'heelHooks', reason: 'Illegal for this age.' });
  }
  return rows;
}

export function benchmarkView(report: StudentProgressReport): BenchmarkView {
  const mode = beltModeOf(report);
  const year = report.beltBook?.birthYear;
  const age = typeof year === 'number' ? ibjjfAge(year) : null;
  return {
    belt: report.profile.belt,
    trainingStyle: report.profile.trainingStyle ?? (mode === 'kids' ? 'gi' : 'both'),
    policy: effectiveTechniquePolicy(report.profile, report.profile.belt, age, mode),
  };
}

export function benchmarkVisible(row: RubricCheckpoint, view: BenchmarkView): boolean {
  if (row.policy === 'straight-ankle' && !view.policy.straightAnkleLock) return false;
  if (row.policy === 'wrist-lock' && !view.policy.wristLocks) return false;
  if (row.policy === 'competition' && !view.policy.competition) return false;
  if (row.policy === 'leg-lock' || row.policy === 'heel-hook') {
    if (view.trainingStyle === 'gi') return false;
    const heelOpens = row.policy === 'leg-lock' && view.policy.heelHooks && BROWN_AND_UP.has(view.belt);
    if (row.policy === 'heel-hook' && (!view.policy.heelHooks || !BROWN_AND_UP.has(view.belt))) return false;
    if (row.policy === 'leg-lock' && !view.policy.legLocks && !heelOpens) return false;
  }
  const style = row.style ?? 'both';
  if (style === 'nogi' && view.trainingStyle === 'gi') return false;
  if (style === 'gi' && view.trainingStyle === 'nogi' && !row.noGiVariant?.trim()) return false;
  return true;
}

export function checkpointsForProgress(rows: readonly RubricCheckpoint[], view: BenchmarkView): RubricCheckpoint[] {
  return rows.filter((row) => row.optional !== true && benchmarkVisible(row, view));
}

export function benchmarkGroups(rows: readonly RubricCheckpoint[], belt: ProgressBelt): BenchmarkGroup[] {
  const groups: BenchmarkGroup[] = [];
  for (const stage of BENCHMARK_STAGES) {
    const staged = rows.filter((row) => row.stage === stage);
    if (!staged.length) continue;
    groups.push({ id: stage, title: stripeHeading(belt, stage), rows: staged });
  }
  const loose = rows.filter((row) => !row.stage);
  if (loose.length) groups.push({ id: 'yours', title: groups.length ? 'Your benchmarks' : '', rows: loose });
  return groups;
}

export function benchmarkDisplayName(row: RubricCheckpoint, training: TrainingStyle): string {
  if (training === 'nogi' && (row.style ?? 'both') === 'gi' && row.noGiVariant) return row.noGiVariant;
  return row.name;
}

export function benchmarkNoGiLine(row: RubricCheckpoint, training: TrainingStyle): string {
  const text = row.noGiVariant?.trim() ?? '';
  if (training === 'gi' || !text) return '';
  return /^no-gi\b/i.test(text) ? text : `No-gi: ${text}`;
}

export function visibleTechniqueNames(row: RubricCheckpoint, training: TrainingStyle): string[] {
  const names: string[] = [];
  for (const criterion of row.criteria) {
    for (const ref of criterion.techniqueRefs) {
      const style = ref.style ?? 'both';
      if (training === 'gi' && style === 'nogi') continue;
      if (training === 'nogi' && style === 'gi') continue;
      if (ref.name) names.push(ref.name);
    }
  }
  return names;
}

export function benchmarkCountHint(row: RubricCheckpoint): string {
  const parts: string[] = [];
  for (const criterion of row.criteria) {
    if (criterion.catalogNeed) {
      const label = fundamentalLevelLabel(criterion.catalogNeed.level);
      const kind = criterion.catalogNeed.categoryId === 'submissions' ? 'submission' : 'fundamentals line';
      const noun = criterion.catalogNeed.count === 1 ? kind : `${kind}s`;
      parts.push(`Counts when ${criterion.catalogNeed.count} ${noun} ${criterion.catalogNeed.count === 1 ? 'is' : 'are'} at ${label}.`);
      continue;
    }
    if (!criterion.techniqueRefs.length) continue;
    const target = criterion.targetLevel ?? criterion.techniqueRefs.find((ref) => ref.targetLevel)?.targetLevel ?? FUNDAMENTAL_LIVE_LEVEL;
    const label = fundamentalLevelLabel(target as FundamentalLevel);
    if (criterion.match === 'all') parts.push(`All of these, at ${label} or higher.`);
    else if (target !== FUNDAMENTAL_LIVE_LEVEL) parts.push(`Any one, at ${label} or higher.`);
  }
  return parts.join(' ');
}

export function catalogLevelMap(report: StudentProgressReport): Map<string, LevelInfo> {
  const map = new Map<string, LevelInfo>();
  for (const entry of report.checklist) {
    if (entry.hidden) continue;
    const key = entry.catalogItemId || entry.id;
    if (!key) continue;
    const level = fundamentalLevelOf(entry);
    const prev = map.get(key);
    if (!prev || level > prev.level) map.set(key, { level, categoryId: entry.categoryId });
  }
  return map;
}

function isLevelMap(learned: LearnedIndex): learned is ReadonlyMap<string, LevelInfo> {
  return typeof (learned as ReadonlyMap<string, LevelInfo>).get === 'function';
}

function levelOf(learned: LearnedIndex, id: string): number {
  if (!id) return 0;
  if (!isLevelMap(learned)) return learned.has(id) ? FUNDAMENTAL_LIVE_LEVEL : 0;
  return learned.get(id)?.level ?? 0;
}

function autoCounts(row: RubricCriterion, learned: LearnedIndex): boolean {
  const target = row.targetLevel ?? FUNDAMENTAL_LIVE_LEVEL;
  const refs = row.techniqueRefs.filter((ref) => ref.id);
  let refOk = false;
  if (refs.length) {
    const ready = refs.filter((ref) => levelOf(learned, ref.id) >= (ref.targetLevel ?? target));
    refOk = row.match === 'all' ? ready.length === refs.length : ready.length > 0;
  }
  let needOk = false;
  if (row.catalogNeed && isLevelMap(learned)) {
    let count = 0;
    for (const info of learned.values()) {
      if (row.catalogNeed.categoryId && info.categoryId !== row.catalogNeed.categoryId) continue;
      if (info.level >= row.catalogNeed.level) count += 1;
    }
    needOk = count >= row.catalogNeed.count;
  }
  if (refs.length && row.catalogNeed) return refOk || needOk;
  if (row.catalogNeed) return needOk;
  return refOk;
}

export function criterionCounts(row: RubricCriterion, learned: LearnedIndex): boolean {
  if (row.met === true) return true;
  return autoCounts(row, learned);
}

export function criterionFromFundamentals(row: RubricCriterion, learned: LearnedIndex): boolean {
  if (row.met === true) return false;
  return autoCounts(row, learned);
}
