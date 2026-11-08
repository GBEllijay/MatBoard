import { useState } from 'react';
import { PromotionHistoryList } from '../../pages/student/PromotionHistoryList';
import {
  PROMOTION_HISTORY_EXAMPLE,
  PROMOTION_HISTORY_EXAMPLE_BANNER,
  PROMOTION_HISTORY_PREVIEW_PATH,
} from './example';

export function PromotionHistoryPreview() {
  const [entries, setEntries] = useState(PROMOTION_HISTORY_EXAMPLE);
  const [dropId, setDropId] = useState('');
  return (
    <main className="phist-page">
      <div className="phist-shell">
        <p className="phist-banner" role="note">
          {PROMOTION_HISTORY_EXAMPLE_BANNER}
        </p>
        <p className="phist-kicker">Student preview</p>
        <h1>Promotion history</h1>
        <p className="phist-quiet">{PROMOTION_HISTORY_PREVIEW_PATH}</p>
        <p className="phist-note">
          This example keeps White 2014-02-03 and its 4 stripes. White 2014-02-15 is left off the example because the owner named that correction. The app does not delete that date from a journal by itself. Black is the current belt and has no date.
        </p>
        <PromotionHistoryList
          entries={entries}
          repeats={[]}
          dropId={dropId}
          onAskRemove={setDropId}
          onConfirmRemove={(historyId) => {
            setEntries((current) => current.filter((row) => row.historyId !== historyId));
            setDropId('');
          }}
          onKeep={() => setDropId('')}
        />
      </div>
    </main>
  );
}
