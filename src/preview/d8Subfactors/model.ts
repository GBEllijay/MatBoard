/**
 * Sample sub-factors for the D8 preview.
 * Conditioning and Mindset use the check-in labels.
 * The other six faces are proposed glossary lines. Nothing here is stored.
 */

import { AXES, SHEET_AXIS_IDS, type AxisId } from '../assessmentRadar/model.ts';
import {
  CONDITIONING_ITEMS,
  MINDSET_GOALS,
  type AssessmentScore,
  type ConditioningItemId,
  type MindsetGoalId,
} from '../../lib/studentAssessment.ts';

export const D8_SUBFACTORS_PATH = '/preview/d8-subfactors';

export const SUBFACTORS_PER_FACE = 6;

/** Short refusal when a new name repeats one already on that face. */
export const DUPLICATE_NAME = 'Already on this face.';

export type AddedTerm = {
  id: string;
  faceId: AxisId;
  label: string;
  tileIndex: number;
};

/** Blank names are ignored. A repeat on this face is rejected. Other faces do not count. */
export function reviewAddedName(labels: readonly string[], raw: string): { label: string } | { error: 'blank' | 'duplicate' } {
  const label = raw.trim().replace(/\s+/g, ' ');
  if (!label) return { error: 'blank' };
  const key = label.toLocaleLowerCase();
  if (labels.some((item) => item.toLocaleLowerCase() === key)) return { error: 'duplicate' };
  return { label };
}

export function labelsOnFace(face: FaceModel, added: readonly AddedTerm[]): string[] {
  return [...face.subfactors.map((line) => line.label), ...added.filter((item) => item.faceId === face.id).map((item) => item.label)];
}

/** Neutral chip. Same treatment as the term-card Sample chip, with this page's words. */
export const SAMPLE_CHIP = 'Sample scores';

/**
 * Sits with the crystalline preview banner.
 * Matches the term card: this page does not write a rating, a journal, or a D8 score.
 */
export const SUBFACTOR_DISCLAIMER =
  'Sample scores stay on this page. Nothing here is written to a rating, a journal, or a D8 score.';

export const PROPOSED_NOTE =
  'Proposed. These six lines use glossary names. They are not a saved checklist.';

export const SCISSOR_CHAIN_ID = 'scissor-mount-subs';

export type Subfactor = {
  id: string;
  faceId: AxisId;
  /** Rating row. Conditioning and Mindset use the check-in wording. */
  label: string;
  /** Short name on the diamond tile. */
  tile: string;
  /** Glossary headword when the label is a position of that term. */
  glossary?: string;
  definition?: string;
  sample: AssessmentScore;
};

export type FaceModel = {
  id: AxisId;
  label: string;
  proposed: boolean;
  subfactors: readonly Subfactor[];
};

export type BranchLink = {
  id: string;
  fromId: string;
  toId: string;
  chainId: string;
};

export type SampleChain = {
  id: string;
  title: string;
  /** Ordered steps. A fan, when present, leaves the last step for several lines on the next face. */
  steps: readonly string[];
  fan: readonly string[];
};

const SCORE = [1, 2, 3, 4, 5] as const;

function isScore(value: number): value is AssessmentScore {
  return SCORE.includes(value as AssessmentScore);
}

/**
 * Same rollup as lineScore in studentAssessment: average of the scored lines,
 * rounded to a 1–5 face score. Unscored lines are left out. None scored is null.
 */
export function faceScoreFromLines(values: readonly (number | null | undefined)[]): AssessmentScore | null {
  const scored = values.filter((value): value is AssessmentScore => typeof value === 'number' && isScore(value));
  if (!scored.length) return null;
  const rounded = Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length);
  return isScore(rounded) ? rounded : null;
}

function axisLabel(id: AxisId): string {
  return AXES.find((axis) => axis.id === id)?.label ?? id;
}

function proposed(
  faceId: AxisId,
  id: string,
  label: string,
  sample: AssessmentScore,
  definition: string,
  glossary?: string,
): Subfactor {
  return { id, faceId, label, tile: label, sample, definition, glossary: glossary ?? label };
}

const CONDITIONING_SAMPLE: Record<ConditioningItemId, AssessmentScore> = {
  warmup: 3,
  recovery: 2,
  speed: 4,
  stamina: 3,
  power: 2,
  flexibility: 4,
};

const CONDITIONING_TILE: Record<ConditioningItemId, string> = {
  warmup: 'Warm-up',
  recovery: 'Recovery',
  speed: 'Speed',
  stamina: 'Stamina',
  power: 'Power',
  flexibility: 'Flexibility',
};

