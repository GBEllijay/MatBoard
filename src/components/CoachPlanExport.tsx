import { useState, useSyncExternalStore } from 'react';
import { DriveConnectCard } from './DriveConnectCard';
import { Sheet } from './Sheet';
import { COACH_PLAN_CONNECT_DRIVE, COACH_PLAN_SAVE_LEAD, COACH_PLAN_SAVE_LINK } from '../lib/coachCopy';
import { cloudStorage, CONNECT_WITH_TITLE } from '../lib/cloudStorage';
import type { TrainingNotesPlan } from '../lib/trainingNotesStore';

/**
 * Limited Coach copy under Closing.
 * The phone save already happened as the coach typed.
 * With no Drive folder, the line opens the existing connect sheet.
 * "Click here" still does not write Drive yet.
 *
 * TODO: Save a copy of this plan on the connected Drive.
 * TODO: Do not reopen or repopulate older lesson plans from Drive here.
 */
export function CoachPlanExport({
  dateKey,
  plan,
}: {
  dateKey: string;
  plan: TrainingNotesPlan;
}) {
  const google = cloudStorage('googleDrive');
  const oneDrive = cloudStorage('oneDrive');
  const googleBinding = useSyncExternalStore(google.subscribe, google.getBindingSnapshot, () => null);
  const oneDriveBinding = useSyncExternalStore(oneDrive.subscribe, oneDrive.getBindingSnapshot, () => null);
  const connected = Boolean(googleBinding || oneDriveBinding);
  const [connectOpen, setConnectOpen] = useState(false);
  const [before, after] = COACH_PLAN_SAVE_LEAD.split(COACH_PLAN_SAVE_LINK);

  return (
    <aside className="notes__distribute" aria-label="Your Drive copy">
      {connected ? (
        <p>
          {before}
          <button
            type="button"
            className="home__text-btn"
            onClick={() => {
              // TODO: Save `plan` for `dateKey` on the connected Drive.
              // The on-phone lesson save is separate and must keep working.
              void dateKey;
              void plan;
            }}
          >
            {COACH_PLAN_SAVE_LINK}
          </button>
          {after}
        </p>
      ) : (
        <p>
          This plan saves to your phone as you type.{' '}
          <button type="button" className="home__text-btn" onClick={() => setConnectOpen(true)}>
            {COACH_PLAN_CONNECT_DRIVE}
          </button>{' '}
          to save a copy on your Drive.
        </p>
      )}
      <Sheet
        open={connectOpen && !connected}
        title={CONNECT_WITH_TITLE}
        onClose={() => setConnectOpen(false)}
        stacked
      >
        <DriveConnectCard />
      </Sheet>
    </aside>
  );
}
