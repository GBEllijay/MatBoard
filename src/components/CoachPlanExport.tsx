import { COACH_PLAN_SAVE_LEAD, COACH_PLAN_SAVE_LINK } from '../lib/coachCopy';
import type { TrainingNotesPlan } from '../lib/trainingNotesStore';

/**
 * Limited Coach copy under Closing.
 * The phone save already happened as the coach typed. "Click here" does not
 * write Drive yet.
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
  const [before, after] = COACH_PLAN_SAVE_LEAD.split(COACH_PLAN_SAVE_LINK);

  return (
    <aside className="notes__distribute" aria-label="Your Drive copy">
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
    </aside>
  );
}