const MINDSET_SAMPLE: Record<MindsetGoalId, AssessmentScore> = {
  'calm-focused': 4,
  'intentional-roll': 5,
  'game-plan': 3,
  prepared: 4,
  'coach-instructions': 5,
  'open-mind': 3,
};

const MINDSET_TILE: Record<MindsetGoalId, string> = {
  'calm-focused': 'Calm and focused',
  'intentional-roll': 'Intentional roll',
  'game-plan': 'Game plan',
  prepared: 'Prepared',
  'coach-instructions': "Coach's instructions",
  'open-mind': 'Open mind',
};

function officialFace<Id extends string>(
  id: AxisId,
  items: readonly { id: Id; label: string }[],
  samples: Record<Id, AssessmentScore>,
  tiles: Record<Id, string>,
): FaceModel {
  return {
    id,
    label: axisLabel(id),
    proposed: false,
    subfactors: items.map((item) => ({
      id: item.id,
      faceId: id,
      label: item.label,
      tile: tiles[item.id],
      sample: samples[item.id],
    })),
  };
}

const GUARD: FaceModel = {
  id: 'guard-control',
  label: axisLabel('guard-control'),
  proposed: true,
  subfactors: [
    proposed('guard-control', 'pos.closed-guard', 'Closed Guard', 4, 'Ankles locked around the opponent’s waist from bottom.'),
    proposed('guard-control', 'pos.half-guard', 'Half Guard', 3, 'Bottom controls one of the top player’s legs between both of theirs.'),
    proposed('guard-control', 'pos.mount', 'Mount', 5, 'Top sit on the torso with knees down; strong pin and attack base.'),
    proposed('guard-control', 'pos.side-control', 'Side Control', 4, 'Chest-to-chest pin beside the opponent without being in their guard.'),
    proposed('guard-control', 'pos.back-control', 'Back control', 3, 'Behind the opponent with hooks in and upper-body control.'),
    proposed('guard-control', 'pos.knee-on-belly', 'Knee on Belly', 2, 'Shin across the belly for mobile, high-pressure top control.'),
  ],
};

const PASSING: FaceModel = {
  id: 'passing',
  label: axisLabel('passing'),
  proposed: true,
  subfactors: [
    proposed('passing', 'pass.knee-slice', 'Knee slice pass', 4, 'Knee cutting across the trapped thigh into side control.'),
    proposed('passing', 'pass.torreando', 'Torreando pass', 3, 'Standing pass that clears the legs like a cape.'),
    proposed('passing', 'pass.over-under', 'Over-Under Pass', 2, 'Pressure pass with one arm over and one under the legs.'),
    proposed('passing', 'pass.body-lock', 'Body Lock Pass', 3, 'Pass that clamps around the torso after clearing the legs.'),
    proposed('passing', 'pass.smash', 'Smash Pass', 5, 'Pressure-oriented pass that uses weight and pins more than speed.'),
    proposed('passing', 'pass.pressure', 'Pressure Pass', 2, 'Slow smash-style pass that pins hips and shoulders.'),
  ],
};

const SWEEPS: FaceModel = {
  id: 'sweeps',
  label: axisLabel('sweeps'),
  proposed: true,
  subfactors: [
    proposed('sweeps', 'sweep.scissor', 'Scissor sweep', 4, 'Closed-guard sweep that scissors the legs while pulling them over.'),
    proposed('sweeps', 'sweep.hip-bump', 'Hip bump sweep', 3, 'Sit-up sweep that bumps them over your posted hip.'),
    proposed('sweeps', 'sweep.pendulum', 'Pendulum sweep', 5, 'Pendulum swing of the legs that puts them on their back.'),
    proposed('sweeps', 'sweep.flower', 'Flower sweep', 2, 'Closed-guard sweep under a hook that loads them over the shoulder.'),
    proposed('sweeps', 'sweep.tripod', 'Tripod sweep', 4, 'Open-guard sweep using a foot on the hip and a hook behind a leg.'),
    proposed('sweeps', 'sweep.butterfly', 'Butterfly sweep', 3, 'Elevate with butterfly hooks and roll them over.'),
  ],
};

const TAKEDOWNS: FaceModel = {
  id: 'takedowns',
  label: axisLabel('takedowns'),
  proposed: true,
  subfactors: [
    proposed('takedowns', 'td.double-leg', 'Double leg', 3, 'Shoot and capture both legs to drive them down.'),
    proposed('takedowns', 'td.single-leg', 'Single leg', 4, 'Attack one leg to finish a takedown.'),
    proposed('takedowns', 'td.arm-drag', 'Arm Drag', 2, 'Pulling the arm across to expose the back or angle.'),
    proposed('takedowns', 'td.hip-throw', 'Hip throw', 3, 'Load them over the hip and throw.'),
    proposed('takedowns', 'td.osoto', 'Osoto gari', 2, 'Major outer reap that chops the leg while driving back.'),
    proposed('takedowns', 'td.ankle-pick', 'Ankle Pick', 1, 'Grab an ankle while breaking posture to drop them.'),
  ],
};

