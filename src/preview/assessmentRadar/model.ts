/**
 * Isolated preview of an eight-area assessment shape.
 * Nothing here reads or writes a student self-assessment, journal, or index.
 * The live seven-area self-assessment chart stays on its own module.
 * The profile Shape card reuses the octagon drawing and does not write a check-in.
 */

import { DEFAULT_EVALUATION_OMITTED_IDS, FUNDAMENTALS_CATALOG } from '../../lib/progress/catalog.ts';

export const ASSESSMENT_RADAR_PREVIEW_PATH = '/preview/assessment-radar';

export const SHEET_VARIANT_PATH = `${ASSESSMENT_RADAR_PREVIEW_PATH}?variant=sheet`;
export const CENTER_VARIANT_PATH = `${ASSESSMENT_RADAR_PREVIEW_PATH}?variant=center`;

export const PREVIEW_BANNER =
  'Preview with example scores. Nothing on this page is saved to your record.';

/** Self-assessment wording already on the live check-in. 1 is early. 5 is ready to rely on. */
export const SELF_ASSESSMENT_SCALE = '1 is early. 5 is ready to rely on.';

/**
 * Same 1–5 words as a technique journal rating.
 * A test keeps this equal to the journal scale.
 */
export const TECHNIQUE_RATING_WORDS = {
  1: 'Poorly',
  2: 'A little',
  3: 'Okay',
  4: 'Well',
  5: 'Really well',
} as const;

export const SCORE_MAX = 5;
export const SVG_SIZE = 200;
export const OCTAGON_CENTER = 100;
export const OCTAGON_RADIUS = 96;

export const AXES = [
  {
    id: 'guard-control',
    label: 'Guard/Control',
    manualOnly: false,
    meaning:
      'One area with two parts. Guard is keeping your own guard. Control is a top position you already have, including side control, north-south, mount, scarf hold, knee on belly, and back control. This is not a ninth area, and it is not a pass or a sweep.',
  },
  {
    id: 'passing',
    label: 'Passing',
    manualOnly: false,
    meaning: 'Getting past their guard into a top position. Sweeps are a separate area.',
  },
  {
    id: 'sweeps',
    label: 'Sweeps',
    manualOnly: false,
    meaning: 'Turning a bottom position into a top position. Sit-up sweep is left off on purpose.',
  },
  {
    id: 'takedowns',
    label: 'Takedowns',
    manualOnly: false,
    meaning: 'Taking the fight from standing to the mat.',
  },
  {
    id: 'escapes-defense',
    label: 'Escapes/Defense',
    manualOnly: false,
    meaning:
      'Getting out, and the defensive work named with it. Turtle is defense here, not an escape. Submission defense is here, not under Submissions. Sprawl is not on the default list.',
  },
  {
    id: 'submissions',
    label: 'Submissions',
    manualOnly: false,
    meaning: 'Finishing a submission. Submission defense is not in this area.',
  },
  {
    id: 'conditioning',
    label: 'Conditioning',
    manualOnly: true,
    meaning: 'Your engine for the round. A technique rating is not a measure of conditioning, so this stays a manual score.',
  },
  {
    id: 'mindset',
    label: 'Mindset',
    manualOnly: true,
    meaning: 'Focus and composure in the round. A technique rating is not a measure of mindset, so this stays a manual score.',
  },
] as const;

export type AxisId = (typeof AXES)[number]['id'];
export type SkillAxisId = Exclude<AxisId, 'conditioning' | 'mindset'>;
export type Rating = 1 | 2 | 3 | 4 | 5;
export type PreviewMode = 'manual' | 'techniques';
export type IndexKind = 'position' | 'movement';

export type AxisDefinition = (typeof AXES)[number];

export type TechniqueRecord = {
  id: string;
  name: string;
  kind: IndexKind;
  /** Real category tags. Conditioning and Mindset are never tags. */
  categories: SkillAxisId[];
  /** Preview sample, not a saved student or owner record. */
  sample: true;
};

export type JournalCard = {
  id: string;
  techniqueId: string;
  rating: Rating;
  loggedAt: string;
};

export type ManualScores = Partial<Record<AxisId, Rating>>;

export type PreviewModel = {
  techniques: TechniqueRecord[];
  cards: JournalCard[];
  /** Overall self-assessment. Separate from technique ratings. */
  manual: ManualScores;
  /** Areas this example check-in does not score. An open corner is not a zero. */
  legacyOmitted: AxisId[];
};

export type Contributor = {
  techniqueId: string;
  name: string;
  kind: IndexKind;
  rating: Rating;
  earlier: { rating: Rating; loggedAt: string }[];
};

export type CategorySummary = {
  axisId: AxisId;
  status: 'scored' | 'not-rated' | 'manual-only';
  /** Technique average. Null when the category is manual-only or has no rated technique. */
  score: number | null;
  taggedCount: number;
  ratedCount: number;
  contributors: Contributor[];
  unrated: { techniqueId: string; name: string }[];
  formula: string;
  manualScore: Rating | null;
};

const SKILL_IDS: readonly SkillAxisId[] = ['guard-control', 'passing', 'sweeps', 'takedowns', 'escapes-defense', 'submissions'];

