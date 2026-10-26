/**
 * Adult practical-benchmark starters for white through brown.
 * Black and above stay time based. Kids belts are not changed here.
 * A saved list is left alone. Empty brown from the old file, and any missing level, receive these.
 */

import { ibjjfAge } from './beltBook.ts';
import { FUNDAMENTAL_LIVE_LEVEL, fundamentalLevelLabel, fundamentalLevelOf, type FundamentalLevel } from './fundamentals.ts';
import { FUNDAMENTALS_CATALOG } from './progress/catalog.ts';
import type {
  BenchmarkPolicy,
  BenchmarkStage,
  CatalogNeed,
  ProgressBelt,
  RubricCheckpoint,
  RubricCriterion,
  RubricLevel,
  StudentProfile,
  StudentProgressReport,
  TechniquePolicy,
  TechniqueRef,
  TrainingStyle,
} from './progress/types.ts';
import { BENCHMARK_STAGES } from './progress/types.ts';

export const BENCHMARK_DISCLAIMER_SHORT =
  'Suggested benchmarks are general guidance, reviewed by black belts. Always review them with your coach, who has the final say.';

export const BENCHMARK_DISCLAIMER_MEDIUM =
  'These Practical Benchmarks are general suggestions based on commonly accepted jiu-jitsu training, and they have been reviewed by black belts. They are a starting point, not a requirement or a promotion standard. Every academy and coach sees things differently, so review and adjust them with your coach, who has the final say on your progress.';

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

const STRIPE_HEADINGS: Partial<Record<ProgressBelt, Record<BenchmarkStage, string>>> = {
  white: {
    'stripe-1': 'Stripe 1 — First safe positions',
    'stripe-2': 'Stripe 2 — Escapes grow, guards widen',
    'stripe-3': 'Stripe 3 — More positions, linked attacks, live starts',
    'stripe-4': 'Stripe 4 — Back, standing, and first leg lock',
    promotion: 'Promotion to Blue belt',
  },
  blue: {
    'stripe-1': 'Stripe 1 — Close the gaps in your defense',
    'stripe-2': 'Stripe 2 — Build a guard system',
    'stripe-3': 'Stripe 3 — Top game: passing, pressure and pins',
    'stripe-4': 'Stripe 4 — Back, standing and the first leg attacks',
    promotion: 'Promotion to Purple belt',
  },
  purple: {
    'stripe-1': 'Stripe 1 — Close the gaps in your defense',
    'stripe-2': 'Stripe 2 — Heavy, sequential top game',
    'stripe-3': 'Stripe 3 — Standing, counters and scrambles',
    'stripe-4': 'Stripe 4 — Game plan, finishing and teaching',
    promotion: 'Promotion to Brown belt',
  },
  brown: {
    'stripe-1': 'Stripe 1 — Look at your own game honestly',
    'stripe-2': 'Stripe 2 — Connect defense and offense',
    'stripe-3': 'Stripe 3 — Adapt your game',
    'stripe-4': 'Stripe 4 — Share what you know',
    promotion: 'Promotion to Black belt',
  },
};

const NAMES = new Map(
  FUNDAMENTALS_CATALOG.categories.flatMap((category) => category.items.map((item) => [item.id, item.name] as const)),
);

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

type Level = 1 | 2 | 3 | 4 | 5;

type Spec = {
  slug: string;
  name: string;
  stage: BenchmarkStage;
  refs?: string[];
  giRefs?: string[];
  levels?: Record<string, Level>;
  match?: 'all';
  target?: Level;
  noGi?: string;
  policy?: BenchmarkPolicy;
  catalogNeed?: CatalogNeed;
  rulebook?: boolean;
  optional?: boolean;
};

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

function techniqueName(id: string): string {
  const name = NAMES.get(id);
  if (!name) throw new Error(`Unknown fundamentals id ${id}`);
  return name;
}

function idsOf(categoryId: string): string[] {
  const category = FUNDAMENTALS_CATALOG.categories.find((item) => item.id === categoryId);
  if (!category) throw new Error(`Unknown fundamentals category ${categoryId}`);
  return category.items.map((item) => item.id);
}

function buildCriterion(belt: ProgressBelt, spec: Spec): RubricCriterion | null {
  const ids = spec.refs ?? [];
  if (!ids.length && !spec.catalogNeed) return null;
  const criterion: RubricCriterion = {
    id: `rubric.${belt}.${spec.slug}`,
    requirement: '',
    techniqueRefs: ids.map((id) => {
      const ref: TechniqueRef = { id, name: techniqueName(id) };
      if (spec.giRefs?.includes(id)) ref.style = 'gi';
      const level = spec.levels?.[id];
      if (level) ref.targetLevel = level;
      return ref;
    }),
    met: null,
    note: '',
  };
  if (spec.match === 'all') criterion.match = 'all';
  if (spec.target) criterion.targetLevel = spec.target;
  if (spec.catalogNeed) criterion.catalogNeed = spec.catalogNeed;
  return criterion;
}

function buildCheckpoint(belt: ProgressBelt, spec: Spec): RubricCheckpoint {
  const criterion = buildCriterion(belt, spec);
  const row: RubricCheckpoint = {
    id: `checkpoint.${belt}.${spec.slug}`,
    name: spec.name,
    met: null,
    note: '',
    criteria: criterion ? [criterion] : [],
    stage: spec.stage,
  };
  if (spec.noGi) row.noGiVariant = spec.noGi;
  if (spec.policy) row.policy = spec.policy;
  if (spec.rulebook) row.rulebook = true;
  if (spec.optional) row.optional = true;
  return row;
}

