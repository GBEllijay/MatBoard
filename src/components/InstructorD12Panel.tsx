/**
 * Instructor teaching-shape ratings on the live character sheet.
 * Empty until this instructor saves scores. Never shows sample data.
 * After a save, the 1–5 rows sit behind New self-assessment, and the
 * face score tiles sit behind Expand.
 */
import { useState } from 'react';
import { LiveD12 } from './LiveD12';
import {
  INSTRUCTOR_D12_FACES,
  d12AxesFromScores,
  instructorD12HasRatings,
  instructorD12SeatKey,
  loadInstructorD12Scores,
  saveInstructorD12Scores,
  type InstructorD12FaceId,
  type InstructorD12Score,
  type InstructorD12Scores,
} from '../lib/instructorD12';

const SCALE = [1, 2, 3, 4, 5] as const;

export function InstructorD12Panel({ seatId }: { seatId: string | null }) {
  const seatKey = instructorD12SeatKey(seatId);
  const [saved, setSaved] = useState(() => loadInstructorD12Scores(localStorage, seatKey));
  const [draft, setDraft] = useState<InstructorD12Scores>(() => saved ?? {});
  const [status, setStatus] = useState('');
  const hasSaved = instructorD12HasRatings(saved);
  const [assessing, setAssessing] = useState(() => !hasSaved);
  const [scoresOpen, setScoresOpen] = useState(false);

  const setFace = (id: InstructorD12FaceId, value: InstructorD12Score) => {
    setDraft((current) => ({ ...current, [id]: value }));
    setStatus('');
  };

  const onSave = () => {
    const next = saveInstructorD12Scores(draft, localStorage, seatKey);
    const ok = instructorD12HasRatings(next);
    setSaved(ok ? next : null);
    setStatus('Saved.');
    if (ok) setAssessing(false);
  };

  const showForm = assessing || !hasSaved;

  return (
    <div className="ip-d12" data-testid="instructor-d12">
      <h3>Instructor D12</h3>
      <p className="ip-quiet">Twelve teaching faces, scored 1–5. Ratings stay on this browser.</p>
      {hasSaved ? (
        <>
          <LiveD12 scores={saved} />
          <button
            type="button"
            className="ip-expand"
            data-testid="instructor-d12-scores-expand"
            aria-expanded={scoresOpen}
            onClick={() => setScoresOpen((open) => !open)}
          >
            {scoresOpen ? 'Hide' : 'Expand'}
          </button>
          {scoresOpen ? (
            <ul className="ip-d8-scores ip-d12-scores" data-testid="instructor-d12-scores">
              {d12AxesFromScores(saved).map((face) => (
                <li key={face.id}>
                  <span>{face.label}</span>
                  <strong>{face.value ?? '–'}</strong>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="ip-quiet" data-testid="instructor-d12-empty">
          No teaching shape ratings yet. Rate each face 1–5 and save to see your Instructor D12 here.
          Sample scores are not shown.
        </p>
      )}
      {hasSaved && !showForm ? (
        <button
          type="button"
          className="ip-new-assessment"
          data-testid="instructor-d12-new-assessment"
          onClick={() => setAssessing(true)}
        >
          New self-assessment
        </button>
      ) : (
        <div className="sheet-d12__form" data-testid="instructor-d12-form">
          {INSTRUCTOR_D12_FACES.map((face) => (
            <div key={face.id} className="sheet-d12__face">
              <span>{face.label}</span>
              <div className="sheet-d12__scale" role="group" aria-label={`${face.label} rating`}>
                {SCALE.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={draft[face.id] === value ? 'sheet-d12__tap is-on' : 'sheet-d12__tap'}
                    aria-pressed={draft[face.id] === value}
                    aria-label={`${face.label} ${value}`}
                    data-testid={`instructor-d12-${face.id}-${value}`}
                    onClick={() => setFace(face.id, value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {showForm ? (
        <button type="button" className="ip-log-btn" data-testid="instructor-d12-save" onClick={onSave}>
          Save teaching shape
        </button>
      ) : null}
      {status ? (
        <p className="ip-quiet" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