const SEED: PreviewModel = {
  legacyOmitted: ['guard-control', 'sweeps'],
  manual: {
    passing: 3,
    takedowns: 4,
    'escapes-defense': 2,
    submissions: 4,
    conditioning: 2,
    mindset: 3,
  },
  techniques: [
    technique('tech-deep-half', 'Deep half guard', 'position', ['guard-control']),
    technique('tech-closed', 'Closed guard', 'position', ['guard-control']),
    technique('tech-knee', 'Knee slice', 'movement', ['passing']),
    technique('tech-pressure', 'Pressure pass', 'movement', ['passing']),
    technique('tech-double', 'Double leg', 'movement', ['takedowns']),
    technique('tech-arm-drag', 'Arm drag to the back', 'movement', ['takedowns']),
    technique('tech-side', 'Side control', 'position', ['guard-control']),
    technique('tech-mount', 'Mount', 'position', ['guard-control']),
    technique('tech-back', 'Back control', 'position', ['guard-control']),
    technique('tech-elbow', 'Elbow-knee escape', 'movement', ['escapes-defense']),
    technique('tech-mount-escape', 'Mount escape', 'movement', ['escapes-defense']),
    technique('tech-armbar', 'Armbar', 'movement', ['submissions']),
    technique('tech-triangle', 'Triangle', 'movement', ['submissions']),
  ],
  cards: [
    card('card-deep-old', 'tech-deep-half', 2, '2026-09-01T18:00:00.000Z'),
    card('card-deep-new', 'tech-deep-half', 4, '2026-10-20T18:00:00.000Z'),
    card('card-closed', 'tech-closed', 3, '2026-10-18T18:00:00.000Z'),
    card('card-knee', 'tech-knee', 5, '2026-10-12T18:00:00.000Z'),
    card('card-pressure', 'tech-pressure', 3, '2026-10-12T18:05:00.000Z'),
    card('card-double', 'tech-double', 3, '2026-10-04T18:00:00.000Z'),
    card('card-drag', 'tech-arm-drag', 4, '2026-10-28T18:00:00.000Z'),
    card('card-side', 'tech-side', 4, '2026-10-22T18:00:00.000Z'),
    card('card-mount', 'tech-mount', 5, '2026-10-22T18:06:00.000Z'),
    card('card-elbow', 'tech-elbow', 4, '2026-10-08T18:00:00.000Z'),
    card('card-mount-escape', 'tech-mount-escape', 2, '2026-10-08T18:06:00.000Z'),
    card('card-armbar', 'tech-armbar', 5, '2026-09-30T18:00:00.000Z'),
    card('card-triangle', 'tech-triangle', 2, '2026-09-30T18:08:00.000Z'),
  ],
};

export const SAMPLE_GUARD_NAME = 'Deep half guard';

/** Clockwise from the top. Guard and Control share the first area. */
export const SHEET_AXIS_IDS = [
  'guard-control',
  'passing',
  'sweeps',
  'takedowns',
  'escapes-defense',
  'submissions',
  'conditioning',
  'mindset',
] as const satisfies readonly AxisId[];

/**
 * Owner assignment for this preview. The catalog still has no radar field.
 * Standing is not here. The five default omissions are not here.
 */
export const APPROVED_FUNDAMENTALS = [
  { id: 'pos.closed-guard', axis: 'guard-control', subtype: 'Guard' },
  { id: 'pos.open-guard', axis: 'guard-control', subtype: 'Guard' },
  { id: 'pos.half-guard', axis: 'guard-control', subtype: 'Guard' },
  { id: 'pos.butterfly-guard', axis: 'guard-control', subtype: 'Guard' },
  { id: 'def.guard-retention', axis: 'guard-control', subtype: 'Guard' },
  { id: 'pos.side-control', axis: 'guard-control', subtype: 'Control' },
  { id: 'pos.north-south', axis: 'guard-control', subtype: 'Control' },
  { id: 'pos.mount', axis: 'guard-control', subtype: 'Control' },
  { id: 'pos.scarf-hold', axis: 'guard-control', subtype: 'Control' },
  { id: 'pos.knee-on-belly', axis: 'guard-control', subtype: 'Control' },
  { id: 'pos.back-control', axis: 'guard-control', subtype: 'Control' },
  { id: 'pass.torreando', axis: 'passing', subtype: 'Pass' },
  { id: 'pass.knee-slice', axis: 'passing', subtype: 'Pass' },
  { id: 'pass.leg-drag', axis: 'passing', subtype: 'Pass' },
  { id: 'pass.stack', axis: 'passing', subtype: 'Pass' },
  { id: 'sweep.scissor', axis: 'sweeps', subtype: 'Sweep' },
  { id: 'sweep.hip-bump', axis: 'sweeps', subtype: 'Sweep' },
  { id: 'sweep.pendulum', axis: 'sweeps', subtype: 'Sweep' },
  { id: 'sweep.flower', axis: 'sweeps', subtype: 'Sweep' },
  { id: 'sweep.tripod', axis: 'sweeps', subtype: 'Sweep' },
  { id: 'sweep.butterfly', axis: 'sweeps', subtype: 'Sweep' },
  { id: 'td.double-leg', axis: 'takedowns', subtype: 'Takedown' },
  { id: 'td.single-leg', axis: 'takedowns', subtype: 'Takedown' },
  { id: 'td.arm-drag', axis: 'takedowns', subtype: 'Takedown' },
  { id: 'td.hip-throw', axis: 'takedowns', subtype: 'Takedown' },
  { id: 'escape.mount', axis: 'escapes-defense', subtype: 'Escape' },
  { id: 'escape.side-control', axis: 'escapes-defense', subtype: 'Escape' },
  { id: 'escape.back', axis: 'escapes-defense', subtype: 'Escape' },
  { id: 'escape.headlock', axis: 'escapes-defense', subtype: 'Escape' },
  { id: 'pos.turtle', axis: 'escapes-defense', subtype: 'Defense' },
  { id: 'def.submission-defense', axis: 'escapes-defense', subtype: 'Defense' },
  { id: 'sub.armbar-guard', axis: 'submissions', subtype: 'Submission' },
  { id: 'sub.triangle', axis: 'submissions', subtype: 'Submission' },
  { id: 'sub.kimura', axis: 'submissions', subtype: 'Submission' },
  { id: 'sub.guillotine', axis: 'submissions', subtype: 'Submission' },
  { id: 'sub.rear-naked-choke', axis: 'submissions', subtype: 'Submission' },
  { id: 'sub.cross-collar', axis: 'submissions', subtype: 'Submission' },
  { id: 'sub.straight-ankle-lock', axis: 'submissions', subtype: 'Submission' },
  { id: 'sub.americana', axis: 'submissions', subtype: 'Submission' },
  { id: 'sub.omoplata', axis: 'submissions', subtype: 'Submission' },
  { id: 'sub.wrist-lock', axis: 'submissions', subtype: 'Submission' },
] as const satisfies readonly { id: string; axis: SkillAxisId; subtype: string }[];

