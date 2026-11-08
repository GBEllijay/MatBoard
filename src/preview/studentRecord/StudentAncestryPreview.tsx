import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  EXAMPLE_STUDENT,
  PREVIEW_ANCESTRY_PATH,
  PREVIEW_HOURS_PATH,
  PREVIEW_NOTE,
  addHeadTree,
  addUpwardTeacher,
  chainLine,
  exampleAncestry,
  setLineageVisible,
  timelineLine,
  type AncestryPreview,
  type LineageTree,
} from './model';
import './studentRecord.css';

export function StudentAncestryPreview() {
  const [state, setState] = useState<AncestryPreview>(() => exampleAncestry());

  const patchTree = (id: string, partial: Partial<LineageTree>) => {
    setState((current) => ({
      ...current,
      trees: current.trees.map((tree) => (tree.id === id ? { ...tree, ...partial } : tree)),
    }));
  };

  const patchUpward = (id: string, index: number, name: string) => {
    setState((current) => ({
      ...current,
      trees: current.trees.map((tree) =>
        tree.id === id ? { ...tree, upward: tree.upward.map((teacher, at) => (at === index ? name : teacher)) } : tree,
      ),
    }));
  };

  return (
    <main className="srec">
      <div className="srec-shell">
        <p className="srec-banner" role="note" data-testid="preview-banner">
          {PREVIEW_NOTE}
        </p>
        <p className="srec-kicker">Student preview</p>
        <h1>Teaching ancestry</h1>
        <p className="srec-quiet" data-testid="preview-path">
          {PREVIEW_ANCESTRY_PATH}
        </p>
        <p className="srec-note">
          Each tree starts with you, then your head instructor, then their teacher, and upward only as far as you know. A new head instructor is another tree. Timelines can overlap. No earlier teacher is required. This is not the academy profile.
        </p>
        <label className="srec-switch">
          <input
            type="checkbox"
            checked={state.visible}
            onChange={(event) => setState((current) => setLineageVisible(current, event.target.checked))}
          />
          Show lineage
        </label>
        {state.visible ? (
          <div className="srec-stack" data-testid="lineage-trees">
            {state.trees.map((tree, index) => {
              const timeline = timelineLine(tree);
              return (
                <section className="srec-card" key={tree.id} aria-label={`Lineage tree ${index + 1}`}>
                  <h2>{chainLine(EXAMPLE_STUDENT, tree)}</h2>
                  {timeline ? <p className="srec-note">{timeline}</p> : <p className="srec-quiet">No dates on this tree.</p>}
                  <label>
                    Head instructor
                    <input
                      type="text"
                      aria-label={`Head instructor ${index + 1}`}
                      value={tree.headName}
                      onChange={(event) => patchTree(tree.id, { headName: event.target.value })}
                    />
                  </label>
                  <div className="srec-dates">
                    <label>
                      Started
                      <input
                        type="date"
                        aria-label={`Tree ${index + 1} started`}
                        value={tree.startedOn}
                        onChange={(event) => patchTree(tree.id, { startedOn: event.target.value })}
                      />
                    </label>
                    <label>
                      Ended
                      <input
                        type="date"
                        aria-label={`Tree ${index + 1} ended`}
                        value={tree.endedOn}
                        disabled={tree.stillTraining}
                        onChange={(event) => patchTree(tree.id, { endedOn: event.target.value })}
                      />
                    </label>
                    <label className="srec-switch">
                      <input
                        type="checkbox"
                        checked={tree.stillTraining}
                        onChange={(event) => patchTree(tree.id, { stillTraining: event.target.checked })}
                      />
                      Still training
                    </label>
                  </div>
                  {tree.upward.map((teacher, level) => (
                    <label key={`${tree.id}-${level}`}>
                      {level === 0 ? 'Their teacher' : 'Teacher above that'}
                      <input
                        type="text"
                        aria-label={`Tree ${index + 1} teacher ${level + 1}`}
                        value={teacher}
                        onChange={(event) => patchUpward(tree.id, level, event.target.value)}
                      />
                    </label>
                  ))}
                  <div className="srec-actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => patchTree(tree.id, addUpwardTeacher(tree))}
                    >
                      Add teacher above
                    </button>
                  </div>
                </section>
              );
            })}
            <div className="srec-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setState((current) => ({ ...current, trees: addHeadTree(current.trees) }))}
              >
                Add head instructor
              </button>
            </div>
          </div>
        ) : (
          <p className="srec-note" data-testid="lineage-hidden">
            Lineage is hidden. The example trees are still here and come back when you show lineage.
          </p>
        )}
        <p className="srec-note">
          <Link to={PREVIEW_HOURS_PATH}>Estimated hours preview</Link>
        </p>
      </div>
    </main>
  );
}
