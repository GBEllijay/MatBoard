/**
 * "I taught this" at the bottom of a Daily Lesson Plan.
 * Checking writes class_taught. Unchecking writes class_untaught.
 */
import { useSyncExternalStore } from 'react';
import { installGymActor } from '../lib/gymActor.ts';
import { classMinutes } from '../lib/gymEvents.ts';
import { setPlanTaught, subscribeGymEvents, taughtPlan } from '../lib/gymEventLog.ts';
import { planHasContent, type TrainingNotesPlan } from '../lib/trainingNotesStore.ts';
import './gymSheet.css';

export function TaughtToggle({ plan, dateKey }: { plan: TrainingNotesPlan; dateKey: string }) {
  installGymActor();
  const readTaught = () => taughtPlan(plan.id, dateKey);
  const taught = useSyncExternalStore(subscribeGymEvents, readTaught, readTaught);
  if (!planHasContent(plan)) return null;
  return (
    <label className="notes__taught">
      <input
        type="checkbox"
        checked={taught}
        onChange={(event) =>
          setPlanTaught({
            planId: plan.id,
            date: dateKey,
            taught: event.target.checked,
            template: plan.template ?? 'adult',
            classDesignation: plan.classDesignation,
            minutes: classMinutes(plan),
          })
        }
      />
      I taught this
    </label>
  );
}