export type DestinationItem = {
  id: string;
  name: string;
  source: 'sample' | 'fundamentals' | 'benchmark';
  detail: string;
};

const catalogItems = () => FUNDAMENTALS_CATALOG.categories.flatMap((category) => category.items.map((item) => ({ ...item, category: category.name, categoryId: category.id })));

export type CatalogBasis = 'approved' | 'omitted-from-default' | 'unassigned';

export type CatalogCoverageRow = {
  id: string;
  name: string;
  sheetCategoryId: string;
  sheetCategoryName: string;
  examples: number;
  previewLabel: SkillAxisId | null;
  subtype: string;
  basis: CatalogBasis;
};

export function catalogCoverage(): CatalogCoverageRow[] {
  const approved = new Map<string, (typeof APPROVED_FUNDAMENTALS)[number]>(APPROVED_FUNDAMENTALS.map((row) => [row.id, row]));
  const omitted = new Set<string>(DEFAULT_EVALUATION_OMITTED_IDS);
  return catalogItems().map((item) => {
    const match = approved.get(item.id);
    const basis: CatalogBasis = match ? 'approved' : omitted.has(item.id) ? 'omitted-from-default' : 'unassigned';
    return {
      id: item.id,
      name: item.name,
      sheetCategoryId: item.categoryId,
      sheetCategoryName: item.category,
      examples: item.examples.length,
      previewLabel: match?.axis ?? null,
      subtype: match?.subtype ?? '',
      basis,
    };
  });
}

export const SUGGESTED_HEADING = 'Suggested minimum technical requirements';

export const SUGGESTED_DISCLAIMER =
  'These are suggestions, not a curriculum and not a promotion requirement. Personal benchmarks can be added. Above white, this default list has at most three per belt.';

export type SuggestedBelt = 'white' | 'blue' | 'purple' | 'brown' | 'black';

export type SuggestedRequirement = {
  id: string;
  belt: SuggestedBelt;
  name: string;
  areas: readonly SkillAxisId[];
  catalogIds: readonly string[];
  note: string;
};