function adultLevel(belt: ProgressBelt, specs: Spec[]): RubricLevel {
  return {
    id: `level.${belt}`,
    name: belt.charAt(0).toUpperCase() + belt.slice(1),
    belt,
    checkpoints: specs.map((spec) => buildCheckpoint(belt, spec)),
    starterAck: true,
  };
}

const PASSES = idsOf('passes');
const TAKEDOWNS = idsOf('takedowns');
const SUBMISSIONS = idsOf('submissions');
const GI_CROSS = ['sub.cross-collar'];

const WHITE_SPECS: Spec[] = [
  {
    slug: 's1-positions',
    stage: 'stripe-1',
    name: 'Name the four basic control positions and hold each against a cooperative partner: closed guard, side control, mount, back control.',
    refs: ['pos.closed-guard', 'pos.side-control', 'pos.mount', 'pos.back-control'],
    target: 2,
    noGi: 'No-gi uses underhooks and body position instead of lapel and sleeve grips.',
  },
  {
    slug: 's1-escapes',
    stage: 'stripe-1',
    name: 'Have one way out of mount and one way out of side control in drilling.',
    refs: ['escape.mount', 'escape.side-control'],
    target: 2,
  },
  {
    slug: 's1-guard-attack',
    stage: 'stripe-1',
    name: 'From closed guard, perform one sweep and one submission in drilling.',
    refs: ['sweep.scissor', 'sweep.hip-bump', 'sub.armbar-guard', 'sub.kimura'],
    target: 2,
    noGi: 'Scissor sweep usually uses collar and sleeve grips. No-gi uses the head, an underhook, and wrist control.',
  },
  {
    slug: 's1-pass',
    stage: 'stripe-1',
    name: 'Open closed guard from the top and pass it one way in drilling.',
    refs: ['pass.knee-slice'],
    target: 2,
    noGi: 'Gi grip breaks become pummeling, underhooks, or head-and-arm in no-gi.',
  },
  {
    slug: 's1-conduct',
    stage: 'stripe-1',
    name: 'Tap early, release the moment your partner taps, and tell your partner about injuries or intensity. Arrive with clean gear and short nails.',
  },
  {
    slug: 's2-movement',
    stage: 'stripe-2',
    name: 'Body movement. Show breakfalls, shrimping, bridging and a technical lift/stand-up. (One requirement, due before the third stripe.)',
    refs: ['move.breakfalls', 'move.shrimp', 'move.bridge', 'move.technical-standup'],
    match: 'all',
    target: 3,
  },
  {
    slug: 's2-escape-resist',
    stage: 'stripe-2',
    name: 'Escape mount and side control with two different options each against a partner who starts to resist.',
    refs: ['escape.mount', 'escape.side-control'],
    target: 3,
  },
  {
    slug: 's2-back',
    stage: 'stripe-2',
    name: 'In back control, protect your neck with hand-fighting and work a basic escape; hold seatbelt-and-hooks control yourself for a count.',
    refs: ['escape.back', 'pos.back-control'],
    target: 2,
    noGi: 'The gi adds collar defenses. No-gi is neck and arm protection only.',
  },
  {
    slug: 's2-guards',
    stage: 'stripe-2',
    name: 'Get to and keep half guard and an open or butterfly-style guard in drilling, and settle back to closed guard.',
    refs: ['pos.half-guard', 'pos.open-guard'],
    target: 2,
    noGi: 'Underhooks, overhooks, wrist control, head-and-arm control, and butterfly hooks.',
  },
  {
    slug: 's2-second-attack',
    stage: 'stripe-2',
    name: 'Add a second sweep and a second attack from guard (an arm lock or a choke).',
    refs: ['sweep.tripod', 'sweep.pendulum', 'sweep.flower', 'sub.guillotine', 'sub.triangle', 'sub.cross-collar'],
    giRefs: GI_CROSS,
    target: 2,
    noGi: 'Guillotine, triangle, or arm-in choke.',
  },
  {
    slug: 's2-two-passes',
    stage: 'stripe-2',
    name: 'Open closed guard and pass it two ways (e.g. one kneeling, one standing).',
    refs: ['pass.knee-slice', 'pass.torreando', 'pass.stack'],
    target: 2,
    noGi: 'Gi grip breaks become pummeling, underhooks, a body lock, or head-and-arm in no-gi.',
  },
  {
    slug: 's3-kob',
    stage: 'stripe-3',
    name: 'Hold knee on belly and move between mount, side control, knee on belly and back while keeping control. Escape knee on belly when you are under it.',
    refs: ['pos.knee-on-belly', 'pos.mount', 'pos.side-control'],
    target: 3,
  },
  {
    slug: 's3-defense',
    stage: 'stripe-3',
    name: 'Defensive movement. Show guard retention, submission defense and sprawl. (One requirement, due before the fourth stripe.)',
    refs: ['def.guard-retention', 'def.submission-defense', 'def.sprawl'],
    match: 'all',
    target: 3,
    noGi: 'The gi adds grip-fighting defenses. No-gi uses frames, hips, underhooks, and hand-fighting.',
  },
  {
    slug: 's3-triangle',
    stage: 'stripe-3',
    name: 'Triangle from closed guard, with one connected follow-up (e.g. armbar).',
    refs: ['sub.triangle', 'sub.armbar-guard'],
    target: 3,
  },
  {
    slug: 's3-half',
    stage: 'stripe-3',
    name: 'Half guard both ways: pass it from the top; recover guard, sweep, or take the back from the bottom.',
    refs: ['pos.half-guard', 'pass.knee-slice'],
    target: 3,
    noGi: 'Underhook-based half-guard options replace sleeve and collar grips.',
  },
  {
    slug: 's3-arm-attack',
    stage: 'stripe-3',
    name: 'From the top, finish an arm attack (kimura, Americana, or armbar) from side control, mount or knee on belly.',
    refs: ['sub.kimura', 'sub.americana', 'sub.armbar-guard'],
    target: 3,
  },
  {
    slug: 's3-live',
    stage: 'stripe-3',
    name: 'Start live rolling. Positional rolls with a specific start and agreed intensity, then free rolling, keeping control: no cranking, no slams. (Default start: stripe 3. Adjustable per student or coach.)',
  },
  {
    slug: 's4-back-choke',
    stage: 'stripe-4',
    name: 'Take the back from at least two routes and finish a choke from back control.',
    refs: ['pos.back-control', 'sub.rear-naked-choke'],
    target: 3,
    noGi: 'Rear naked choke, or a bow-and-arrow-style alternative.',
  },
  {
    slug: 's4-arm-drag',
    stage: 'stripe-4',
    name: 'Arm drag to the back or to an angle, from standing or sitting.',
    refs: ['td.arm-drag'],
    target: 2,
    noGi: 'Wrist control and head-and-arm replace sleeve grips.',
  },
  {
    slug: 's4-single',
    stage: 'stripe-4',
    name: 'Single leg: stance, a safe entry, and a finish against a partner who resists a little (or a double leg if your coach prefers).',
    refs: ['td.single-leg', 'td.double-leg'],
    target: 2,
    noGi: 'Wrestling ties replace collar and sleeve grips. Keep your head on the inside of the hip.',
  },
  {
    slug: 's4-open-pass',
    stage: 'stripe-4',
    name: 'Pass an open guard from standing with one speed-based and one pressure-based pass, and break closed guard standing.',
    refs: ['pass.torreando', 'pass.knee-slice', 'pass.stack'],
    target: 3,
    noGi: 'Pants and sleeve grips become a body lock, underhooks, or head-and-arm in no-gi.',
  },
  {
    slug: 's4-sweep',
    stage: 'stripe-4',
    name: 'Use an open-guard or butterfly-style sweep with a follow-up to top or standing.',
    refs: ['sweep.tripod', 'sweep.flower'],
    target: 3,
    noGi: 'Butterfly hooks and underhooks. Skip sleeve and lapel variations.',
  },
  {
    slug: 's4-ankle',
    stage: 'stripe-4',
    name: 'Straight ankle lock and its defense. (Default: on for adults (16+); off for under-16; adjustable.) Do not turn toward the free foot; no heel hooks or knee reaping by default.',
    refs: ['sub.straight-ankle-lock'],
    target: 2,
    policy: 'straight-ankle',
  },
  {
    slug: 'promo-hierarchy',
    stage: 'promotion',
    name: 'Explain the basic position hierarchy and move through the major positions from top and bottom with a plan.',
    refs: ['pos.closed-guard', 'pos.open-guard', 'pos.half-guard', 'pos.mount', 'pos.side-control', 'pos.back-control', 'pos.knee-on-belly'],
    target: 3,
  },
  {
    slug: 'promo-keep-guard',
    stage: 'promotion',
    name: 'Keep or recover guard against a resisting partner for a round.',
    refs: ['pos.closed-guard', 'pos.open-guard', 'def.guard-retention'],
    levels: { 'pos.closed-guard': 4, 'pos.open-guard': 3, 'def.guard-retention': 3 },
    noGi: 'Hip movement and frames matter more without grips.',
  },
  {
    slug: 'promo-escape',
    stage: 'promotion',
    name: 'Escape mount, side control and back control against a resisting partner, and defend common submissions.',
    refs: ['escape.mount', 'escape.side-control', 'escape.back', 'def.submission-defense'],
    levels: { 'escape.mount': 4, 'escape.side-control': 4, 'escape.back': 3, 'def.submission-defense': 3 },
  },
  {
    slug: 'promo-hold',
    stage: 'promotion',
    name: 'Hold mount, side control and back control against resistance, with one finish from each (arm lock or choke).',
    refs: ['pos.mount', 'pos.side-control', 'pos.back-control', 'sub.kimura', 'sub.rear-naked-choke'],
    target: 3,
    noGi: 'A cross collar from mount becomes an arm triangle or a head-and-arm finish.',
  },
  {
    slug: 'promo-sets',
    stage: 'promotion',
    name: 'Have a reliable sweep set (2–3) and submission set (2–3) from guard against resistance.',
    refs: ['sweep.scissor', 'sweep.hip-bump', 'sweep.tripod', 'sub.armbar-guard', 'sub.triangle', 'sub.kimura'],
    target: 3,
    noGi: 'Collar and sleeve options have no-gi equivalents.',
  },
  {
    slug: 'promo-pass',
    stage: 'promotion',
    name: 'Pass guard against resistance with 2–3 reliable passes, at least one standing and one pressure or knee-based.',
    refs: ['pass.knee-slice', 'pass.torreando', 'pass.stack'],
    target: 3,
  },
  {
    slug: 'promo-standing',
    stage: 'promotion',
    name: 'Standing: sprawl against a shot, finish one takedown (single leg or arm drag to a finish), and use a safe guard pull (not a jump to closed guard).',
    refs: ['td.single-leg', 'td.double-leg', 'td.hip-throw', 'td.arm-drag', 'def.sprawl'],
    target: 3,
    noGi: 'Wrestling ties in no-gi. Collar and sleeve grips and judo-style throws in the gi.',
  },
  {
    slug: 'promo-half',
    stage: 'promotion',
    name: 'Be comfortable in half guard on both sides, top and bottom.',
    refs: ['pos.half-guard'],
    target: 3,
    noGi: 'Underhook-focused in no-gi.',
  },
  {
    slug: 'promo-rounds',
    stage: 'promotion',
    name: 'Complete rolling rounds with control against partners of different sizes and experience: sweep, pass or submit sometimes, and recover or tap safely when behind.',
  },
  {
    slug: 'promo-conduct',
    stage: 'promotion',
    name: "Behave like a blue belt: tap early, roll with control, help newer partners, keep clean gear and short nails, and know your gym's rules and which techniques are legal for white belts.",
    rulebook: true,
  },
];

