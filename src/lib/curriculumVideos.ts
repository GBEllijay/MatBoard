/**
 * Competition Class videos that play in the Daily Training Videos window.
 * There is no separate library and no separate menu button.
 */

import {
  blockHeading,
  blockOffersClock,
  expectedToWorkMs,
  plansOnCurriculumDay,
  type CurriculumArchive,
  type CurriculumPlan,
} from './competitionCurriculum.ts';
import { safeTimerReturn } from './timerReturn.ts';

export const CURRICULUM_VIDEO_PARAM = 'curriculum';

export type CurriculumVideoCard = {
  blockId: string;
  title: string;
  clipId: string | null;
  mediaName: string;
  durationMs: number;
  locked: boolean;
};

function videoCard(plan: CurriculumPlan, blockId: string): CurriculumVideoCard | null {
  const block = plan.blocks.find((item) => item.id === blockId);
  if (!block || !blockOffersClock(block.kind) || block.timing !== 'video') return null;
  return {
    blockId: block.id,
    title: blockHeading(block),
    clipId: block.clipId,
    mediaName: block.mediaName,
    durationMs: expectedToWorkMs(block.expected),
    locked: plan.locked,
  };
}

/** Looping-video cards for one day, in curriculum order. Timer-only cards stay off this list. */
export function curriculumVideoCards(plans: readonly CurriculumPlan[]): CurriculumVideoCard[] {
  const cards: CurriculumVideoCard[] = [];
  for (const plan of plans) {
    for (const block of plan.blocks) {
      const card = videoCard(plan, block.id);
      if (card) cards.push(card);
    }
  }
  return cards;
}

export function curriculumVideoCardsOnDay(archive: CurriculumArchive, dateKey: string): CurriculumVideoCard[] {
  return curriculumVideoCards(plansOnCurriculumDay(archive, dateKey));
}

/** A card from any saved day, so a link can still open that clip in the shared window. */
export function curriculumVideoCardById(archive: CurriculumArchive, blockId: string): CurriculumVideoCard | null {
  for (const day of Object.values(archive.days)) {
    for (const plan of day.plans) {
      const card = videoCard(plan, blockId);
      if (card) return card;
    }
  }
  return null;
}

/** Open the existing Daily Training Videos window on one competition class card. */
export function techniquesPathForCurriculum(blockId: string, back?: string): string {
  const params = new URLSearchParams();
  params.set(CURRICULUM_VIDEO_PARAM, blockId);
  const safe = safeTimerReturn(back);
  if (safe) params.set('back', safe);
  return `/techniques?${params.toString()}`;
}