/** Approved default suggestions. Items 28–47 of the old mixed list are not included. */
export const SUGGESTED_REQUIREMENTS = [
  {
    id: 'suggested.white.positions',
    belt: 'white',
    name: 'Four basic positions: closed guard, side control, mount, and back control',
    areas: ['guard-control'],
    catalogIds: ['pos.closed-guard', 'pos.side-control', 'pos.mount', 'pos.back-control'],
    note: 'Guard and Control on the one Guard/Control area.',
  },
  {
    id: 'suggested.white.back-escape',
    belt: 'white',
    name: 'Escape back control',
    areas: ['escapes-defense'],
    catalogIds: ['escape.back'],
    note: 'The catalog name is Back escape.',
  },
  {
    id: 'suggested.white.recover-guard',
    belt: 'white',
    name: 'Recover guard from side control',
    areas: ['escapes-defense'],
    catalogIds: [],
    note: 'Not the same name as Side control escape. No catalog row was added or renamed.',
  },
  {
    id: 'suggested.white.scissor',
    belt: 'white',
    name: 'Scissor sweep',
    areas: ['sweeps'],
    catalogIds: ['sweep.scissor'],
    note: 'Sit-up sweep is omitted on purpose.',
  },
  {
    id: 'suggested.white.hold',
    belt: 'white',
    name: 'Hold mount, side control, and back control',
    areas: ['guard-control', 'submissions'],
    catalogIds: ['pos.mount', 'pos.side-control', 'pos.back-control'],
    note: 'Control on the Guard/Control area, with Submissions named beside it. One suggestion, not a new area.',
  },
  {
    id: 'suggested.white.mount-finish',
    belt: 'white',
    name: 'A submission from mount: Americana, armbar, or cross collar choke',
    areas: ['submissions'],
    catalogIds: ['sub.americana', 'sub.cross-collar'],
    note: 'Americana and Cross collar choke are catalog names. Armbar from mount is not a separate catalog row, and Armbar from guard was not renamed.',
  },
  {
    id: 'suggested.blue.mount-side',
    belt: 'blue',
    name: 'Mount and side control with connected finishes',
    areas: ['submissions'],
    catalogIds: [],
    note: 'A suggestion. No new catalog row was added.',
  },
  {
    id: 'suggested.blue.back',
    belt: 'blue',
    name: 'Take, keep, and finish the back against resistance: collar choke, rear naked choke, or armbar from the back',
    areas: ['submissions'],
    catalogIds: ['sub.cross-collar', 'sub.rear-naked-choke'],
    note: 'Armbar from the back is not a catalog row. Rear naked choke and Cross collar choke are.',
  },
  {
    id: 'suggested.blue.pendulum',
    belt: 'blue',
    name: 'Pendulum sweep',
    areas: ['sweeps'],
    catalogIds: ['sweep.pendulum'],
    note: 'Catalog name Pendulum sweep.',
  },
  {
    id: 'suggested.purple.mount-transitions',
    belt: 'purple',
    name: 'Technical mount and mount transitions',
    areas: ['guard-control'],
    catalogIds: [],
    note: 'Positional work inside Guard/Control. Not a ninth area. Not a catalog row.',
  },
  {
    id: 'suggested.purple.deep-half',
    belt: 'purple',
    name: 'Deep half guard',
    areas: ['guard-control'],
    catalogIds: [],
    note: 'Guard part of Guard/Control. Not a catalog row. The preview sample of the same name is not a saved record.',
  },
  {
    id: 'suggested.purple.s-mount',
    belt: 'purple',
    name: 'S-mount armbar',
    areas: ['submissions'],
    catalogIds: [],
    note: 'Not the catalog row Armbar from guard, and that row was not renamed.',
  },
  {
    id: 'suggested.brown.x-guard',
    belt: 'brown',
    name: 'X guard',
    areas: ['guard-control'],
    catalogIds: [],
    note: 'Guard part of Guard/Control, and a technical-tree base. Not a catalog row.',
  },
  {
    id: 'suggested.brown.kneebar',
    belt: 'brown',
    name: 'Kneebar',
    areas: ['submissions'],
    catalogIds: [],
    note: 'Not a catalog row.',
  },
  {
    id: 'suggested.brown.fifty',
    belt: 'brown',
    name: '50/50',
    areas: ['guard-control'],
    catalogIds: [],
    note: 'Guard part of Guard/Control. Not a catalog row.',
  },
] as const satisfies readonly SuggestedRequirement[];

export const PERSONAL_BENCHMARK_EXAMPLES = [
  { belt: 'blue', area: 'mindset', name: 'Competed without losing cool' },
  { belt: 'blue', area: 'conditioning', name: '10 pull-ups' },
] as const;

export const OMITTED_ON_PURPOSE = ['Sit-up sweep'] as const;

export function suggestedFor(axisId: AxisId): SuggestedRequirement[] {
  if (axisId === 'conditioning' || axisId === 'mindset') return [];
  return SUGGESTED_REQUIREMENTS.filter((row) => (row.areas as readonly string[]).includes(axisId));
}

export function suggestedCountByBelt(): Record<SuggestedBelt, number> {
  const counts: Record<SuggestedBelt, number> = { white: 0, blue: 0, purple: 0, brown: 0, black: 0 };
  for (const row of SUGGESTED_REQUIREMENTS) counts[row.belt] += 1;
  return counts;
}

export function categoryDestination(model: PreviewModel, axisId: AxisId): {
  items: DestinationItem[];
  samples: DestinationItem[];
  fundamentals: DestinationItem[];
  benchmarks: DestinationItem[];
  note: string;
} {
  const axis = axisById(axisId);
  const byId = new Map(catalogItems().map((item) => [item.id, item]));
  const approved = APPROVED_FUNDAMENTALS.filter((row) => row.axis === axisId);
  const samples: DestinationItem[] = [];
  if (!axis.manualOnly) {
    for (const row of model.techniques.filter((item) => item.categories.includes(axisId as SkillAxisId))) {
      const latest = latestCard(cardsFor(model, row.id));
      const rating = latest ? `Example rating ${latest.rating} (${TECHNIQUE_RATING_WORDS[latest.rating]}).` : 'No example rating.';
      samples.push({
        id: row.id,
        name: row.name,
        source: 'sample',
        detail: `Sample ${row.id} for this preview, not a saved student record. ${rating}`,
      });
    }
  }
  const fundamentals: DestinationItem[] = approved.flatMap((row) => {
    const item = byId.get(row.id);
    if (!item) return [];
    return [{
      id: item.id,
      name: item.name,
      source: 'fundamentals' as const,
      detail: `Fundamentals id ${item.id}, sheet category ${item.category}, ${row.subtype} inside ${axis.label}. The catalog does not store this radar label. Not a score and not a mastery mark.`,
    }];
  });
  const benchmarks: DestinationItem[] = axis.manualOnly
    ? PERSONAL_BENCHMARK_EXAMPLES.filter((row) => row.area === axisId).map((row) => ({
        id: `personal.${row.area}.${row.belt}`,
        name: row.name,
        source: 'benchmark' as const,
        detail: `Example personal benchmark for ${axis.label}. Not an automatic technique score, and not saved.`,
      }))
    : suggestedFor(axisId).map((row) => ({
        id: row.id,
        name: row.name,
        source: 'benchmark' as const,
        detail: `${SUGGESTED_HEADING}. ${row.note}`,
      }));
  const items = [...samples, ...fundamentals, ...benchmarks];
  return { items, samples, fundamentals, benchmarks, note: destinationNote(axis, samples.length, fundamentals.length, benchmarks.length) };
}