const BLUE_SPECS: Spec[] = [
  {
    slug: 's1-escapes',
    stage: 'stripe-1',
    name: 'Escape heavy pins (mount, side control) and the back against a stronger partner who really resists, with a second option for each.',
    refs: ['escape.mount', 'escape.side-control', 'escape.back'],
    target: 4,
  },
  {
    slug: 's1-defend',
    stage: 'stripe-1',
    name: 'Defend submissions early (arm locks, triangle, chokes) before they are tight, stay calm, and escape them.',
    refs: ['def.submission-defense'],
    target: 4,
    noGi: 'Use your arms and legs to make space, move your hips, and control your partner\'s hands.',
  },
  {
    slug: 's1-half-bottom',
    stage: 'stripe-1',
    name: 'Keep your guard from being passed. Half guard from the bottom: a way to recover, a sweep and a back take.',
    refs: ['pos.half-guard'],
    target: 4,
    noGi: 'Underhook and knee-shield options instead of sleeve and collar grips.',
  },
  {
    slug: 's1-half-top',
    stage: 'stripe-1',
    name: 'Half guard from the top: pass it, and stop your partner from getting their arm under yours (the underhook).',
    refs: ['pass.knee-slice'],
    target: 4,
  },
  {
    slug: 's1-turtle',
    stage: 'stripe-1',
    name: 'Properly utilize Turtle Position: control it from the top (take the back or finish a choke) and recover guard when you are the one turtled.',
    refs: ['pos.turtle'],
    target: 3,
  },
  {
    slug: 's1-conduct',
    stage: 'stripe-1',
    name: 'Roll lighter with newer students, ask for feedback after rounds, and keep your gear and nails clean.',
  },
  {
    slug: 's2-open',
    stage: 'stripe-2',
    name: 'Pick one open guard you trust and show a sweep, a submission and a recovery from it.',
    refs: ['pos.open-guard', 'sweep.tripod', 'sweep.pendulum', 'sweep.flower'],
    levels: { 'pos.open-guard': 4, 'sweep.tripod': 3, 'sweep.pendulum': 3, 'sweep.flower': 3 },
    noGi: 'Butterfly, single-leg X, underhooks, and wrist control.',
  },
  {
    slug: 's2-butterfly',
    stage: 'stripe-2',
    name: 'Butterfly guard: hooks, underhook and a sweep, with a follow-up to the top.',
    refs: ['pos.butterfly-guard', 'sweep.butterfly'],
    target: 3,
  },
  {
    slug: 's2-omoplata',
    stage: 'stripe-2',
    name: 'Omoplata with a connected option: armbar to omoplata, or triangle to omoplata.',
    refs: ['sub.omoplata', 'sub.armbar-guard', 'sub.triangle'],
    levels: { 'sub.omoplata': 3, 'sub.armbar-guard': 4, 'sub.triangle': 4 },
  },
  {
    slug: 's2-connect',
    stage: 'stripe-2',
    name: 'Connect two guard attacks: sweep to submission, or submission to sweep.',
    refs: ['sub.armbar-guard', 'sub.triangle', 'sub.kimura', 'sub.guillotine'],
    target: 4,
  },
  {
    slug: 's2-retention',
    stage: 'stripe-2',
    name: 'Keeping your guard: stop a good passer from getting past, and get your guard back when you are being passed.',
    refs: ['def.guard-retention'],
    target: 4,
  },
  {
    slug: 's2-your-guard',
    stage: 'stripe-2',
    name: 'Your guard: name the guard you play most and explain a sweep, a submission, and what you do when it is passed.',
  },
  {
    slug: 's3-pass',
    stage: 'stripe-3',
    name: 'Pass open guard against a resisting partner with two different styles (speed-based and pressure-based).',
    refs: ['pass.torreando', 'pass.knee-slice'],
    target: 4,
    noGi: 'Pants and sleeve grips become a body lock, underhooks, or head-and-arm in no-gi.',
  },
  {
    slug: 's3-pins',
    stage: 'stripe-3',
    name: 'North-south and scarf hold: hold each, escape each, and have one attack from each.',
    refs: ['pos.north-south', 'pos.scarf-hold'],
    target: 3,
  },
  {
    slug: 's3-mount',
    stage: 'stripe-3',
    name: 'Mount and side control: hold them against resistance and finish with a connected pair (e.g. kimura to armbar).',
    refs: ['pos.mount', 'pos.side-control', 'sub.kimura'],
    target: 4,
    noGi: 'Arm triangle, or head-and-arm control.',
  },
  {
    slug: 's3-americana',
    stage: 'stripe-3',
    name: 'Americana and a connected option from the top.',
    refs: ['sub.americana'],
    target: 3,
  },
  {
    slug: 's3-kob',
    stage: 'stripe-3',
    name: 'Knee on belly: use it to force a reaction, then take mount, side control or an arm attack.',
    refs: ['pos.knee-on-belly'],
    target: 4,
  },
  {
    slug: 's3-headlock',
    stage: 'stripe-3',
    name: 'Escape a headlock and a heavy-pressure pin (scarf hold, north-south, knee on belly).',
    refs: ['escape.headlock'],
    target: 3,
  },
  {
    slug: 's4-back',
    stage: 'stripe-4',
    name: 'Take the back from three routes, keep it against an escape, and finish with a second option after the rear naked choke.',
    refs: ['pos.back-control', 'sub.rear-naked-choke'],
    target: 4,
    noGi: 'Rear naked choke and arm-trap options work in no-gi.',
  },
  {
    slug: 's4-takedowns',
    stage: 'stripe-4',
    name: 'Takedowns: connect a single leg, a double leg, and an arm drag or hip throw to a finish.',
    refs: TAKEDOWNS,
    target: 3,
    noGi: 'Wrestling ties replace collar and sleeve grips.',
  },
  {
    slug: 's4-sprawl',
    stage: 'stripe-4',
    name: 'Takedown defense and scrambles: sprawl, front headlock (guillotine) and recover.',
    refs: ['def.sprawl', 'sub.guillotine'],
    levels: { 'def.sprawl': 4, 'sub.guillotine': 3 },
  },
  {
    slug: 's4-ankle',
    stage: 'stripe-4',
    name: 'Straight ankle lock at depth: set up and finish, and defend it. Turning toward the free foot is illegal until brown. (On by default for 16+; adjustable.)',
    refs: ['sub.straight-ankle-lock'],
    target: 3,
    policy: 'straight-ankle',
  },
  {
    slug: 's4-wrist',
    stage: 'stripe-4',
    name: 'Wrist lock and compression lock awareness (legal from blue): know them, defend them, and use only if your coach teaches them.',
    refs: ['sub.wrist-lock'],
    target: 2,
    policy: 'wrist-lock',
  },
  {
    slug: 's4-review',
    stage: 'stripe-4',
    name: 'Review your own rolls: pick three things you keep getting caught in and make a plan for each.',
  },
  {
    slug: 'promo-connect',
    stage: 'promotion',
    name: 'Connect your moves. Show three connected sequences (guard, top, back) where each move leads to a second option.',
  },
  {
    slug: 'promo-game',
    stage: 'promotion',
    name: 'Your go-to game. Name a main guard, a main pass, a main pin, and a main submission, and show them live.',
  },
  {
    slug: 'promo-guard',
    stage: 'promotion',
    name: 'Guard. Keep or recover guard against better partners for a full round, and use two guards well.',
    refs: ['pos.closed-guard', 'pos.open-guard', 'pos.half-guard', 'def.guard-retention'],
    target: 4,
  },
  {
    slug: 'promo-bottom',
    stage: 'promotion',
    name: 'Sweeps and submissions from the bottom. Three sweeps and three submissions you hit against resistance.',
    refs: ['sweep.scissor', 'sweep.hip-bump', 'sweep.tripod', 'sweep.pendulum', 'sweep.flower', 'sub.armbar-guard', 'sub.triangle', 'sub.kimura', 'sub.omoplata'],
    target: 4,
    noGi: 'Collar and sleeve options have no-gi equivalents.',
  },
  {
    slug: 'promo-pass',
    stage: 'promotion',
    name: 'Passing. Pass the main guards against resistance with two or three reliable passes, including half guard.',
    refs: PASSES,
    target: 4,
  },
  {
    slug: 'promo-top',
    stage: 'promotion',
    name: 'Top control and finishing. Hold mount, side control, knee on belly, north-south or scarf hold against resistance and finish from each.',
    refs: ['pos.mount', 'pos.side-control', 'pos.knee-on-belly', 'sub.kimura', 'sub.americana'],
    target: 4,
  },
  {
    slug: 'promo-back',
    stage: 'promotion',
    name: 'Back. Take it, keep it and finish it against a partner who knows what you are doing.',
    refs: ['pos.back-control', 'sub.rear-naked-choke'],
    target: 4,
  },
  {
    slug: 'promo-defense',
    stage: 'promotion',
    name: 'Defend and escape. Escape mount, side control, back and common submissions against resistance.',
    refs: ['escape.mount', 'escape.side-control', 'escape.back', 'def.submission-defense'],
    target: 4,
  },
  {
    slug: 'promo-standing',
    stage: 'promotion',
    name: 'Standing. Finish a takedown or choose a safe guard pull, and defend a shot.',
    refs: [...TAKEDOWNS, 'def.sprawl'],
    levels: { 'td.single-leg': 3, 'td.double-leg': 3, 'td.arm-drag': 3, 'td.hip-throw': 3, 'def.sprawl': 4 },
  },
  {
    slug: 'promo-share',
    stage: 'promotion',
    name: 'Roll with perspective and share. Roll with partners across sizes and belts, explain one technique clearly to a newer student, and keep your conduct and gear standards.',
  },
];

