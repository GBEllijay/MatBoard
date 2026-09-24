import { useState } from 'react';
import { useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayExitMark } from '../components/PlayExitMark';
import { Sheet } from '../components/Sheet';
import { COMPETITOR_SYSTEM_NAME } from '../lib/productNames';
import {
  draftFromFile,
  emptyRankingDraft,
  emptyRankingRow,
  getRankings,
  removeRankingFile,
  saveRankingFile,
  subscribeRankings,
  type RankingDraft,
  type RankingFile,
} from '../lib/rankingStore';

function useRankings() {
  return useSyncExternalStore(subscribeRankings, getRankings, getRankings);
}

function formatDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function RankingsPage() {
  const library = useRankings();
  const navigate = useNavigate();
  const [editor, setEditor] = useState<{ id: string | null; draft: RankingDraft } | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  return (
    <main className="roster rankings">
      <PlayExitMark
        to="/competitors"
        onExit={() => {
          navigate('/competitors');
        }}
      />
      <header className="roster__bar">
        <div className="roster__brand">
          <p className="roster__eyebrow">{COMPETITOR_SYSTEM_NAME}</p>
          <h1>Rankings / Results</h1>
        </div>
        <button type="button" className="btn" onClick={() => setEditor({ id: null, draft: emptyRankingDraft() })}>
          Add result file
        </button>
      </header>
      <p className="roster__lead">
        Tournament result files for Competitor Management. Record a name, date, division,
        placements, or win records. They stay on this device. Cloud sync comes later.
      </p>
      {library.files.length ? (
        <ul className="roster__list">
          {library.files.map((file) => (
            <li key={file.id}>
              <article className="roster-card">
                <header className="roster-card__head">
                  <h2>{file.name}</h2>
                </header>
                <p className="roster-card__meta">
                  {[formatDate(file.date), file.division].filter(Boolean).join(' · ') || 'No date or division yet'}
                </p>
                {file.rows.length ? (
                  <ol className="rankings__rows">
                    {file.rows.map((row) => (
                      <li key={row.id}>
                        <strong>{row.place}.</strong> {row.name}
                        {row.result ? <span> — {row.result}</span> : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="roster-card__note">No placements yet.</p>
                )}
                {pendingRemove === file.id ? (
                  <div className="roster-card__actions">
                    <span className="roster-card__confirm">Remove {file.name}?</span>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        removeRankingFile(file.id);
                        setPendingRemove(null);
                      }}
                    >
                      Yes, remove
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => setPendingRemove(null)}>
                      Keep
                    </button>
                  </div>
                ) : (
                  <div className="roster-card__actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setEditor({ id: file.id, draft: draftFromFile(file) })}
                    >
                      Edit
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => setPendingRemove(file.id)}>
                      Remove
                    </button>
                  </div>
                )}
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <p className="roster__empty">No result files yet. Add one for an in-house tournament.</p>
      )}
      <RankingEditor
        open={Boolean(editor)}
        title={editor?.id ? 'Edit result file' : 'Add result file'}
        draft={editor?.draft ?? emptyRankingDraft()}
        onChange={(draft) => setEditor((current) => (current ? { ...current, draft } : current))}
        onClose={() => setEditor(null)}
        onSave={() => {
          if (!editor) return;
          const saved = saveRankingFile(editor.draft, editor.id ?? undefined);
          if (saved) setEditor(null);
        }}
      />
    </main>
  );
}

function RankingEditor({
  open,
  title,
  draft,
  onChange,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  draft: RankingDraft;
  onChange: (draft: RankingDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const ready = Boolean(draft.name.trim());
  const patch = (partial: Partial<RankingDraft>) => onChange({ ...draft, ...partial });
  const patchRow = (id: string, partial: Partial<RankingFile['rows'][number]>) => {
    patch({
      rows: draft.rows.map((row) => (row.id === id ? { ...row, ...partial } : row)),
    });
  };

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <p className="roster-edit__copy">
        One file per tournament or division. Place, competitor, and a short result stay on this
        phone.
      </p>
      <label>
        Tournament name
        <input
          value={draft.name}
          onChange={(event) => patch({ name: event.target.value })}
          placeholder="Required"
          aria-label="Tournament name"
          autoComplete="off"
        />
      </label>
      <label>
        Date
        <input
          type="date"
          value={draft.date}
          onChange={(event) => patch({ date: event.target.value })}
          aria-label="Tournament date"
        />
      </label>
      <label>
        Division
        <input
          value={draft.division}
          onChange={(event) => patch({ division: event.target.value })}
          placeholder="Blue Belt, Kids Gi"
          aria-label="Division"
          autoComplete="off"
        />
      </label>
      <div className="rankings__editor-rows">
        {draft.rows.map((row, index) => (
          <fieldset key={row.id} className="rankings__row">
            <legend>Placement {index + 1}</legend>
            <label>
              Place
              <input
                type="number"
                min={1}
                max={64}
                inputMode="numeric"
                value={row.place}
                aria-label={`Place ${index + 1}`}
                onChange={(event) => patchRow(row.id, { place: Number(event.target.value) })}
              />
            </label>
            <label>
              Competitor
              <input
                value={row.name}
                aria-label={`Competitor ${index + 1}`}
                placeholder="Name"
                autoComplete="off"
                onChange={(event) => patchRow(row.id, { name: event.target.value })}
              />
            </label>
            <label>
              Result
              <input
                value={row.result}
                aria-label={`Result ${index + 1}`}
                placeholder="3-0 or Won final"
                autoComplete="off"
                onChange={(event) => patchRow(row.id, { result: event.target.value })}
              />
            </label>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => patch({ rows: draft.rows.filter((item) => item.id !== row.id) })}
            >
              Remove placement
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() =>
            patch({
              rows: [...draft.rows, emptyRankingRow(draft.rows.length + 1)],
            })
          }
        >
          Add placement
        </button>
      </div>
      {!ready ? <p className="roster-edit__error">Add a tournament name to save.</p> : null}
      <button type="button" className="btn" disabled={!ready} onClick={onSave}>
        Save result file
      </button>
    </Sheet>
  );
}