function destinationNote(axis: AxisDefinition, samples: number, fundamentals: number, benchmarks: number): string {
  if (axis.manualOnly) {
    return `${axis.label} stays on the manual check-in. There is no automatic technique score. The row below is an example of a personal benchmark, not a saved requirement.`;
  }
  const sweep = axis.id === 'sweeps' ? ' Sit-up sweep is omitted on purpose.' : '';
  return `${samples} example ${samples === 1 ? 'technique' : 'techniques'}, ${fundamentals} fundamentals, and ${benchmarks} suggested requirements.${sweep} ${SUGGESTED_DISCLAIMER}`;
}

export const PAGE_TITLE = 'Assessment radar';

export const PAGE_LEAD =
  'Eight parts of your game, from 1 to 5. 1 is early. 5 is ready to rely on. The scores here are examples.';

export const SHAPE_NOTE =
  'Each part has the same room on the chart. A 5 reaches the outside. A lower score sits closer to the middle. If a part has no score, that corner stays open. An open corner is not a zero.';

export const CAGE_NOTE =
  'The outside line has eight equal sides. There is no league name and no league marks.';

/**
 * Fictional scores for the cage drawings only.
 * They close the shape. They are not a check-in and they are not written anywhere.
 */
export const SHEET_EXAMPLE_SCORES = {
  'guard-control': 4,
  passing: 3,
  sweeps: 4,
  takedowns: 2,
  'escapes-defense': 3,
  submissions: 4,
  conditioning: 4,
  mindset: 5,
} as const satisfies Record<AxisId, Rating>;

export const COACH_EXAMPLE_SCORES = {
  'guard-control': 5,
  passing: 4,
  sweeps: 3,
  takedowns: 3,
  'escapes-defense': 3,
  submissions: 2,
  conditioning: 3,
  mindset: 4,
} as const satisfies Record<AxisId, Rating>;

export const OPPONENT_EXAMPLE_SCORES = {
  'guard-control': 2,
  passing: 5,
  sweeps: 2,
  takedowns: 4,
  'escapes-defense': 2,
  submissions: 5,
  conditioning: 5,
  mindset: 3,
} as const satisfies Record<AxisId, Rating>;

export const COACH_VARIANT_PATH = `${ASSESSMENT_RADAR_PREVIEW_PATH}?variant=coach`;
export const OPPONENT_VARIANT_PATH = `${ASSESSMENT_RADAR_PREVIEW_PATH}?variant=opponent`;
export const COMPARISON_VARIANT_PATH = `${ASSESSMENT_RADAR_PREVIEW_PATH}?variant=comparison`;

export const CAGE_FICTION_NOTE =
  'The cage uses fictional scores so the shape can close. A missing check-in score is not stored as zero. Sheet radar still shows this page’s check-in, where Guard/Control and Sweeps stay open.';

export type CageView = 'center' | 'coach' | 'opponent' | 'comparison';

export function isCageView(variant: string): variant is CageView {
  return variant === 'center' || variant === 'coach' || variant === 'opponent' || variant === 'comparison';
}

export function cageScores(view: Exclude<CageView, 'comparison'>): Record<AxisId, Rating> {
  if (view === 'coach') return COACH_EXAMPLE_SCORES;
  if (view === 'opponent') return OPPONENT_EXAMPLE_SCORES;
  return SHEET_EXAMPLE_SCORES;
}

/** Compass order used by the stat-sheet cage. A missing value is never filled in here. */
export function cageValueList(scores: Record<AxisId, Rating>): number[] {
  return SHEET_AXIS_IDS.map((id) => scores[id]);
}

export const CALCULATION_PROPOSAL = [
  'A category summary is the average of the latest 1–5 rating on each example technique tagged to that category.',
  `${SELF_ASSESSMENT_SCALE} A technique rating uses those same numbers: ${TECHNIQUE_RATING_WORDS[1]} through ${TECHNIQUE_RATING_WORDS[5]}.`,
  'Several notes for one technique count once. The latest note is the one that counts.',
  'A technique can belong to two categories when both are real. It still counts as one technique.',
  'A tagged technique with no rating is left out. It is not a zero.',
  'A category with no rated techniques stays not rated. That corner stays open.',
  'Conditioning and Mindset stay on the manual check-in. Technique ratings are not used for them.',
  'This example check-in has no Guard/Control score and no Sweeps score. Those corners stay open. They are not zeroes.',
  'The manual check-in and the technique summary stay separate. Editing one does not replace the other.',
] as const;