const PURPLE_SPECS: Spec[] = [
  {
    slug: 's1-escapes',
    stage: 'stripe-1',
    name: 'Escape heavy pins (mount, side control, north-south, scarf hold, knee on belly) and the back against strong opponents who attack back.',
    refs: ['escape.mount', 'escape.side-control', 'escape.back', 'pos.north-south', 'pos.scarf-hold', 'pos.knee-on-belly'],
    target: 4,
  },
  {
    slug: 's1-defend',
    stage: 'stripe-1',
    name: 'Defend submissions early, before they are tight, and escape the ones you do get caught in.',
    refs: ['def.submission-defense'],
    target: 4,
  },
  {
    slug: 's1-retention',
    stage: 'stripe-1',
    name: 'Keep your guard from being passed, and get it back when you are passed.',
    refs: ['def.guard-retention', 'pos.open-guard'],
    target: 4,
  },
  {
    slug: 's1-turtle',
    stage: 'stripe-1',
    name: 'Properly utilize Turtle Position: defend it, and recover to guard, sit up or stand.',
    refs: ['pos.turtle'],
    target: 4,
  },
  {
    slug: 's1-leglock',
    stage: 'stripe-1',
    name: 'Leg-entanglement defense (off by default): recognize and defend knee bars, toe holds and (no-gi) heel hooks, at the level your academy allows.',
    policy: 'leg-lock',
    noGi: 'Heel hooks are not used in the gi.',
  },
  {
    slug: 's1-conduct',
    stage: 'stripe-1',
    name: 'Take care of your training partners: roll with control against lower belts, and tap early.',
  },
  {
    slug: 's2-pass',
    stage: 'stripe-2',
    name: 'Pass guards that give you trouble using leg drag, stack, or another third style, against resistance.',
    refs: ['pass.leg-drag', 'pass.stack'],
    target: 4,
    noGi: 'In no-gi, use a hips-tight body hold and underhooks.',
  },
  {
    slug: 's2-pins',
    stage: 'stripe-2',
    name: 'Make pins sequential: side control, knee on belly, north-south or mount so your partner cannot rest.',
    refs: ['pos.side-control', 'pos.knee-on-belly', 'pos.mount'],
    target: 5,
  },
  {
    slug: 's2-mount',
    stage: 'stripe-2',
    name: 'Mount: keep it against escapes and finish with a connected series (armbar, kimura, or climbing to a high mount to attack).',
    refs: ['pos.mount', 'sub.armbar-guard', 'sub.kimura'],
    target: 5,
    noGi: 'Arm triangle, or holding the head and one arm.',
  },
  {
    slug: 's2-back',
    stage: 'stripe-2',
    name: 'Back control: keep it against a strong partner, finish with two options.',
    refs: ['pos.back-control', 'sub.rear-naked-choke'],
    levels: { 'pos.back-control': 5, 'sub.rear-naked-choke': 4 },
  },
  {
    slug: 's2-weight',
    stage: 'stripe-2',
    name: 'Use weight distribution and balance so you feel heavy without exhausting yourself.',
  },
  {
    slug: 's2-second-guard',
    stage: 'stripe-2',
    name: 'Second open-guard system: beyond your first, add a sweep and an attack (e.g. flower, pendulum).',
    refs: ['pos.open-guard', 'sweep.flower', 'sweep.pendulum'],
    levels: { 'pos.open-guard': 5, 'sweep.flower': 4, 'sweep.pendulum': 4 },
    noGi: 'Butterfly, single-leg X, and underhooks.',
  },
  {
    slug: 's3-takedowns',
    stage: 'stripe-3',
    name: 'Takedowns: three finishes (arm drag, single leg, double leg or hip throw) against resisting partners, and a plan for each when they sprawl.',
    refs: TAKEDOWNS,
    target: 4,
    noGi: 'Wrestling hand and body ties replace collar and sleeve grips.',
  },
  {
    slug: 's3-counter',
    stage: 'stripe-3',
    name: 'Counter-wrestling: front headlock sequences (guillotine, back take), blocking an underhook and finishing the takedown, pulling the head down to take the back.',
    refs: ['sub.guillotine', 'def.sprawl'],
    target: 4,
  },
  {
    slug: 's3-scrambles',
    stage: 'stripe-3',
    name: 'Scrambles: recover position from a bad transition; win more scrambles than you lose.',
  },
  {
    slug: 's3-decide',
    stage: 'stripe-3',
    name: 'Decide on purpose: pull guard, take them down, or defend, based on partner and situation.',
  },
  {
    slug: 's3-leglock',
    stage: 'stripe-3',
    name: 'Leg attacks for offense (if your academy allows): straight ankle lock to the bigger leg attacks the rules allow at brown.',
    refs: ['sub.straight-ankle-lock'],
    target: 4,
    policy: 'leg-lock',
    noGi: 'Knee bars, toe holds, and slicers are a brown-belt choice. Heel hooks are no-gi only.',
  },
  {
    slug: 's3-headlock',
    stage: 'stripe-3',
    name: 'Headlock and clinch escapes and basic standing self-defense awareness.',
    refs: ['escape.headlock'],
    target: 4,
  },
  {
    slug: 's4-finish',
    stage: 'stripe-4',
    name: 'Finish rate: from mount, side control and back, finish with two options each against partners at your level.',
    refs: ['sub.armbar-guard', 'sub.kimura', 'sub.rear-naked-choke', 'sub.guillotine'],
    target: 5,
  },
  {
    slug: 's4-strategy',
    stage: 'stripe-4',
    name: "Strategy: identify your partner's game in the first minute and adjust mid-roll.",
  },
  {
    slug: 's4-teach',
    stage: 'stripe-4',
    name: 'Teach: explain and drill a technique with a newer student, and give clear feedback.',
    catalogNeed: { count: 3, level: 5 },
  },
  {
    slug: 's4-mentor',
    stage: 'stripe-4',
    name: 'Mentor: help a lower belt work through a benchmark or a weak spot.',
  },
  {
    slug: 's4-review',
    stage: 'stripe-4',
    name: 'Review: keep notes or watch footage of your rolls, and set Personal Goals for the things you keep getting caught in.',
  },
  {
    slug: 's4-everyone',
    stage: 'stripe-4',
    name: 'Roll with every belt level in your academy, with control and safety.',
  },
  {
    slug: 'promo-game',
    stage: 'promotion',
    name: 'A complete game. No obvious weak spots on top, on the bottom or standing against partners at your level.',
  },
  {
    slug: 'promo-defense',
    stage: 'promotion',
    name: 'Escapes and defense against everything common, including heavy pins and leg-lock awareness.',
    refs: ['escape.mount', 'escape.side-control', 'escape.back', 'def.submission-defense'],
    target: 5,
  },
  {
    slug: 'promo-pressure',
    stage: 'promotion',
    name: 'Pressure and control. Heavy, sequential top positions, with finishes.',
    refs: ['pos.mount', 'pos.side-control', 'pos.back-control', 'pos.knee-on-belly'],
    target: 5,
  },
  {
    slug: 'promo-guard',
    stage: 'promotion',
    name: 'Guard. A guard system with sweeps, submissions and a retention plan.',
    refs: ['pos.open-guard', 'pos.closed-guard', 'pos.half-guard', 'def.guard-retention'],
    target: 5,
  },
  {
    slug: 'promo-pass',
    stage: 'promotion',
    name: 'Passing. A reliable set of passes against resisting partners, including leg drag and stack.',
    refs: PASSES,
    target: 5,
  },
  {
    slug: 'promo-standing',
    stage: 'promotion',
    name: 'Standing. Takedowns, takedown defense, and counter-wrestling.',
    refs: [...TAKEDOWNS, 'def.sprawl'],
    levels: { 'td.arm-drag': 4, 'td.single-leg': 4, 'td.double-leg': 4, 'td.hip-throw': 4, 'def.sprawl': 5 },
  },
  {
    slug: 'promo-finish',
    stage: 'promotion',
    name: 'Finish. Reliable finishes from mount, side control, back and guard.',
    refs: SUBMISSIONS,
    giRefs: GI_CROSS,
    target: 5,
  },
  {
    slug: 'promo-teach',
    stage: 'promotion',
    name: 'Teach and lead. Teach fundamentals clearly, help new students, and set an example on the mat.',
    catalogNeed: { count: 5, level: 5 },
  },
  {
    slug: 'promo-consistency',
    stage: 'promotion',
    name: 'Consistency. Perform at the same level across months, not just in good rounds.',
  },
  {
    slug: 'promo-rules',
    stage: 'promotion',
    name: 'Know the rules. Know what is legal at brown (IBJJF) and what your academy allows.',
    rulebook: true,
  },
];

