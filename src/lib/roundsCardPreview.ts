import { formatMss } from './format.ts';
import type { TrainingState } from './trainingStore.ts';

export type RoundsCardPreviewInput = Pick<
  TrainingState,
  'workMs' | 'breakMs' | 'rounds' | 'currentRound' | 'endless'
>;

export type RoundsCardPreview = {
  work: string;
  header: string;
  restLine: string;
  roundTimeLabel: 'ROUND TIME';
};

/** Copy for the White hub Rounds TV preview. Uses saved timer settings. */
export function roundsCardPreview(input: RoundsCardPreviewInput): RoundsCardPreview {
  const work = formatMss(Math.max(0, Math.round(input.workMs / 1000)));
  const rest = formatMss(Math.max(0, Math.round(input.breakMs / 1000)));
  const current = Math.max(1, Math.floor(input.currentRound) || 1);
  const header = input.endless ? `WORK · ROUND ${current}` : `WORK · ROUND ${current} / ${input.rounds}`;
  const restLine = input.endless ? `REST ${rest} · ENDLESS` : `REST ${rest} · ${input.rounds} ROUNDS`;
  return { work, header, restLine, roundTimeLabel: 'ROUND TIME' };
}