export const OPEN_DECISIONS = [
  'Where a category tag lives on the shared index record.',
  'Which existing journal ratings are allowed to feed a category.',
  'Whether a typed nickname may suggest a canonical name. This preview only uses the explicit sample name Deep half guard.',
  'How a saved 7-area check-in can gain an optional Control score without rewriting the old day or storing a zero.',
  'Whether the live check-in shows the technique summary beside the manual scores.',
] as const;

export function seedPreview(): PreviewModel {
  return structuredClone(SEED);
}

export function axisById(id: AxisId): AxisDefinition {
  const found = AXES.find((axis) => axis.id === id);
  if (!found) throw new Error(`Unknown area ${id}`);
  return found;
}

export function isRating(value: unknown): value is Rating {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

export function isSkillAxis(value: string): value is SkillAxisId {
  return (SKILL_IDS as readonly string[]).includes(value);
}

export function axisAngle(index: number, count = AXES.length): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / count;
}

export function pointOnAxis(index: number, value: number, radius = OCTAGON_RADIUS): { x: number; y: number } {
  const span = (value / SCORE_MAX) * radius;
  const theta = axisAngle(index);
  return {
    x: OCTAGON_CENTER + Math.cos(theta) * span,
    y: OCTAGON_CENTER + Math.sin(theta) * span,
  };
}

export function outerOctagon(): { x: number; y: number }[] {
  return AXES.map((_, index) => pointOnAxis(index, SCORE_MAX));
}

export function ringPoints(value: number): string {
  return outerOctagon()
    .map((_, index) => formatPoint(pointOnAxis(index, value)))
    .join(' ');
}

export function formatPoint(point: { x: number; y: number }): string {
  return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
}

/** Contiguous rated indexes, walking clockwise. A gap is not filled with zero. */
export function contiguousRuns(values: readonly (number | null)[]): number[][] {
  const count = values.length;
  if (count === 0) return [];
  const rated = values.map((value) => value != null);
  if (!rated.some(Boolean)) return [];
  if (rated.every(Boolean)) return [values.map((_, index) => index)];

  const firstGap = rated.findIndex((value) => !value);
  const runs: number[][] = [];
  let index = (firstGap + 1) % count;
  let seen = 0;
  while (seen < count) {
    if (!rated[index]) {
      index = (index + 1) % count;
      seen += 1;
      continue;
    }
    const run: number[] = [];
    while (rated[index] && run.length < count) {
      run.push(index);
      index = (index + 1) % count;
      seen += 1;
    }
    runs.push(run);
  }
  return runs;
}

export function isComplete(values: readonly (number | null)[]): boolean {
  return values.length > 0 && values.every((value) => value != null);
}

export function closedRatingPoints(values: readonly (number | null)[]): { x: number; y: number }[] | null {
  if (!isComplete(values)) return null;
  return values.map((value, index) => pointOnAxis(index, value ?? 0));
}

export function ratingSegments(values: readonly (number | null)[]): { x: number; y: number }[][] {
  if (isComplete(values)) return [];
  return contiguousRuns(values)
    .filter((run) => run.length >= 2)
    .map((run) => run.map((index) => pointOnAxis(index, values[index] ?? 0)));
}

export function ratingDots(values: readonly (number | null)[]): { x: number; y: number; index: number }[] {
  return values.flatMap((value, index) => (value == null ? [] : [{ ...pointOnAxis(index, value), index }]));
}

export function shapeValues(model: PreviewModel, mode: PreviewMode): (number | null)[] {
  return AXES.map((axis) => {
    if (mode === 'manual') return model.manual[axis.id] ?? null;
    return categorySummary(model, axis.id).score;
  });
}

export function averageRatings(ratings: readonly number[]): number | null {
  if (ratings.length === 0) return null;
  const total = ratings.reduce((sum, value) => sum + value, 0);
  return Math.round((total / ratings.length) * 10) / 10;
}

export function formatDerived(score: number): string {
  return score.toFixed(1);
}

export function cardsFor(model: PreviewModel, techniqueId: string): JournalCard[] {
  return model.cards.filter((row) => row.techniqueId === techniqueId);
}

/** Latest card for one canonical technique. Earlier cards are not extra votes. */
export function latestCard(cards: readonly JournalCard[]): JournalCard | null {
  let best: JournalCard | null = null;
  let bestAt = -1;
  cards.forEach((row, index) => {
    if (!best || row.loggedAt > best.loggedAt || (row.loggedAt === best.loggedAt && index > bestAt)) {
      best = row;
      bestAt = index;
    }
  });
  return best;
}