const BROWN_SPECS: Spec[] = [
  {
    slug: 's1-game',
    stage: 'stripe-1',
    name: 'Describe your game. Tap to add: what you do from the top, the bottom and standing, in your own words.',
  },
  {
    slug: 's1-gaps',
    stage: 'stripe-1',
    name: 'Find your remaining weak spots. Tap to add: the positions or situations where you still get stuck or caught.',
  },
  {
    slug: 's1-purpose',
    stage: 'stripe-1',
    name: 'Roll with a purpose. Tap to add: pick a position or idea to work on in each round.',
  },
  {
    slug: 's1-focus',
    stage: 'stripe-1',
    name: 'Your own focus for this stripe:',
  },
  {
    slug: 's2-flow',
    stage: 'stripe-2',
    name: 'From defense to offense. Tap to add: situations where an escape or a defense leads straight into your own attack.',
  },
  {
    slug: 's2-finishes',
    stage: 'stripe-2',
    name: 'Connected finishes. Tap to add: the positions where you have two finishes and a way to move on if they defend.',
    catalogNeed: { count: 1, level: 5, categoryId: 'submissions' },
  },
  {
    slug: 's2-timing',
    stage: 'stripe-2',
    name: 'Timing and leverage. Tap to add: moments where better timing worked better than strength.',
  },
  {
    slug: 's2-focus',
    stage: 'stripe-2',
    name: 'Your own focus for this stripe:',
  },
  {
    slug: 's3-partners',
    stage: 'stripe-3',
    name: 'Different partners. Tap to add: how your game changes against bigger, smaller, faster or more experienced partners.',
  },
  {
    slug: 's3-rulesets',
    stage: 'stripe-3',
    name: 'Gi, no-gi and rule sets. Tap to add: how your positions change with the gi, without it, or under a competition rule set.',
  },
  {
    slug: 's3-leglock',
    stage: 'stripe-3',
    name: 'Leg locks (optional, off by default). Tap to add: leg-lock safety, defense, or offense, only as your academy allows.',
    policy: 'leg-lock',
    noGi: 'Heel hooks are never used in the gi. They are legal only for adult brown and black belts in no-gi.',
  },
  {
    slug: 's3-standing',
    stage: 'stripe-3',
    name: 'Standing and scrambles. Tap to add: how you handle the start of rounds, takedown attempts and scrambles.',
  },
  {
    slug: 's3-competition',
    stage: 'stripe-3',
    name: COMPETITION_PROMPT,
    policy: 'competition',
    optional: true,
  },
  {
    slug: 's3-focus',
    stage: 'stripe-3',
    name: 'Your own focus for this stripe:',
  },
  {
    slug: 's4-teach',
    stage: 'stripe-4',
    name: 'Teach it. Tap to add: a sequence from your game you can break down into steps for a newer student.',
    catalogNeed: { count: 3, level: 5 },
  },
  {
    slug: 's4-help',
    stage: 'stripe-4',
    name: 'Help others. Tap to add: how you help lower belts with a problem, in class or after.',
  },
  {
    slug: 's4-calm',
    stage: 'stripe-4',
    name: 'Stay calm and keep going. Tap to add: how you stay composed under pressure, recover between rounds and train for the long run.',
  },
  {
    slug: 's4-review',
    stage: 'stripe-4',
    name: 'Review. Tap to add: how you look back at your rolls (notes, video, or talking with your coach).',
  },
  {
    slug: 's4-focus',
    stage: 'stripe-4',
    name: 'Your own focus for this stripe:',
  },
  {
    slug: 'promo-explain',
    stage: 'promotion',
    name: 'You can explain your game. Tap to add: what you do and why, in your own words.',
  },
  {
    slug: 'promo-flow',
    stage: 'promotion',
    name: 'Defense and offense flow together. Tap to add: where this shows up in your rolls.',
  },
  {
    slug: 'promo-finishes',
    stage: 'promotion',
    name: 'Reliable, well-detailed finishes. Tap to add: the finishes you trust and the details that make them work.',
  },
  {
    slug: 'promo-teach',
    stage: 'promotion',
    name: 'You can teach it. Tap to add: what you teach well and how you check that it landed.',
    catalogNeed: { count: 5, level: 5 },
  },
  {
    slug: 'promo-lead',
    stage: 'promotion',
    name: 'Leadership and respect. Tap to add: how you carry yourself and represent your academy on and off the mat.',
  },
  {
    slug: 'promo-adapt',
    stage: 'promotion',
    name: 'Adapting. Tap to add: how you adapt your game to style, rules and partners.',
  },
  {
    slug: 'promo-rules',
    stage: 'promotion',
    name: 'Know the rules. Know what is legal at brown and black (IBJJF) and what your academy allows.',
    rulebook: true,
  },
  {
    slug: 'promo-focus',
    stage: 'promotion',
    name: 'Your own focus for promotion:',
  },
];

