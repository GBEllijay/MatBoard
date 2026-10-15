import { useState } from 'react';
import type { JournalClip } from '../../lib/progress/types';
import { PROGRESS_NOTE_MAX } from '../../lib/progress/types';
import {
  addJournalClip,
  deleteJournalClip,
  searchStudentClips,
  setClipNote,
  updateJournalClip,
} from '../../lib/studentEdition';
import { LeatherHeader, StudentMarks, useStudentFile } from './chrome';

export function VideoLibraryPage() {
  const { report, commit } = useStudentFile();
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState('');
  const clips = report.clips ?? [];
  const matched = new Set(searchStudentClips(report, query).map((clip) => clip.id));
  const shown = clips.filter((clip) => !query.trim() || matched.has(clip.id) || clip.id === editing);

  const saveNew = () => {
    try {
      commit(addJournalClip(report, url, description));
      setUrl('');
      setDescription('');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that video.');
    }
  };

  const saveEdit = (clip: JournalClip) => {
    try {
      commit(updateJournalClip(report, clip.id, editUrl, editDescription));
      setEditing(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that video.');
    }
  };

  return (
    <main className="student student-frame">
      <StudentMarks />
      <LeatherHeader title="Video Library" />
      <div className="student-paper">
        <div className="student-sheet">
          <section className="student-clips" aria-label="Video Library">
            <p className="student-quiet">
              Each link opens in a new tab. Any http or https address is fine, including YouTube, Instagram, and Facebook.
            </p>
            <label className="ink student-search">
              <span className="ink__label">Search</span>
              <input
                aria-label="Search videos"
                value={query}
                placeholder="Technique, drill, or link"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {shown.length === 0 ? <p className="student-quiet">No videos yet.</p> : null}
            {shown.map((clip) => (
              <article key={clip.id} className="ink student-clip">
                {editing === clip.id ? (
                  <>
                    <label className="ink__label">
                      Link
                      <input
                        aria-label={`Edit link for ${clip.description}`}
                        value={editUrl}
                        onChange={(event) => setEditUrl(event.target.value)}
                      />
                    </label>
                    <label className="ink__label">
                      Technique or drill
                      <input
                        aria-label={`Edit technique for ${clip.description}`}
                        value={editDescription}
                        onChange={(event) => setEditDescription(event.target.value)}
                      />
                    </label>
                    <div className="student-clip__actions">
                      <button type="button" className="ink-btn" onClick={() => saveEdit(clip)}>
                        Save video changes
                      </button>
                      <button type="button" className="ink-btn" onClick={() => setEditing(null)}>
                        Cancel video edit
                      </button>
                    </div>
                  </>
                ) : (
                  <a href={clip.url} target="_blank" rel="noopener noreferrer">
                    {clip.description}
                  </a>
                )}
                <VideoNote
                  clip={clip}
                  onSave={(note) => commit(setClipNote(report, clip.id, note))}
                />
                {editing === clip.id ? null : (
                  <div className="student-clip__actions">
                    <button
                      type="button"
                      className="ink-btn"
                      onClick={() => {
                        setEditing(clip.id);
                        setEditUrl(clip.url);
                        setEditDescription(clip.description);
                        setConfirming(null);
                        setError('');
                      }}
                    >
                      {`Edit ${clip.description}`}
                    </button>
                    {confirming === clip.id ? (
                      <div className="student-confirm" role="group" aria-label={`Delete ${clip.description}`}>
                        <span>Delete this video?</span>
                        <button
                          type="button"
                          className="ink-btn"
                          onClick={() => {
                            commit(deleteJournalClip(report, clip.id));
                            setConfirming(null);
                          }}
                        >
                          {`Confirm delete ${clip.description}`}
                        </button>
                        <button type="button" className="ink-btn" onClick={() => setConfirming(null)}>
                          Keep video
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="ink-btn" onClick={() => setConfirming(clip.id)}>
                        {`Delete ${clip.description}`}
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
            <label className="ink">
              <span className="ink__label">Link</span>
              <input
                aria-label="Video link"
                inputMode="url"
                value={url}
                placeholder="https://"
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
            <label className="ink ink--wobble">
              <span className="ink__label">Technique or drill</span>
              <input
                aria-label="Technique or drill"
                value={description}
                placeholder="Armbar from closed guard"
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            {error ? <p role="alert">{error}</p> : null}
            <div className="student-clip__actions">
              <button type="button" className="ink-btn ink-btn--save" onClick={saveNew}>
                Add video
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function VideoNote({ clip, onSave }: { clip: JournalClip; onSave: (note: string) => void }) {
  const [note, setNote] = useState(clip.note ?? '');
  return (
    <label className="ink">
      <span className="ink__label">Notes</span>
      <textarea
        aria-label={`Notes for ${clip.description}`}
        rows={3}
        maxLength={PROGRESS_NOTE_MAX}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onBlur={() => {
          if (note !== (clip.note ?? '')) onSave(note);
        }}
      />
    </label>
  );
}
