/**
 * Expected class list, confirm who was in class, send the recap, and absentee
 * copy requests. Personal planning only — not official membership attendance.
 */
import './instructorJournal.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GymClassOccurrence } from '../lib/gymCalendar';
import {
  confirmClassRoster,
  expectedForClass,
  fetchClassAttendance,
  linkedSendTargets,
  resolveAbsenteeRequest,
  whoInClassPrefill,
  type AbsenteeRequest,
  type ClassRsvp,
} from '../lib/classAttendance';
import { recapFromJournalEntry, recapHasShareable, sendClassRecapToStudents } from '../lib/classRecap';
import type { InstructorD12Card } from '../lib/instructorD12Cards';
import type { InstructorJournalEntry } from '../lib/instructorJournal';
import type { Student } from '../lib/rosterStore';

export function InstructorClassRoster({
  date,
  slot,
  slots,
  onPickSlot,
  roster,
  cards,
  entry,
  onPrefillWho,
  sandbox = false,
}: {
  date: string;
  slot: GymClassOccurrence | null;
  slots: readonly GymClassOccurrence[];
  onPickSlot: (slotId: string) => void;
  roster: readonly Student[];
  cards: readonly InstructorD12Card[];
  entry?: InstructorJournalEntry | null;
  onPrefillWho: (names: string, ids: string[]) => void;
  sandbox?: boolean;
}) {
  const [rsvps, setRsvps] = useState<ClassRsvp[]>([]);
  const [requests, setRequests] = useState<AbsenteeRequest[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!date) return;
    const result = await fetchClassAttendance({ date, slotId: slot?.slotId });
    setRsvps(result.rsvps);
    setRequests(result.requests);
  }, [date, slot?.slotId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const expected = useMemo(() => (slot ? expectedForClass(rsvps, slot.slotId, date) : []), [rsvps, slot, date]);
  const openRequests = requests.filter((row) => row.status === 'requested' && (!slot || row.slotId === slot.slotId));

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const row of expected) next[row.studentId] = row.status === 'attended' || row.status === 'planned';
    setSelected(next);
  }, [expected]);

  const fillWho = () => {
    if (!slot) return;
    const prefill = whoInClassPrefill(rsvps, slot.slotId, date);
    onPrefillWho(prefill.names, prefill.ids);
  };

  const toggle = (studentId: string) => {
    setSelected((current) => ({ ...current, [studentId]: !current[studentId] }));
  };

  const confirm = async () => {
    if (!slot) return;
    setBusy(true);
    setNote('');
    const attendedIds = Object.entries(selected).filter(([, on]) => on).map(([id]) => id);
    const missedIds = expected.map((row) => row.studentId).filter((id) => !attendedIds.includes(id));
    const names = Object.fromEntries(expected.map((row) => [row.studentId, row.displayName]));
    const result = await confirmClassRoster({ slotId: slot.slotId, date, attendedIds, missedIds }, { names });
    setBusy(false);
    if (!result.ok) {
      setNote(result.error || 'Could not confirm who was in class.');
      return;
    }
    const prefill = whoInClassPrefill(
      expected.map((row) => ({ ...row, status: attendedIds.includes(row.studentId) ? 'attended' : 'missed' })),
      slot.slotId,
      date,
    );
    onPrefillWho(prefill.names, prefill.ids);
    setNote('Saved who was in class.');
    await reload();
  };

  const send = async (studentIds: string[], absentee = false, requestId?: string) => {
    if (!entry) {
      setNote('Save the class journal entry first, then send the recap.');
      return;
    }
    const recap = recapFromJournalEntry(entry, cards, absentee);
    if (!recapHasShareable(recap)) {
      setNote('Mark notes, techniques, or videos as “Share with students” first.');
      return;
    }
    if (sandbox) {
      setNote('Preview only: this recap would go to the students in this class. Nothing was sent.');
      return;
    }
    setBusy(true);
    setNote('');
    const summary = await sendClassRecapToStudents({ entry, cards, studentIds, roster, absentee });
    if (requestId) await resolveAbsenteeRequest({ id: requestId, status: 'sent' });
    setBusy(false);
    const unlinked = summary.skippedUnlinked ? ` ${summary.skippedUnlinked} unlinked or guest students were skipped.` : '';
    setNote(`Sent to ${summary.sent} student${summary.sent === 1 ? '' : 's'}.${unlinked}`);
    await reload();
  };

  const sendTargets = entry
    ? linkedSendTargets(
        roster,
        (entry.whoInClassIds && entry.whoInClassIds.length
          ? entry.whoInClassIds
          : Object.entries(selected).filter(([, on]) => on).map(([id]) => id)),
      )
    : [];

  return (
    <div className="ij-class-roster" data-testid="ij-class-roster">
      {slots.length ? (
        <label className="ij-field">
          <span>Class on this date</span>
          <select
            aria-label="Class on this date"
            data-testid="ij-class-slot"
            value={slot?.slotId ?? ''}
            onChange={(event) => onPickSlot(event.target.value)}
          >
            <option value="">Choose a class</option>
            {slots.map((item) => (
              <option key={item.slotId} value={item.slotId}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="ip-quiet">No academy classes on this date. Students see the published class board on their calendars.</p>
      )}

      {slot ? (
        <>
          <p className="ij-sublabel">Planning to come</p>
          <p className="ip-quiet">Students marked this on their calendar. Confirm who was in class before you send a recap. This is not official membership attendance.</p>
          {expected.length ? (
            <ul className="ij-mini-list" data-testid="ij-expected-list">
              {expected.map((row) => (
                <li key={row.studentId}>
                  <label className="ij-check">
                    <input type="checkbox" checked={selected[row.studentId] === true} onChange={() => toggle(row.studentId)} />
                    <span>{`${row.displayName}${row.status === 'attended' ? ' (was here)' : ''}`}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ip-quiet">No one has marked this class yet.</p>
          )}
          <div className="cal-gym-day__actions">
            <button type="button" className="ij-btn-secondary" disabled={!expected.length} onClick={fillWho}>
              Fill who was in class
            </button>
            <button type="button" className="ij-btn-secondary" disabled={busy || !expected.length} onClick={() => void confirm()}>
              Confirm who was in class
            </button>
          </div>
        </>
      ) : null}

      {openRequests.length ? (
        <div data-testid="ij-absentee-requests">
          <p className="ij-sublabel">Absentee copy requests</p>
          <ul className="ij-mini-list">
            {openRequests.map((row) => (
              <li key={row.id}>
                <span>{`${row.displayName} · ${row.reason === 'traveling' ? 'traveling' : 'could not attend'}`}</span>
                <button
                  type="button"
                  className="ij-link-btn"
                  disabled={busy}
                  onClick={() => void send([row.studentId], true, row.id)}
                >
                  Send recap
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="ij-share-preview__footer">
        <button
          type="button"
          className="ij-btn-secondary"
          data-testid="ij-send-to-class"
          disabled={busy || !entry || sendTargets.length === 0}
          onClick={() => void send(sendTargets.map((card) => card.linkedStudentId ?? '').filter(Boolean))}
        >
          Send to class
        </button>
        <span className="ip-quiet">
          {sendTargets.length
            ? `Sends the shared recap to ${sendTargets.length} linked student${sendTargets.length === 1 ? '' : 's'}.`
            : 'Link students and mark who was in class to send the recap.'}
        </span>
      </div>
      {note ? (
        <p className={note.startsWith('Sent') || note.startsWith('Saved') || note.startsWith('Preview') ? 'ip-quiet' : 'ij-error'} role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
