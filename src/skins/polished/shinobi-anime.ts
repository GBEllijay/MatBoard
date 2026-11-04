import './fonts/shinobi-anime-fonts.css';
import './skin-root.css';
import './poster.css';
import './shinobi-anime.css';
import './poster-fit.css';
import { BAND_DECO, HEADER_CREST, METER_KNOB, TITLE_BRUSH, WORDMARK_EXTRA } from './shinobi-anime.deco.ts';

export * from './shinobi-anime.deco.ts';

export const POSTER = {
  fitLineFloor: 0.56,
  splitNums: true,
  headerCrest: HEADER_CREST,
  wordmarkExtra: WORDMARK_EXTRA,
  bandDeco: BAND_DECO,
  titleBrush: TITLE_BRUSH,
  meterKnob: METER_KNOB,
};
