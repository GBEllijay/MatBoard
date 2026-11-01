import { POLISHED_SKINS, type PolishedTimerSlug } from '../lib/polishedSkins';
import mockTournament from './thumbs/mock-tournament.jpg';
import oldSchool from './thumbs/old-school.jpg';
import quickResult from './thumbs/quick-result.jpg';
import classic from './thumbs/classic.jpg';
import advantage from './thumbs/advantage.jpg';
import arcadeSb from './polished/thumbs/kids-arcade-scoreboard.jpg';
import arcadeTm from './polished/thumbs/kids-arcade-timer.jpg';
import stickerSb from './polished/thumbs/kids-sticker-scoreboard.jpg';
import stickerTm from './polished/thumbs/kids-sticker-timer.jpg';
import keynoteSb from './polished/thumbs/keynote-scoreboard.jpg';
import keynoteTm from './polished/thumbs/keynote-timer.jpg';
import metalSb from './polished/thumbs/heavy-metal-scoreboard.jpg';
import metalTm from './polished/thumbs/heavy-metal-timer.jpg';
import brasilSb from './polished/thumbs/brasil-scoreboard.jpg';
import brasilTm from './polished/thumbs/brasil-timer.jpg';
import woodSb from './polished/thumbs/woodblock-scoreboard.jpg';
import woodTm from './polished/thumbs/woodblock-timer.jpg';
import reggaeSb from './polished/thumbs/reggae-scoreboard.jpg';
import reggaeTm from './polished/thumbs/reggae-timer.jpg';
import psychedelicSb from './polished/thumbs/psychedelic-scoreboard.jpg';
import psychedelicTm from './polished/thumbs/psychedelic-timer.jpg';
import visionarySb from './polished/thumbs/visionary-scoreboard.jpg';
import visionaryTm from './polished/thumbs/visionary-timer.jpg';
import calcadaoTm from './polished/thumbs/calcadao-timer.jpg';

export const EXISTING_SKIN_THUMBS = {
  MOCK_TOURNAMENT: mockTournament,
  OLD_SCHOOL: oldSchool,
  QUICK_RESULT: quickResult,
  classic,
  themed: advantage,
} as const;

/** Calçadão is timer-only, so its scoreboard thumb is never shown; it reuses the timer one. */
const POLISHED: Record<PolishedTimerSlug, { scoreboard: string; timer: string }> = {
  'kids-arcade': { scoreboard: arcadeSb, timer: arcadeTm },
  'kids-sticker': { scoreboard: stickerSb, timer: stickerTm },
  keynote: { scoreboard: keynoteSb, timer: keynoteTm },
  'heavy-metal': { scoreboard: metalSb, timer: metalTm },
  brasil: { scoreboard: brasilSb, timer: brasilTm },
  woodblock: { scoreboard: woodSb, timer: woodTm },
  reggae: { scoreboard: reggaeSb, timer: reggaeTm },
  psychedelic: { scoreboard: psychedelicSb, timer: psychedelicTm },
  visionary: { scoreboard: visionarySb, timer: visionaryTm },
  calcadao: { scoreboard: calcadaoTm, timer: calcadaoTm },
};

export function polishedThumb(slug: PolishedTimerSlug, kind: 'scoreboard' | 'timer'): string {
  return POLISHED[slug][kind];
}

export { POLISHED_SKINS };
