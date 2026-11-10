/**
 * In-memory index cards for the D8 preview.
 * Nothing here reads or writes a journal, a rating, a video, a tree, or a D8 score.
 */

import type { AssessmentScore } from '../../lib/studentAssessment.ts';
import type { AxisId } from '../assessmentRadar/model.ts';
import { FACES, faceScoreFromLines } from './model.ts';

/** The diamond never grows past a 3×3 of tiles. */
export const DIAMOND_CAP = 9;

/** Same readable cutoff the stage already uses for labels. Past this, variant B lists the face. */
export const ZOOM_LIST = 1.8;

export const EMPTY_BRANCHES = 'No branches yet.';

export const VARIANT_A_LABEL = 'Variant A · nine-cap';
export const VARIANT_B_LABEL = 'Variant B · fractal zoom-to-list';

export type PreviewVariant = 'a' | 'b';

/** Reserved so a technique tree can be attached later. Null means nothing is linked under the card. */
export type CardBranch = {
  id: string;
  name: string;
  children: CardBranch[];
};

export type CardNote = {
  id: string;
  text: string;
};

export type CardVideo = {
  title: string;
  href: string;
};

export type FaceCard = {
  id: string;
  faceId: AxisId;
  name: string;
  rating: AssessmentScore;
  /** Higher is more recent. Ties on rating keep the newer card on the diamond. */
  addedAt: number;
  journal: CardNote[];
  video: CardVideo | null;
  tree: CardBranch | null;
};

export function variantFromSearch(search: string): PreviewVariant {
  const value = new URLSearchParams(search).get('variant');
  return value === 'a' ? 'a' : 'b';
}

export function variantLabel(variant: PreviewVariant): string {
  return variant === 'a' ? VARIANT_A_LABEL : VARIANT_B_LABEL;
}

export function sampleCards(): FaceCard[] {
  let stamp = 0;
  return FACES.flatMap((face) =>
    face.subfactors.map((line) => ({
      id: line.id,
      faceId: face.id,
      name: line.label,
      rating: line.sample,
      addedAt: stamp++,
      journal: [],
      video: null,
      tree: null,
    })),
  );
}

/** Highest rating first. A tie keeps the most recently added card. */
export function strongestCards(cards: readonly FaceCard[], cap = DIAMOND_CAP): FaceCard[] {
  return [...cards]
    .sort((left, right) => right.rating - left.rating || right.addedAt - left.addedAt || left.name.localeCompare(right.name))
    .slice(0, cap);
}

export function moreCount(count: number, cap = DIAMOND_CAP): number {
  return Math.max(0, count - cap);
}

export function moreLabel(count: number, cap = DIAMOND_CAP): string | null {
  const extra = moreCount(count, cap);
  return extra > 0 ? `+${extra} more` : null;
}

/** Every card on the face, including ones that did not fit on the diamond. */
export function averageRating(cards: readonly { rating: AssessmentScore }[]): AssessmentScore | null {
  return faceScoreFromLines(cards.map((card) => card.rating));
}

export function branchesEmpty(tree: CardBranch | null): boolean {
  return tree == null || tree.children.length === 0;
}
