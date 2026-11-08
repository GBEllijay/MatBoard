import type { PromotionHistoryEntry } from '../../lib/studentRank';

export const PROMOTION_HISTORY_PREVIEW_PATH = '/preview/promotion-history';

/** Shown on the preview. This is not a journal from a phone. */
export const PROMOTION_HISTORY_EXAMPLE_BANNER =
  'Synthetic example. Not the owner\'s journal. No saved file was read or changed.';

/**
 * The owner named this example: keep White 2014-02-03 with its 4 stripes,
 * and do not show White 2014-02-15. The dates are the example, not a rule
 * that deletes a matching row from anyone else’s file.
 */
export const PROMOTION_HISTORY_EXAMPLE: readonly PromotionHistoryEntry[] = [
  { id: 'example-white', belt: 'white', label: 'White', awardedOn: '2014-02-03', tapeCount: 4, historyId: 'example-white', current: false },
  { id: 'example-blue', belt: 'blue', label: 'Blue', awardedOn: '2015-03-26', tapeCount: 4, historyId: 'example-blue', current: false },
  { id: 'example-purple', belt: 'purple', label: 'Purple', awardedOn: '2016-07-09', tapeCount: 4, historyId: 'example-purple', current: false },
  { id: 'example-brown', belt: 'brown', label: 'Brown', awardedOn: '2018-11-10', tapeCount: 4, historyId: 'example-brown', current: false },
  { id: 'current.black', belt: 'black', label: 'Black', awardedOn: '', tapeCount: 0, historyId: '', current: true },
];
