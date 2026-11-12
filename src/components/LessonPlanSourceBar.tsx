import { useState } from 'react';
import { lessonSourceLabel, type LessonPlanSource } from '../lib/lessonPlanCopies';

type Props = {
  source: LessonPlanSource;
  /** Today only: the editor writes today's plan. */
  editable: boolean;
  templateExists: boolean;
  canEditTemplate: boolean;
  planHasContent: boolean;
  busy: boolean;
  note: string;
  onBackToTemplate: () => void;
  onUpdateTemplate: () => void;
};

/**
 * Which lesson plan is open: the gym template or this instructor's own copy.
 * Editing a template saves a new copy for this instructor. The template changes
 * only through "Update gym template" (owner and Coach seats).
 */
export function LessonPlanSourceBar(props: Props) {
  const [armed, setArmed] = useState<'reset' | 'template' | null>(null);
  const showReset = props.editable && props.source === 'mine' && props.templateExists;
  const showTemplate = props.editable && props.canEditTemplate && props.planHasContent;
  return (
    <div className="lesson-source" data-lesson-source={props.source} role="group" aria-label="Lesson plan source">
      <span className={`lesson-source__label lesson-source__label--${props.source}`} data-lesson-source-label="">
        {lessonSourceLabel(props.source)}
      </span>
      <span className="lesson-source__hint">
        {props.source === 'template'
          ? 'Edits save to your own plan. The gym template stays as it is.'
          : 'Your own copy. The gym template is not changed.'}
      </span>
      {showReset ? (
        <button
          type="button"
          className="btn btn--ghost"
          data-lesson-back-to-template=""
          disabled={props.busy}
          onClick={() => {
            if (armed !== 'reset') return setArmed('reset');
            setArmed(null);
            props.onBackToTemplate();
          }}
        >
          {armed === 'reset' ? 'Tap again: drop my changes and open the template' : 'Back to gym template'}
        </button>
      ) : null}
      {showTemplate ? (
        <button
          type="button"
          className="btn"
          data-lesson-update-template=""
          disabled={props.busy}
          onClick={() => {
            if (armed !== 'template') return setArmed('template');
            setArmed(null);
            props.onUpdateTemplate();
          }}
        >
          {armed === 'template' ? 'Tap again: replace the gym template with this plan' : 'Update gym template'}
        </button>
      ) : null}
      {props.note ? (
        <p className="lesson-source__note" role="status">
          {props.note}
        </p>
      ) : null}
    </div>
  );
}
