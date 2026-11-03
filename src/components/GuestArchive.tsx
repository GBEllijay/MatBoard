import { useState } from 'react';
import { Sheet } from './Sheet';
import { loadGuests, upsertGuest, useGuestOnRoster, type GuestCompetitor } from '../lib/guestCompetitors';
import { ADULT_BELTS, KIDS_BELTS } from '../lib/rosterStore';

const EMPTY = { name: '', belt: 'White', division: '', gym: '', note: '', lastEvent: '' };

export function GuestArchive() {
  const [guests, setGuests] = useState<GuestCompetitor[]>(() => loadGuests(localStorage));
  const [editor, setEditor] = useState<(typeof EMPTY & { id?: string }) | null>(null);
  const [note, setNote] = useState('');
  const reload = () => setGuests(loadGuests(localStorage));

  const save = () => {
    if (!editor) return;
    const saved = upsertGuest(localStorage, editor);
    if (!saved) {
      setNote('Add a name and a belt.');
      return;
    }
    setEditor(null);
    setNote('');
    reload();
  };

  return (
    <section className="roster__csv" aria-label="Guest competitors">
      <h2>Guest competitors</h2>
      <p>
        Outside competitors stay in this archive. They are not Advantage students and get no messages. Find a guest,
        edit the card, and use it again at the next tournament.
      </p>
      <button type="button" className="btn" onClick={() => setEditor({ ...EMPTY })}>
        Add guest
      </button>
      {note ? <p role="status">{note}</p> : null}
      {guests.length ? (
        <ul className="roster__list">
          {guests.map((guest) => (
            <li key={guest.id}>
              <article className="roster-card">
                <h3>{guest.name}</h3>
                <p className="roster-card__meta">
                  {guest.belt}
                  {guest.division ? ` · ${guest.division}` : ''}
                  {guest.gym ? ` · ${guest.gym}` : ''}
                </p>
                {guest.lastEvent ? <p className="roster-card__meta">{guest.lastEvent}</p> : null}
                <div className="roster-card__actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      const placed = useGuestOnRoster(guest);
                      setNote(placed ? `${guest.name} is on the competitor roster.` : 'Could not place that guest.');
                    }}
                  >
                    Use on this roster
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() =>
                      setEditor({
                        id: guest.id,
                        name: guest.name,
                        belt: guest.belt,
                        division: guest.division,
                        gym: guest.gym,
                        note: guest.note,
                        lastEvent: guest.lastEvent,
                      })
                    }
                  >
                    Edit guest
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <p>No guests yet.</p>
      )}
      <Sheet open={Boolean(editor)} title={editor?.id ? 'Edit guest' : 'Add guest'} onClose={() => setEditor(null)} portal>
        {editor ? (
          <>
            <label>
              Name
              <input aria-label="Guest name" value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
            </label>
            <label>
              Belt
              <select aria-label="Guest belt" value={editor.belt} onChange={(event) => setEditor({ ...editor, belt: event.target.value })}>
                {[...ADULT_BELTS, ...KIDS_BELTS].map((belt) => (
                  <option key={belt} value={belt}>
                    {belt}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Division
              <input aria-label="Guest division" value={editor.division} onChange={(event) => setEditor({ ...editor, division: event.target.value })} />
            </label>
            <label>
              Gym
              <input aria-label="Guest gym" value={editor.gym} onChange={(event) => setEditor({ ...editor, gym: event.target.value })} />
            </label>
            <label>
              Last event
              <input aria-label="Guest last event" value={editor.lastEvent} onChange={(event) => setEditor({ ...editor, lastEvent: event.target.value })} />
            </label>
            <label>
              Note
              <textarea aria-label="Guest note" rows={3} value={editor.note} onChange={(event) => setEditor({ ...editor, note: event.target.value })} />
            </label>
            <button type="button" className="btn" onClick={save}>
              Save guest
            </button>
          </>
        ) : null}
      </Sheet>
    </section>
  );
}
