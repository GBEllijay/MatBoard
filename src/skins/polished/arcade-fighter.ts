import './fonts/arcade-fighter-fonts.css';
import './skin-root.css';
import './poster.css';
import './arcade-fighter.css';
import './poster-fit.css';
import './arcade-layout.css';
import { BAND_DECO, HEADER_CREST, METER_KNOB, TITLE_BRUSH, WORDMARK_EXTRA } from './arcade-fighter.deco.ts';

export * from './arcade-fighter.deco.ts';

export const POSTER = {
  fitLineFloor: 0.56,
  splitNums: false,
  headerCrest: HEADER_CREST,
  wordmarkExtra: WORDMARK_EXTRA,
  bandDeco: BAND_DECO,
  titleBrush: TITLE_BRUSH,
  meterKnob: METER_KNOB,
};