const ESCAPES: FaceModel = {
  id: 'escapes-defense',
  label: axisLabel('escapes-defense'),
  proposed: true,
  subfactors: [
    proposed('escapes-defense', 'escape.mount', 'Mount Escape', 3, 'Getting out from under mount, often bridge-and-roll or elbow escape.'),
    proposed('escapes-defense', 'escape.side-control', 'Side Control Escape', 2, 'Recovering frames and hips to re-guard or reverse from side control.'),
    proposed('escapes-defense', 'escape.elbow', 'Elbow Escape', 4, 'Elbow-knee shrimp escape from mount or side pressure.'),
    proposed('escapes-defense', 'escape.bridge-roll', 'Bridge and Roll', 3, 'Trap an arm and bridge to reverse mount.'),
    proposed('escapes-defense', 'escape.shrimp', 'Shrimp', 5, 'Hip-escape scoot that creates space and recovers guard.'),
    proposed('escapes-defense', 'def.guard-retention', 'Guard Retention', 2, 'Recovering or rebuilding guard as they try to pass.'),
  ],
};

const SUBMISSIONS: FaceModel = {
  id: 'submissions',
  label: axisLabel('submissions'),
  proposed: true,
  subfactors: [
    proposed(
      'submissions',
      'sub.armbar-mount',
      'Armbar from mount',
      3,
      'Elbow hyperextension with the arm isolated against your hips.',
      'Armbar',
    ),
    proposed('submissions', 'sub.cross-collar', 'Cross collar choke', 4, 'Gi choke using deep crossed collar grips.'),
    proposed('submissions', 'sub.americana', 'Americana', 2, 'Shoulder lock bending the arm the opposite way from a kimura.'),
    proposed('submissions', 'sub.rnc', 'Rear naked choke', 5, 'No-gi blood choke from the back without using cloth.'),
    proposed('submissions', 'sub.triangle', 'Triangle choke', 3, 'Leg triangle around neck and one arm that cuts blood flow.'),
    proposed('submissions', 'sub.kimura', 'Kimura', 4, 'Figure-four shoulder lock driving the wrist behind the back.'),
  ],
};

const BY_ID = new Map<AxisId, FaceModel>(
  [
    GUARD,
    PASSING,
    SWEEPS,
    TAKEDOWNS,
    ESCAPES,
    SUBMISSIONS,
    officialFace('conditioning', CONDITIONING_ITEMS, CONDITIONING_SAMPLE, CONDITIONING_TILE),
    officialFace('mindset', MINDSET_GOALS, MINDSET_SAMPLE, MINDSET_TILE),
  ].map((face) => [face.id, face]),
);

/** Diamond order. Same eight faces as the crystalline preview. */
export const FACES: readonly FaceModel[] = SHEET_AXIS_IDS.map((id) => {
  const face = BY_ID.get(id);
  if (!face) throw new Error(`Missing sub-factor face ${id}`);
  return face;
});

const LINE_BY_ID = new Map<string, Subfactor>(FACES.flatMap((face) => face.subfactors.map((line) => [line.id, line])));

export function subfactorById(id: string): Subfactor | null {
  return LINE_BY_ID.get(id) ?? null;
}

export function faceById(id: AxisId): FaceModel {
  const face = FACES.find((item) => item.id === id);
  if (!face) throw new Error(`Missing face ${id}`);
  return face;
}

export function allSubfactors(): Subfactor[] {
  return FACES.flatMap((face) => [...face.subfactors]);
}

export function sampleRatings(faces: readonly FaceModel[] = FACES): Record<string, AssessmentScore> {
  const ratings: Record<string, AssessmentScore> = {};
  for (const face of faces) {
    for (const line of face.subfactors) ratings[line.id] = line.sample;
  }
  return ratings;
}

export function scoreFace(
  face: FaceModel,
  ratings: Readonly<Record<string, AssessmentScore | undefined>>,
  added: readonly Pick<AddedTerm, 'id' | 'faceId'>[] = [],
): AssessmentScore | null {
  return faceScoreFromLines([
    ...face.subfactors.map((line) => ratings[line.id]),
    ...added.filter((line) => line.faceId === face.id).map((line) => ratings[line.id]),
  ]);
}

/**
 * Sample trails. Each hop leaves its face.
 * Scissor sweep → Mount → armbar from mount, cross collar choke, and Americana.
 */
