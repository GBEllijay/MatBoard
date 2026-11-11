/**
 * Preview of the live Student D8 with sample cards so each face split can be seen.
 * Cards live in memory only. Nothing here reads or writes this phone's saved cards,
 * and leaving the page puts the saved file back.
 */
import { useLayoutEffect, useState } from 'react';
import type { AssessmentScore } from '../lib/studentAssessment.ts';
import type { IndexCardFile, IndexFaceId, StoredIndexCard } from '../lib/indexCards.ts';
import { LiveD8 } from './LiveD8.tsx';
import { enterIndexCardPreview, leaveIndexCardPreview } from './store.ts';

export const D8_GRID_PREVIEW_PATH = '/preview/d8-grid';

/** Added on top of each face's six built-in lines. */
const SAMPLE_TERMS: Partial<Record<IndexFaceId, readonly string[]>> = {
  // 6 + 3 = 9: still 3×3, every tile used.
  takedowns: ['Snap Down', 'Foot Sweep', 'Duck Under'],
  // 6 + 5 = 11: 4×4.
  passing: ['Leg Drag', 'Stack Pass', 'X Pass', 'Long Step', 'Headquarters'],
  // 6 + 12 = 18: 5×5.
  sweeps: [
    'Butterfly Hook Sweep',
    'Sickle Sweep',
    'Elevator Sweep',
    'Berimbolo',
    'Waiter Sweep',
    'Old School Sweep',
    'Kiss of the Dragon',
    'Lumberjack Sweep',
    'Balloon Sweep',
    'John Wayne Sweep',
    'Collar Drag',
    'Overhead Sweep',
  ],
  // 6 + 23 = 29: 5×5 with the 25 strongest drawn and "+4 more".
  submissions: [
    'Armbar from guard',
    'Guillotine',
    "D'Arce",
    'Anaconda',
    'Ezekiel',
    'Bow and Arrow',
    'Loop Choke',
    'Baseball Bat Choke',
    'Omoplata',
    'Straight Ankle Lock',
    'Heel Hook',
    'Kneebar',
    'Toe Hold',
    'Wrist Lock',
    'Arm Triangle',
    'Gogoplata',
    'North South Choke',
    'Paper Cutter',
    'Clock Choke',
    'Calf Slicer',
    'Monoplata',
    'Von Flue Choke',
    'Bicep Slicer',
  ],
};

const RATINGS: readonly AssessmentScore[] = [4, 3, 5, 2, 3, 4, 1, 3, 5, 2];

export function d8GridSampleFile(): IndexCardFile {
  const cards: StoredIndexCard[] = [];
  let order = 0;
  for (const [faceId, terms] of Object.entries(SAMPLE_TERMS) as [IndexFaceId, readonly string[]][]) {
    terms.forEach((name, index) => {
      order += 1;
      cards.push({
        id: `preview.${faceId}.${index + 1}`,
        faceId,
        name,
        rating: RATINGS[order % RATINGS.length],
        addedAt: order,
        tree: null,
      });
    });
  }
  return { version: 1, cards };
}

export function D8GridPreview() {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    enterIndexCardPreview(d8GridSampleFile());
    setReady(true);
    return () => leaveIndexCardPreview();
  }, []);
  return (
    <main className="d8-grid-preview" style={{ maxWidth: 960, margin: '0 auto', padding: '16px 12px 48px' }}>
      <p
        style={{
          margin: '0 0 12px',
          padding: '10px 14px',
          borderRadius: 12,
          background: 'rgba(244, 240, 228, 0.94)',
          color: '#1c140e',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          fontSize: 15,
        }}
      >
        Preview with sample cards. Nothing is saved. Takedowns has 9 cards (3×3), Passing 11 (4×4), Sweeps 18 (5×5),
        Submissions 29 (5×5, +4 more). The other faces keep their 6 built-in lines (3×3).
      </p>
      {ready ? <LiveD8 /> : null}
    </main>
  );
}