export function categorySummary(model: PreviewModel, axisId: AxisId): CategorySummary {
  const axis = axisById(axisId);
  const manualScore = model.manual[axisId] ?? null;
  if (axis.manualOnly) {
    return {
      axisId,
      status: 'manual-only',
      score: null,
      taggedCount: 0,
      ratedCount: 0,
      contributors: [],
      unrated: [],
      formula: '',
      manualScore,
    };
  }
  const tagged = model.techniques.filter((row) => row.categories.includes(axisId as SkillAxisId));
  const contributors: Contributor[] = [];
  const unrated: { techniqueId: string; name: string }[] = [];
  for (const row of tagged) {
    const cards = cardsFor(model, row.id);
    const latest = latestCard(cards);
    if (!latest) {
      unrated.push({ techniqueId: row.id, name: row.name });
      continue;
    }
    contributors.push({
      techniqueId: row.id,
      name: row.name,
      kind: row.kind,
      rating: latest.rating,
      earlier: cards
        .filter((cardRow) => cardRow.id !== latest.id)
        .map((cardRow) => ({ rating: cardRow.rating, loggedAt: cardRow.loggedAt })),
    });
  }
  const score = averageRatings(contributors.map((row) => row.rating));
  return {
    axisId,
    status: score == null ? 'not-rated' : 'scored',
    score,
    taggedCount: tagged.length,
    ratedCount: contributors.length,
    contributors,
    unrated,
    formula: formulaFor(contributors.map((row) => row.rating), score),
    manualScore,
  };
}

export function formulaFor(ratings: readonly number[], score: number | null): string {
  if (score == null || ratings.length === 0) return '';
  if (ratings.length === 1) return `${ratings[0]} is the only latest rating.`;
  return `(${ratings.join(' + ')}) / ${ratings.length} = ${formatDerived(score)}`;
}

export function journalCardCount(model: PreviewModel): number {
  return model.cards.length;
}

export function techniqueCount(model: PreviewModel): number {
  return model.techniques.length;
}

/** Each rated technique once, even when it is tagged to two categories. */
export function ratedTechniqueIds(model: PreviewModel): string[] {
  const ids = new Set<string>();
  for (const axis of AXES) {
    if (axis.manualOnly) continue;
    for (const row of categorySummary(model, axis.id).contributors) ids.add(row.techniqueId);
  }
  return [...ids];
}

export function contributionSlotCount(model: PreviewModel): number {
  return AXES.reduce((sum, axis) => {
    if (axis.manualOnly) return sum;
    return sum + categorySummary(model, axis.id).contributors.length;
  }, 0);
}

export function scoreText(model: PreviewModel, mode: PreviewMode, axisId: AxisId): string {
  if (mode === 'manual') {
    const score = model.manual[axisId];
    return score == null ? 'Not rated' : String(score);
  }
  const summary = categorySummary(model, axisId);
  if (summary.status === 'manual-only') return 'Manual only';
  if (summary.score == null) return 'Not rated';
  return formatDerived(summary.score);
}

export function chartLabel(model: PreviewModel, mode: PreviewMode): string {
  const bits = AXES.map((axis) => `${axis.label} ${scoreText(model, mode, axis.id)}`).join(', ');
  const modeName = mode === 'manual' ? 'Manual check-in' : 'Technique summary';
  return `Regular octagon. Eight areas. The blue line is the ratings and stops where an area has no rating. ${modeName}. ${bits}.`;
}

export type DetailCopy = {
  meaning: string;
  scoreLine: string;
  how: string;
  techniques: { id: string; name: string; line: string }[];
};

export function detailCopy(model: PreviewModel, axisId: AxisId, mode: PreviewMode): DetailCopy {
  const axis = axisById(axisId);
  const summary = categorySummary(model, axisId);
  const meaning = axis.meaning;
  if (mode === 'manual') return manualDetail(model, axis, summary, meaning);
  return techniqueDetail(axis, summary, meaning);
}

export function setLatestRating(model: PreviewModel, techniqueId: string, rating: Rating | null): PreviewModel {
  const technique = model.techniques.find((row) => row.id === techniqueId);
  if (!technique) return model;
  if (rating == null) {
    return { ...model, cards: model.cards.filter((row) => row.techniqueId !== techniqueId) };
  }
  const existing = cardsFor(model, techniqueId);
  const latest = latestCard(existing);
  if (!latest) {
    return {
      ...model,
      cards: [...model.cards, card(`card-${techniqueId}-draft`, techniqueId, rating, '2026-11-08T18:00:00.000Z')],
    };
  }
  return {
    ...model,
    cards: model.cards.map((row) => (row.id === latest.id ? { ...row, rating } : row)),
  };
}

export function setTechniqueCategories(model: PreviewModel, techniqueId: string, categories: readonly string[]): PreviewModel {
  const technique = model.techniques.find((row) => row.id === techniqueId);
  if (!technique) return model;
  const unique = SKILL_IDS.filter((id) => categories.includes(id));
  return {
    ...model,
    techniques: model.techniques.map((row) => (row.id === techniqueId ? { ...row, categories: [...unique] } : row)),
  };
}

export function setManualScore(model: PreviewModel, axisId: AxisId, rating: Rating | null): PreviewModel {
  const manual: ManualScores = { ...model.manual };
  if (rating == null) delete manual[axisId];
  else manual[axisId] = rating;
  return { ...model, manual };
}