export const SAMPLE_CHAINS: readonly SampleChain[] = [
  {
    id: SCISSOR_CHAIN_ID,
    title: 'Scissor sweep → Mount → submissions',
    steps: ['sweep.scissor', 'pos.mount'],
    fan: ['sub.armbar-mount', 'sub.cross-collar', 'sub.americana'],
  },
  {
    id: 'closed-to-scissor',
    title: 'Closed Guard → Scissor sweep',
    steps: ['pos.closed-guard', 'sweep.scissor'],
    fan: [],
  },
  {
    id: 'hip-bump-mount',
    title: 'Hip bump sweep → Mount',
    steps: ['sweep.hip-bump', 'pos.mount'],
    fan: [],
  },
  {
    id: 'flower-mount',
    title: 'Flower sweep → Mount',
    steps: ['sweep.flower', 'pos.mount'],
    fan: [],
  },
  {
    id: 'pendulum-armbar',
    title: 'Pendulum sweep → Armbar from mount',
    steps: ['sweep.pendulum', 'sub.armbar-mount'],
    fan: [],
  },
  {
    id: 'knee-slice-kimura',
    title: 'Knee slice pass → Side Control → Kimura',
    steps: ['pass.knee-slice', 'pos.side-control', 'sub.kimura'],
    fan: [],
  },
  {
    id: 'torreando-side',
    title: 'Torreando pass → Side Control',
    steps: ['pass.torreando', 'pos.side-control'],
    fan: [],
  },
  {
    id: 'double-leg-side',
    title: 'Double leg → Side Control',
    steps: ['td.double-leg', 'pos.side-control'],
    fan: [],
  },
  {
    id: 'single-leg-side',
    title: 'Single leg → Side Control',
    steps: ['td.single-leg', 'pos.side-control'],
    fan: [],
  },
  {
    id: 'arm-drag-rnc',
    title: 'Arm Drag → Back control → Rear naked choke',
    steps: ['td.arm-drag', 'pos.back-control', 'sub.rnc'],
    fan: [],
  },
  {
    id: 'mount-escape-half',
    title: 'Mount Escape → Half Guard',
    steps: ['escape.mount', 'pos.half-guard'],
    fan: [],
  },
  {
    id: 'retention-closed',
    title: 'Guard Retention → Closed Guard',
    steps: ['def.guard-retention', 'pos.closed-guard'],
    fan: [],
  },
  {
    id: 'knee-belly-armbar',
    title: 'Knee on Belly → Armbar from mount',
    steps: ['pos.knee-on-belly', 'sub.armbar-mount'],
    fan: [],
  },
  {
    id: 'shrimp-closed',
    title: 'Shrimp → Closed Guard',
    steps: ['escape.shrimp', 'pos.closed-guard'],
    fan: [],
  },
  {
    id: 'butterfly-side',
    title: 'Butterfly sweep → Side Control',
    steps: ['sweep.butterfly', 'pos.side-control'],
    fan: [],
  },
];

export function linksOf(chains: readonly SampleChain[]): BranchLink[] {
  const links: BranchLink[] = [];
  for (const chain of chains) {
    for (let index = 0; index < chain.steps.length - 1; index += 1) {
      const fromId = chain.steps[index];
      const toId = chain.steps[index + 1];
      links.push({ id: `${chain.id}:${fromId}:${toId}`, fromId, toId, chainId: chain.id });
    }
    const last = chain.steps[chain.steps.length - 1];
    for (const toId of chain.fan) {
      links.push({ id: `${chain.id}:${last}:${toId}`, fromId: last, toId, chainId: chain.id });
    }
  }
  return links;
}

export const BRANCH_LINKS: readonly BranchLink[] = linksOf(SAMPLE_CHAINS);

export function chainById(id: string): SampleChain | null {
  return SAMPLE_CHAINS.find((chain) => chain.id === id) ?? null;
}

export function chainFaceIds(chain: SampleChain): AxisId[] {
  const ids: AxisId[] = [];
  for (const id of [...chain.steps, ...chain.fan]) {
    const line = subfactorById(id);
    if (line && !ids.includes(line.faceId)) ids.push(line.faceId);
  }
  return ids;
}

export function linksFrom(id: string): BranchLink[] {
  return BRANCH_LINKS.filter((link) => link.fromId === id);
}

/** Ids that are missing, or hops that stay on one face. */
export function brokenBranchTargets(links: readonly BranchLink[], lines: readonly Subfactor[]): string[] {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const broken: string[] = [];
  for (const link of links) {
    const from = byId.get(link.fromId);
    const to = byId.get(link.toId);
    if (!from) broken.push(link.fromId);
    if (!to) broken.push(link.toId);
    if (from && to && from.faceId === to.faceId) broken.push(`${link.id}:same-face`);
  }
  return broken;
}
