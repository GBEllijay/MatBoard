/**
 * Owner-approved 2026-10-10. Names only.
 * Movement, defense, and the later position and submission names were added 2026-10-26.
 * Existing ids and names stay. The examples field stays empty.
 * `bjj-fundamentals-draft-1` is the earlier id for this same list. Import accepts it.
 */

import type { FundamentalsCatalog, FundamentalsCategory, FundamentalsItem } from './types.ts';

export const FUNDAMENTALS_CATALOG_ID = 'bjj-fundamentals-starter-1';
/** Same names, previous id. The parser records this as the starter catalog. */
export const FUNDAMENTALS_CATALOG_LEGACY_ID = 'bjj-fundamentals-draft-1';

export function canonicalFundamentalsCatalogId(id: string): string {
  if (id === FUNDAMENTALS_CATALOG_LEGACY_ID) return FUNDAMENTALS_CATALOG_ID;
  return id;
}

function item(id: string, name: string): FundamentalsItem {
  return { id, name, examples: [] };
}

function category(id: string, name: string, items: FundamentalsItem[]): FundamentalsCategory {
  return { id, name, items };
}

export const FUNDAMENTALS_CATALOG: FundamentalsCatalog = {
  id: FUNDAMENTALS_CATALOG_ID,
  title: 'BJJ fundamentals (starter)',
  draft: false,
  categories: [
    category('positions', 'Positions', [
      item('pos.closed-guard', 'Closed guard'),
      item('pos.open-guard', 'Open guard'),
      item('pos.half-guard', 'Half guard'),
      item('pos.mount', 'Mount'),
      item('pos.side-control', 'Side control'),
      item('pos.back-control', 'Back control'),
      item('pos.knee-on-belly', 'Knee on belly'),
      item('pos.standing', 'Standing'),
      item('pos.turtle', 'Turtle'),
      item('pos.north-south', 'North-south'),
      item('pos.scarf-hold', 'Scarf hold'),
      item('pos.butterfly-guard', 'Butterfly guard'),
    ]),
    category('sweeps', 'Sweeps', [
      item('sweep.scissor', 'Scissor sweep'),
      item('sweep.hip-bump', 'Hip bump sweep'),
      item('sweep.pendulum', 'Pendulum sweep'),
      item('sweep.flower', 'Flower sweep'),
      item('sweep.tripod', 'Tripod sweep'),
      item('sweep.butterfly', 'Butterfly sweep'),
    ]),
    category('escapes', 'Escapes', [
      item('escape.mount', 'Mount escape'),
      item('escape.side-control', 'Side control escape'),
      item('escape.back', 'Back escape'),
      item('escape.headlock', 'Headlock escape'),
    ]),
    category('passes', 'Passes', [
      item('pass.torreando', 'Torreando pass'),
      item('pass.knee-slice', 'Knee slice pass'),
      item('pass.leg-drag', 'Leg drag'),
      item('pass.stack', 'Stack pass'),
    ]),
    category('submissions', 'Submissions', [
      item('sub.armbar-guard', 'Armbar from guard'),
      item('sub.triangle', 'Triangle'),
      item('sub.kimura', 'Kimura'),
      item('sub.guillotine', 'Guillotine'),
      item('sub.rear-naked-choke', 'Rear naked choke'),
      item('sub.cross-collar', 'Cross collar choke'),
      item('sub.straight-ankle-lock', 'Straight ankle lock'),
      item('sub.americana', 'Americana'),
      item('sub.omoplata', 'Omoplata'),
      item('sub.wrist-lock', 'Wrist lock'),
    ]),
    category('takedowns', 'Takedowns', [
      item('td.double-leg', 'Double leg'),
      item('td.single-leg', 'Single leg'),
      item('td.arm-drag', 'Arm drag'),
      item('td.hip-throw', 'Hip throw'),
    ]),
    category('movement', 'Movement', [
      item('move.breakfalls', 'Breakfalls'),
      item('move.shrimp', 'Shrimp'),
      item('move.bridge', 'Bridge'),
      item('move.technical-standup', 'Technical lift/stand-up'),
    ]),
    category('defense', 'Defense', [
      item('def.guard-retention', 'Guard retention'),
      item('def.submission-defense', 'Submission defense'),
      item('def.sprawl', 'Sprawl'),
    ]),
  ],
};