export function legacyControlMissing(model: PreviewModel): boolean {
  return model.legacyOmitted.includes('guard-control') && model.manual['guard-control'] == null;
}

function manualDetail(
  model: PreviewModel,
  axis: AxisDefinition,
  summary: CategorySummary,
  meaning: string,
): DetailCopy {
  const score = model.manual[axis.id] ?? null;
  const techniques = relatedLines(summary, false);
  if (model.legacyOmitted.includes(axis.id) && score == null) {
    return {
      meaning,
      scoreLine: 'Manual check-in: not rated.',
      how: 'This example check-in has no score here. The open corner is not a score of 0. An older seven-area check-in is not rewritten, and no score is invented.',
      techniques,
    };
  }
  if (model.legacyOmitted.includes(axis.id) && score != null) {
    return {
      meaning,
      scoreLine: `Manual check-in draft: ${score}.`,
      how: `The example check-in had no ${axis.label} score. ${score} is only a preview draft. It is not written onto a saved check-in.`,
      techniques,
    };
  }
  if (score == null) {
    return {
      meaning,
      scoreLine: 'Manual check-in: not rated.',
      how: 'No manual score is set. The open corner is not a zero.',
      techniques,
    };
  }
  const guardNote =
    axis.id === 'guard-control'
      ? ' Deep half guard is a sample position on Guard/Control. A typed phrase like “D-path guard” is not guessed on this page. The technique ratings do not change this manual score.'
      : ' Technique ratings do not change this manual score.';
  return {
    meaning,
    scoreLine: `Manual check-in: ${score}.`,
    how: `${axis.label} is an overall self-assessment score.${guardNote}`,
    techniques,
  };
}

function techniqueDetail(axis: AxisDefinition, summary: CategorySummary, meaning: string): DetailCopy {
  if (axis.manualOnly) {
    const manual = summary.manualScore == null ? 'not rated' : String(summary.manualScore);
    return {
      meaning,
      scoreLine: 'From techniques: manual only.',
      how: `${axis.label} stays on the manual check-in (${manual}). Technique ratings are not a measure of it, so this preview does not invent a number. The corner stays open on the technique shape.`,
      techniques: [],
    };
  }
  if (summary.score == null) {
    const tagged = summary.taggedCount === 0 ? 'Nothing is tagged here.' : `${summary.taggedCount} tagged, none rated.`;
    return {
      meaning,
      scoreLine: 'From techniques: not rated.',
      how: `${tagged} Unrated techniques are left out. This corner is not a zero.`,
      techniques: relatedLines(summary, true),
    };
  }
  const names = summary.contributors.map((row) => `${row.name} ${row.rating}`).join(', ');
  const earlier = summary.contributors.flatMap((row) =>
    row.earlier.map((cardRow) => `An earlier ${row.name} card rated ${cardRow.rating} is the same technique, so it is not a second vote.`),
  );
  const leftOut = summary.unrated.map((row) => `${row.name} is tagged and has no rating, so it is left out, not scored as 0.`);
  const multi = summary.contributors
    .filter((row) => row.techniqueId === 'tech-arm-drag')
    .map(
      () =>
        'Arm drag to the back is also tagged to the other category on its row. It counts once in each tagged category and still counts as one technique.',
    );
  const coverage = `${summary.ratedCount} rated of ${summary.taggedCount} tagged.`;
  return {
    meaning,
    scoreLine: `From techniques: ${formatDerived(summary.score)}.`,
    how: ['Latest ratings: ' + names + '.', summary.formula + '.', coverage, ...earlier, ...leftOut, ...multi]
      .filter(Boolean)
      .join(' '),
    techniques: relatedLines(summary, true),
  };
}

function relatedLines(summary: CategorySummary, counted: boolean): { id: string; name: string; line: string }[] {
  const rated = summary.contributors.map((row) => ({
    id: row.techniqueId,
    name: row.name,
    line: counted
      ? `${kindLabel(row.kind)}. Latest ${row.rating} (${TECHNIQUE_RATING_WORDS[row.rating]}). ${earlierNote(row)}`
      : `${kindLabel(row.kind)}. Latest ${row.rating} (${TECHNIQUE_RATING_WORDS[row.rating]}). Not added into the manual check-in. ${earlierNote(row)}`,
  }));
  const open = summary.unrated.map((row) => ({
    id: row.techniqueId,
    name: row.name,
    line: counted ? 'Tagged. No rating, so it is left out of the average. Not a zero.' : 'Tagged. No rating. Not added into the manual check-in.',
  }));
  return [...rated, ...open];
}

function earlierNote(row: Contributor): string {
  if (row.earlier.length === 0) return '';
  const bits = row.earlier.map((cardRow) => String(cardRow.rating)).join(', ');
  return `Earlier card ${bits} is not counted.`;
}

function kindLabel(kind: IndexKind): string {
  return kind === 'position' ? 'Position' : 'Movement';
}

function technique(id: string, name: string, kind: IndexKind, categories: SkillAxisId[]): TechniqueRecord {
  return { id, name, kind, categories, sample: true };
}

function card(id: string, techniqueId: string, rating: Rating, loggedAt: string): JournalCard {
  return { id, techniqueId, rating, loggedAt };
}
