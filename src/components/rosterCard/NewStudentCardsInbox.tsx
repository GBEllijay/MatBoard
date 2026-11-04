/**
 * New student cards. Students send their card after Save profile. Only the head coach
 * (owner or Instructors seat) approves; approval adds the card to the Student Roster.
 * Merge into an existing card fills blanks only and never overwrites coach fields.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  canApproveNewCards,
  parseStudentToCoachFile,
  pendingNewCards,
  readCoachInbox,
  receiveForCoach,
  STUDENT_TO_COACH_EVENT,
  writeCoachInbox,
  type CoachInboxItem,
} from '../../lib/studentToCoach';
import { approveNewStudentCard, dismissStudentNotice } from '../../lib/rosterCardActions';
import type { Student } from '../../lib/rosterStore';
import type { InstructorSeat } from '../../lib/instructorSeats';

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function useCoachInbox() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const bump = () => setTick((value) => value + 1);
    window.addEventListener(STUDENT_TO_COACH_EVENT, bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener(STUDENT_TO_COACH_EVENT, bump);
      window.removeEventListener('storage', bump);
    };
  }, []);
  return useMemo(() => readCoachInbox(store()), [tick]);
}

export function NewStudentCardsInbox({ seat, students }: { seat: InstructorSeat | null; students: Student[] }) {
  const inbox = useCoachInbox();
  const pending = pendingNewCards(inbox);
  const headCoach = canApproveNewCards(seat);
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');

  const importFile = async (file: File | undefined) => {
    const storage = store();
    if (!file || !storage) return;
    const packets = parseStudentToCoachFile(await file.text());
    if (!packets.length) {
      setNote('That file is not a card from Student Edition.');
      return;
    }
    const result = receiveForCoach(readCoachInbox(storage), packets);
    writeCoachInbox(storage, result.inbox);
    setNote(result.added ? `${result.added} new item${result.added === 1 ? '' : 's'} from students.` : 'Already in your inbox.');
  };

  return (
    <section className="roster__csv roster-inbox" aria-label="New student cards">
      <div className="roster__csv-bar">
        <h2 className="roster-inbox__title">
          New student cards{pending.length ? <span className="roster-inbox__count">{pending.length}</span> : null}
        </h2>
        <button type="button" className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
          Import from student
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="Import student card file"
          onChange={(event) => {
            void importFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
      {headCoach ? null : <p className="roster__csv-hint">Only the head coach approves new student cards.</p>}
      {note ? (
        <p className="roster__csv-summary" role="status">
          {note}
        </p>
      ) : null}
      {pending.length ? (
        <ul className="roster__list">
          {pending.map((item) => (
            <InboxCard key={item.packet.updateId} item={item} seat={seat} headCoach={headCoach} students={students} onNote={setNote} />
          ))}
        </ul>
      ) : (
        <p className="roster__csv-hint">No new cards. Students send theirs after Save profile.</p>
      )}
    </section>
  );
}

function InboxCard({
  item,
  seat,
  headCoach,
  students,
  onNote,
}: {
  item: CoachInboxItem;
  seat: InstructorSeat | null;
  headCoach: boolean;
  students: Student[];
  onNote: (text: string) => void;
}) {
  const [mergeInto, setMergeInto] = useState('');
  if (item.packet.type !== 'card-share') return null;
  const card = item.packet.card;
  const approve = () => {
    const storage = store();
    if (!storage) return;
    const result = approveNewStudentCard(readCoachInbox(storage), item, seat, mergeInto ? { mergeInto } : {});
    if (!result.ok) {
      onNote(result.error);
      return;
    }
    writeCoachInbox(storage, result.inbox);
    onNote(mergeInto ? `${card.displayName} merged. Your fields were kept.` : `${card.displayName} was added to the Student Roster.`);
  };
  return (
    <li>
      <article className="roster-card">
        <header className="roster-card__head">
          <div className="roster-card__identity">
            {card.photo ? <img className="roster-card__photo" src={card.photo} alt={`${card.displayName} photo, pending approval`} /> : null}
            <div className="roster-card__who">
              <h2>{card.displayName || 'Student'}</h2>
            </div>
          </div>
        </header>
        <p className="roster-card__meta">
          {card.beltLabel}
          {card.stripes ? ` · ${card.stripes} stripe${card.stripes === 1 ? '' : 's'}` : ''}
          {card.gymName ? ` · ${card.gymName}` : ''}
        </p>
        {card.photo ? <p className="roster-card__meta">Photo stays pending until you approve it on the card.</p> : null}
        <label className="roster-inbox__merge">
          Add as
          <select value={mergeInto} onChange={(event) => setMergeInto(event.target.value)} disabled={!headCoach}>
            <option value="">New Student Roster card</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                Merge into {student.name}
              </option>
            ))}
          </select>
        </label>
        <div className="roster-card__actions">
          <button type="button" className="btn" onClick={approve} disabled={!headCoach}>
            Approve
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              const storage = store();
              if (storage) writeCoachInbox(storage, dismissStudentNotice(readCoachInbox(storage), item.packet.updateId));
            }}
            disabled={!headCoach}
          >
            Decline
          </button>
        </div>
      </article>
    </li>
  );
}