let cachedLevels: RubricLevel[] | null = null;

export function adultStarterLevels(): RubricLevel[] {
  if (!cachedLevels) {
    cachedLevels = [
      adultLevel('white', WHITE_SPECS),
      adultLevel('blue', BLUE_SPECS),
      adultLevel('purple', PURPLE_SPECS),
      adultLevel('brown', BROWN_SPECS),
    ];
  }
  return cachedLevels;
}

export function stripeHeading(belt: ProgressBelt, stage: BenchmarkStage): string {
  return STRIPE_HEADINGS[belt]?.[stage] ?? '';
}

export function starterCheckpoint(belt: ProgressBelt, slug: string): RubricCheckpoint | undefined {
  return adultStarterLevels()
    .find((level) => level.belt === belt)
    ?.checkpoints.find((row) => row.id === `checkpoint.${belt}.${slug}`);
}

export function defaultTechniquePolicy(belt: ProgressBelt, age: number | null): ResolvedPolicy {
  const rank = ADULT_RANK[belt] ?? 0;
  return {
    straightAnkleLock: age == null || age >= 16,
    wristLocks: rank >= 1,
    legLocks: false,
    heelHooks: false,
    competition: false,
  };
}

export function effectiveTechniquePolicy(profile: StudentProfile, belt: ProgressBelt, age: number | null): ResolvedPolicy {
  const defaults = defaultTechniquePolicy(belt, age);
  const saved = profile.techniquePolicy ?? {};
  return {
    straightAnkleLock: saved.straightAnkleLock ?? defaults.straightAnkleLock,
    wristLocks: saved.wristLocks ?? defaults.wristLocks,
    legLocks: saved.legLocks ?? defaults.legLocks,
    heelHooks: saved.heelHooks ?? defaults.heelHooks,
    competition: saved.competition ?? defaults.competition,
  };
}

export function benchmarkView(report: StudentProgressReport): BenchmarkView {
  const year = report.beltBook?.birthYear;
  const age = typeof year === 'number' ? ibjjfAge(year) : null;
  return {
    belt: report.profile.belt,
    trainingStyle: report.profile.trainingStyle ?? 'both',
    policy: effectiveTechniquePolicy(report.profile, report.profile.belt, age),
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
