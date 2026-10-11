/**
 * Draft fundamentals list for owner review of the names.
 * Names only is the shipping decision. The examples field stays on each item and stays empty.
 */

import type { FundamentalsCatalog, FundamentalsCategory, FundamentalsItem } from './types.ts';

function item(id: string, name: string): FundamentalsItem {
  return { id, name, examples: [] };
}

function category(id: string, name: string, items: FundamentalsItem[]): FundamentalsCategory {
  return { id, name, items };
}

export const FUNDAMENTALS_CATALOG: FundamentalsCatalog = {
  id: 'bjj-fundamentals-draft-1',
  title: 'BJJ fundamentals (draft)',
  draft: true,
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
    ]),
    category('sweeps', 'Sweeps', [
      item('sweep.scissor', 'Scissor sweep'),
      item('sweep.hip-bump', 'Hip bump sweep'),
      item('sweep.pendulum', 'Pendulum sweep'),
      item('sweep.flower', 'Flower sweep'),
      item('sweep.tripod', 'Tripod sweep'),
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
    ]),
    category('takedowns', 'Takedowns', [
      item('td.double-leg', 'Double leg'),
      item('td.single-leg', 'Single leg'),
      item('td.arm-drag', 'Arm drag'),
      item('td.hip-throw', 'Hip throw'),
    ]),
  ],
};
