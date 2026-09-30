import { useState } from 'react';
import { DriveConnectCard } from './DriveConnectCard';
import { Sheet } from './Sheet';
import { CONNECT_WITH_TITLE } from '../lib/cloudStorage';
import { exportCoachPlanToOwnDrive } from '../lib/coachPlanExport';
import {
  COACH_PLAN_SAVE_LEAD,
  COACH_PLAN_UPLOAD_BUTTON,
  COACH_PLAN_UPLOAD_DONE,
  COACH_PLAN_UPLOAD_FAILED,
} from '../lib/coachCopy';
import { OPEN_MY_DRIVE_CONNECT } from '../lib/openMyDrive';
import type { TrainingNotesPlan } from '../lib/trainingNotesStore';

/**
 * Paid Coach copy of today's plan. Opens the coach's Drive and writes plan
 * text there. Does not upload technique videos and is not instructor distribution.
 */
export function CoachPlanExport({
  dateKey,
  plan,
}: {
  dateKey: string;
  plan: TrainingNotesPlan;
}) {
  const [connectOpen, setConnectOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    if (busy) return;
    setBusy(true);
    setNote('');
    try {
      const result = await exportCoachPlanToOwnDrive({ dateKey, plan });
      if (result.status === 'needs-drive') {
        setConnectOpen(true);
        return;
      }
      if (result.status === 'failed') {
        setNote(COACH_PLAN_UPLOAD_FAILED);
        return;
      }
      setNote(COACH_PLAN_UPLOAD_DONE);
      if (result.folderUrl) window.open(result.folderUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="notes__distribute" aria-label="Your Drive copy">
      <p>{COACH_PLAN_SAVE_LEAD}</p>
      <button
        type="button"
        className="btn notes__distribute-btn"
        disabled={busy}
        onClick={() => {
          void upload();
        }}
      >
        {COACH_PLAN_UPLOAD_BUTTON}
      </button>
      {note ? (
        <p className="notes__distribute-note" role="status">
          {note}
        </p>
      ) : null}
      <Sheet open={connectOpen} title={CONNECT_WITH_TITLE} onClose={() => setConnectOpen(false)} stacked>
        <p className="saver-sound-hint">{OPEN_MY_DRIVE_CONNECT}</p>
        <DriveConnectCard />
      </Sheet>
    </aside>
  );
}
