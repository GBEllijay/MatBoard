import { RECORD_FOR_REVIEW_LABEL } from '../lib/competitionCurriculum';
import type { ReviewSlot } from '../lib/replayAnalysis';
import { ReplayAnalysisCard } from './ReplayAnalysisCard';

type Props = {
  /** Stable id for the embedded recorder, e.g. `${plan.id}-intro`. */
  id: string;
  heading: string;
  slot: ReviewSlot | undefined;
  dateKey: string;
  readOnly: boolean;
  canCapture: boolean;
  onChange: (slot: ReviewSlot | undefined) => void;
};

/** Record for Review switch plus the embedded recorder, for the Intro and Closing (outro) sections. */
export function ReviewSlotControls({ id, heading, slot, dateKey, readOnly, canCapture, onChange }: Props) {
  const on = slot?.recordReview === true;
  const update = (next: ReviewSlot) => {
    const clean: ReviewSlot = {
      ...(next.recordReview ? { recordReview: true } : {}),
      ...(next.replayClip ? { replayClip: next.replayClip } : {}),
    };
    onChange(clean.recordReview || clean.replayClip ? clean : undefined);
  };
  return (
    <>
      <button
        type="button"
        className={on ? 'notes__break notes__break--on' : 'notes__break'}
        role="switch"
        data-record-review=""
        aria-checked={on}
        aria-label={`${RECORD_FOR_REVIEW_LABEL} for ${heading}`}
        disabled={readOnly}
        onClick={() => update({ ...slot, recordReview: !on })}
      >
        <span className="notes__switch" aria-hidden="true" />
        <span className="notes__break-copy">
          <span className="notes__break-label">{RECORD_FOR_REVIEW_LABEL}</span>
          {on ? <span className="notes__break-hint">Record or pick a clip to review after</span> : null}
        </span>
        <span className="notes__break-state">{on ? 'On' : 'Off'}</span>
      </button>
      {on ? (
        <ReplayAnalysisCard
          embedded
          replay={{ id, title: '', notes: '', clip: slot?.replayClip }}
          heading={heading}
          dateKey={dateKey}
          readOnly={readOnly}
          canCapture={canCapture}
          onChange={(patch) => {
            if ('clip' in patch) update({ ...slot, replayClip: patch.clip });
          }}
        />
      ) : null}
    </>
  );
}
