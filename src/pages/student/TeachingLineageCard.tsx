import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { StudentProgressReport, TeachingLineage } from '../../lib/progress/types';
import { setTeachingLineage } from '../../lib/studentRank';
import {
  TEACHING_DISCLAIMER,
  addHeadTree,
  addTeacherAbove,
  chainNames,
  confirmSuggestion,
  declineSuggestion,
  renameTeacher,
  sanitizeTeaching,
  setTeachingVisible,
  suggestionForTree,
  unknownContinuation,
  teachingFromLineage,
} from '../../lib/teachingLineage';
import './teachingLineage.css';

export function TeachingLineageCard({
  report,
  commit,
}: {
  report: StudentProgressReport;
  commit: (next: StudentProgressReport) => void;
}) {
  const stored = report.rank?.teaching ? sanitizeTeaching(report.rank.teaching) : undefined;
  const view = stored ?? teachingFromLineage(report.rank?.lineage ?? []);
  const [open, setOpen] = useState(false);
  const save = (next: typeof view) => commit(setTeachingLineage(report, next));

  const update = (id: string, tree: (typeof view.trees)[number]) => {
    save({ ...view, trees: view.trees.map((item) => (item.id === id ? tree : item)) });
  };

  return (
    <section className="teach profile-card" aria-label="Teaching lineage" data-testid="teaching-lineage">
      <div className="teach__head">
        <h2>Teaching lineage</h2>
        <label className="teach__show">
          <input
            type="checkbox"
            checked={view.visible}
            onChange={(event) => save(setTeachingVisible(view, event.target.checked))}
          />
          Show lineage
        </label>
      </div>
      {view.visible && !open ? (
        <ol className="teach__graphic" data-testid="teaching-graphic">
          {view.trees.length === 0 ? (
            <li>You</li>
          ) : (
            view.trees.map((tree) => (
              <li key={tree.id}>
                {[...chainNames(tree)].reverse().concat('You').map((name) => (
                  <span key={`${tree.id}-${name}`}>{name}</span>
                ))}
              </li>
            ))
          )}
        </ol>
      ) : null}
      {view.visible && !open ? (
        <button type="button" className="teach__edit" onClick={() => setOpen(true)}>
          Edit
        </button>
      ) : null}
      {view.visible && open ? (
        <div className="teach__editor" data-testid="teaching-editor">
          {view.trees.map((tree, index) => (
            <TreeEditor key={tree.id} index={index} tree={tree} onChange={(next) => update(tree.id, next)} />
          ))}
          <button type="button" className="ink-btn ink-btn--save" onClick={() => save(addHeadTree(view))}>
            Add head instructor
          </button>
          <button type="button" className="ink-btn" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      ) : null}
      {view.visible ? null : (
        <p data-testid="teaching-hidden">Lineage is hidden. The names and dates stay on this phone.</p>
      )}
      <p className="teach__note">
        {TEACHING_DISCLAIMER}{' '}
        <Link to="/sources">Sources & references</Link>
      </p>
    </section>
  );
}

function TreeEditor({
  index,
  tree,
  onChange,
}: {
  index: number;
  tree: TeachingLineage['trees'][number];
  onChange: (tree: TeachingLineage['trees'][number]) => void;
}) {
  const suggestion = suggestionForTree(tree);
  const known = chainNames(tree).length > 0;
  return (
    <fieldset className="teach__tree">
      <legend>Head instructor {index + 1}</legend>
      <label>
        Head instructor
        <input
          type="text"
          aria-label={`Head instructor ${index + 1}`}
          value={tree.headName}
          onChange={(event) => onChange(renameTeacher(tree, 0, event.target.value))}
        />
      </label>
      <label>
        School
        <input
          type="text"
          aria-label={`School for head instructor ${index + 1}`}
          value={tree.school}
          onChange={(event) => onChange({ ...tree, school: event.target.value })}
        />
      </label>
      <div className="teach__dates">
        <label>
          Started
          <input
            type="date"
            aria-label={`Started with head instructor ${index + 1}`}
            value={tree.startedOn}
            onChange={(event) => onChange({ ...tree, startedOn: event.target.value })}
          />
        </label>
        <label>
          Ended
          <input
            type="date"
            aria-label={`Ended with head instructor ${index + 1}`}
            value={tree.endedOn}
            disabled={tree.stillTraining}
            onChange={(event) => onChange({ ...tree, endedOn: event.target.value })}
          />
        </label>
        <label className="teach__show">
          <input
            type="checkbox"
            checked={tree.stillTraining}
            onChange={(event) => onChange({ ...tree, stillTraining: event.target.checked })}
          />
          Still training
        </label>
      </div>
      {tree.upward.map((name: string, slot: number) => (
        <label key={`${tree.id}-up-${slot}`}>
          {slot === 0 ? 'Their teacher' : 'Teacher above that'}
          <input
            type="text"
            aria-label={`Teacher ${slot + 1} above head instructor ${index + 1}`}
            value={name}
            onChange={(event) => onChange(renameTeacher(tree, slot + 1, event.target.value))}
          />
        </label>
      ))}
      <button type="button" className="ink-btn" onClick={() => onChange(addTeacherAbove(tree))}>
        Add teacher above
      </button>
      {suggestion ? (
        <div className="teach__offer" role="group" aria-label={`Suggestion for ${suggestion.person}`}>
          <p>
            Suggested next teacher: {suggestion.nextTeacher}. This is a sourced candidate. It will not replace a name you already typed.
          </p>
          <div className="teach__actions">
            <button type="button" className="ink-btn ink-btn--save" onClick={() => onChange(confirmSuggestion(tree, suggestion))}>
              Add this teacher
            </button>
            <button type="button" className="ink-btn" onClick={() => onChange(declineSuggestion(tree, suggestion))}>
              Not this person
            </button>
          </div>
        </div>
      ) : null}
      {!suggestion && known && unknownContinuation(tree) ? (
        <p>No sourced next teacher for this name. Type the next one if you know it.</p>
      ) : null}
    </fieldset>
  );
}
