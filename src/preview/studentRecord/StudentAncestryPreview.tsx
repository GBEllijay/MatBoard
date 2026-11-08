import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  EXAMPLE_DIRECT_TEACHERS,
  EXAMPLE_TEACHERS,
  EXAMPLE_TRAINED_WITH,
  PREVIEW_ANCESTRY_PATH,
  PREVIEW_HOURS_PATH,
  PREVIEW_NOTE,
  ancestryBranch,
  ancestryTreeLines,
  datesAreBlank,
  teacherById,
  trainedWithLine,
  type TrainedWith,
} from './model';
import './studentRecord.css';

function Branch({ id }: { id: string }) {
  const person = teacherById(EXAMPLE_TEACHERS, id);
  if (!person) return null;
  return (
    <li>
      {person.name}
      {person.taughtBy ? (
        <ul>
          <Branch id={person.taughtBy} />
        </ul>
      ) : null}
    </li>
  );
}

export function StudentAncestryPreview() {
  const [rows, setRows] = useState<TrainedWith[]>(() => EXAMPLE_TRAINED_WITH.map((row) => ({ ...row })));
  const tree = ancestryTreeLines(EXAMPLE_TEACHERS, EXAMPLE_DIRECT_TEACHERS);

  const patch = (id: string, partial: Partial<TrainedWith>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...partial } : row)));
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
          The tree is who taught whom. The list below is instructors this example student trained with. Dates live only on that list. This is not the academy profile.
        </p>
        <div className="srec-split">
          <section className="srec-card" aria-label="Who taught whom">
            <h2>Who taught whom</h2>
            <p className="srec-note">Example Student is not saved. Blank dates do not appear here.</p>
            <ul className="srec-tree" data-testid="ancestry-tree">
              <li>
                Example Student (example)
                <ul>
                  {EXAMPLE_DIRECT_TEACHERS.map((id) => (
                    <Branch key={id} id={id} />
                  ))}
                </ul>
              </li>
            </ul>
            <p className="srec-quiet" data-testid="ancestry-lines">
              {tree.join(' · ')}
            </p>
          </section>
          <section className="srec-card" aria-label="Instructors I trained with">
            <h2>Instructors I trained with</h2>
            <p className="srec-note">
              {datesAreBlank(rows)
                ? 'Dates are blank, so the tree stays names only.'
                : 'These dates stay on this list. They are not added to the tree.'}
            </p>
            {rows.map((row) => (
              <div className="srec-row" key={row.id}>
                <strong>{trainedWithLine(row)}</strong>
                <div className="srec-dates">
                  <label>
                    Started
                    <input
                      type="date"
                      aria-label={`${row.name} started`}
                      value={row.startedOn}
                      onChange={(event) => patch(row.id, { startedOn: event.target.value })}
                    />
                  </label>
                  <label>
                    Ended
                    <input
                      type="date"
                      aria-label={`${row.name} ended`}
                      value={row.endedOn}
                      disabled={row.stillTraining}
                      onChange={(event) => patch(row.id, { endedOn: event.target.value })}
                    />
                  </label>
                  <label className="srec-switch">
                    <input
                      type="checkbox"
                      checked={row.stillTraining}
                      onChange={(event) => patch(row.id, { stillTraining: event.target.checked })}
                    />
                    Still training
                  </label>
                </div>
              </div>
            ))}
            <div className="srec-actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setRows((current) => current.map((row) => ({ ...row, startedOn: '', endedOn: '' })))}
              >
                Clear dates
              </button>
            </div>
            <p className="srec-quiet">
              Coach Quinn is on this list and not in the tree. {ancestryBranch(EXAMPLE_TEACHERS, 'west').join(' → ')} is in the tree and not on this list.
            </p>
          </section>
        </div>
        <p className="srec-note">
          <Link to={PREVIEW_HOURS_PATH}>Estimated hours preview</Link>
        </p>
      </div>
    </main>
  );
}
