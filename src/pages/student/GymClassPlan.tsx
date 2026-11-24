/**
 * Live gym classes on the student calendar. "I plan to attend" and "I was here"
 * are personal class planning, not official membership attendance.
 */
import './calendar.css';
import { useCallback, useEffect, useState } from 'react';
import { CLASS_LEVEL_META, dateHasGymClass, formatClassTime, occurrencesOnDate, WEEKDAY_LABELS, type GymCalendarState, type GymClassOccurrence } from '../../lib/gymCalendar';
import {
  fetchClassAttendance,
  myRsvp,
  requestAbsenteeCopy,
  submitClassRsvp,
  type AbsenteeReason,
  type AbsenteeRequest,
  type ClassRsvp,
  type RsvpStatus,
} from '../../lib/classAttendance';
import { ensureStableStudentId, readStableStudentId } from '../../lib/studentIdentity';
import { cleanDisplayName } from '../../lib/classAttendance';
import type { StudentProgressReport } from '../../lib/progress/types';

export function gymClassDaysIn(schedule: GymCalendarState | null, isos: readonly string[]): Set<string> {
  const days = new Set<string>();
  if (!schedule) return days;
  for (const iso of isos) {
    if (dateHasGymClass(schedule, iso)) days.add(iso);
  }
  return days;
}

export function GymWeekList({ schedule }: { schedule: GymCalendarState }) {
  return (
    <section className="ink" aria-label="Gym class schedule" data-testid="gym-class-schedule">
      <h2 className="ink__label">Gym class schedule</h2>
      <p className="student-quiet">From your academy&apos;s class board. It is not saved in your progress file.</p>
      <ul className="cal-gym">
        {schedule.classes.map((slot) => (
          <li key={slot.id}>{`${WEEKDAY_LABELS[slot.day]} · ${formatClassTime(slot.time)} · ${slot.title.trim() || 'Class'}`}</li>
        ))}
        {schedule.specials
          .filter((item) => item.date)
          .map((item) => (
            <li key={item.id}>{`${item.date} · ${item.title.trim() || item.body.trim()}`}</li>
          ))}
      </ul>
    </section>
  );
}

function reasonLabel(reason: AbsenteeReason): string {
  if (reason === 'traveling') return 'traveling';
  if (reason === 'missed') return 'could not attend';
  return 'requested a copy';
}

export function GymClassDayList({
  schedule,
  date,
  report,
  commit,
  onLoggedHere,
}: {
  schedule: GymCalendarState;
  date: string;
  report: StudentProgressReport;
  commit: (next: StudentProgressReport) => void;
  onLoggedHere?: () => void;
}) {
  const classes = occurrencesOnDate(schedule, date);
  const [rsvps, setRsvps] = useState<ClassRsvp[]>([]);
  const [requests, setRequests] = useState<AbsenteeRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const reload = useCallback(async () => {
    const result = await fetchClassAttendance({ date });
    setRsvps(result.rsvps);
    setRequests(result.requests);
  }, [date]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!classes.length) return null;

  const studentId = readStableStudentId(typeof localStorage === 'undefined' ? { getItem: () => null } : localStorage) ?? report.studentId;
  const displayName = cleanDisplayName(report.profile.displayName);

  const act = async (slot: GymClassOccurrence, status: RsvpStatus) => {
    setBusy(`${slot.slotId}:${status}`);
    setNote('');
    const ensured = typeof localStorage === 'undefined' ? { report, studentId } : ensureStableStudentId(report, localStorage);
    if (ensured.report !== report) commit(ensured.report);
    const result = await submitClassRsvp({
      slotId: slot.slotId,
      date,
      studentId: ensured.studentId || studentId,
      displayName,
      status,
    });
    setBusy(null);
    if (!result.ok) {
      setNote(result.error || 'Could not save that.');
      return;
    }
    await reload();
    if (status === 'attended') onLoggedHere?.();
  };

  const requestCopy = async (slot: GymClassOccurrence, reason: AbsenteeReason) => {
    setBusy(`${slot.slotId}:absentee`);
    setNote('');
    const ensured = typeof localStorage === 'undefined' ? { report, studentId } : ensureStableStudentId(report, localStorage);
    if (ensured.report !== report) commit(ensured.report);
    const result = await requestAbsenteeCopy({
      slotId: slot.slotId,
      date,
      studentId: ensured.studentId || studentId,
      displayName,
      reason,
    });
    setBusy(null);
    if (!result.ok) {
      setNote(result.error || 'Could not send that request.');
      return;
    }
    await reload();
  };

  return (
    <section className="ink" aria-label="Academy classes" data-testid="gym-class-day">
      <h2 className="ink__label">Academy classes</h2>
      <p className="student-quiet">Mark the classes you plan to attend. This is your plan, not official membership attendance.</p>
      <ul className="cal-gym-day">
        {classes.map((slot) => {
          const mine = myRsvp(rsvps, slot.slotId, date, studentId);
          const planned = mine?.status === 'planned';
          const here = mine?.status === 'attended';
          const request = requests.find((row) => row.slotId === slot.slotId && row.studentId === studentId);
          return (
            <li key={slot.slotId} className="cal-gym-day__row" data-testid={`gym-class-${slot.slotId}`}>
              <strong>{slot.label}</strong>
              {slot.location ? <span className="student-quiet">{slot.location}</span> : null}
              {slot.level && slot.level !== 'none' ? (
                <span className="cal-gym-day__level" data-level={slot.level}>
                  <i className="belt-swatch" data-level={slot.level} aria-hidden="true" />
                  {CLASS_LEVEL_META[slot.level].short}
                </span>
              ) : null}
              <div className="cal-gym-day__actions">
                <button
                  type="button"
                  className={planned ? 'ink-btn ink-btn--save' : 'ink-btn'}
                  aria-pressed={planned}
                  disabled={busy !== null}
                  onClick={() => void act(slot, planned ? 'cancelled' : 'planned')}
                >
                  {planned ? 'Planning to attend' : 'I plan to attend'}
                </button>
                <button
                  type="button"
                  className={here ? 'ink-btn ink-btn--save' : 'ink-btn'}
                  aria-pressed={here}
                  disabled={busy !== null}
                  onClick={() => void act(slot, here ? 'planned' : 'attended')}
                >
                  {here ? 'I was here' : 'I was here'}
                </button>
              </div>
              {request ? (
                <p className="student-quiet">
                  {request.status === 'sent'
                    ? 'Your coach sent an absentee copy. Check your inbox.'
                    : request.status === 'declined'
                      ? 'Your coach declined this absentee request.'
                      : `Absentee copy requested (${reasonLabel(request.reason)}).`}
                </p>
              ) : (
                <div className="cal-gym-day__absentee">
                  <span className="student-quiet">Missed class or traveling?</span>
                  <button type="button" className="ink-btn" disabled={busy !== null} onClick={() => void requestCopy(slot, 'missed')}>
                    Request a recap
                  </button>
                  <button type="button" className="ink-btn" disabled={busy !== null} onClick={() => void requestCopy(slot, 'traveling')}>
                    I was traveling
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {note ? <p role="alert">{note}</p> : null}
    </section>
  );
}
