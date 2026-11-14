/**
 * Instructor character sheet on Instructor Edition. Same navy / logo-blue / cream paint as
 * /preview/instructor-sheet. Identity and teaching totals come from the
 * live seat and gym log, with the Instructor D12. The student profile block
 * comes below that and reuses Student Edition cards and stores (D8, belt,
 * mat hours, medals, body scan).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { CopyAccountReference } from './AccountReference';
import { InstructorD12Panel } from './InstructorD12Panel';
import { readAccountReference } from '../lib/accountReference.ts';
import {
  INSTRUCTOR_PROFILE_BELTS,
  INSTRUCTOR_NAME_MAX,
  instructorProfileSeatKey,
  loadInstructorProfile,
  resolveInstructorBelt,
  resolveInstructorName,
  saveInstructorProfile,
  seatInstructorName,
  subscribeInstructorProfile,
  type InstructorProfile,
  type InstructorProfileBeltId,
} from '../lib/instructorProfile.ts';
import { ensureGymBackfill, markPastPlansTaught } from '../lib/gymBackfill.ts';
import { installGymActor } from '../lib/gymActor.ts';
import { syncGymEvents } from '../lib/gymEventSync.ts';
import {
  eventsForView,
  gymViewFor,
  netClasses,
} from '../lib/gymEvents.ts';
import { getGymEventsSnapshot, readGymMeta, subscribeGymEvents } from '../lib/gymEventLog.ts';
import { useGymName } from '../hooks/useGymBrand.ts';
import { rankFaceLabel, wornBeltPreview } from '../lib/studentRank.ts';
import { useCurrentSeat } from './SeatSessionBar';
import { useStudentFile, useStudentPath } from '../pages/student/chrome';
import { useProfileMedia } from '../pages/student/ProfileIdentity';
import { BodyScanSection } from '../pages/student/BodyScan';
import { StudentCardLayout } from '../pages/student/StudentCardLayout';
import type { GymEvent } from '../lib/gymEvents.ts';
import '../preview/instructorProfile/instructorProfile.css';
import '../preview/instructorSheet/instructorSheet.css';
import '../student-edition.css';
import '../pages/student/profile.css';
import './instructorSheetLive.css';

function useEvents(): GymEvent[] {
  return useSyncExternalStore(subscribeGymEvents, getGymEventsSnapshot, getGymEventsSnapshot);
}

function useInstructorProfile(seatId: string | null): InstructorProfile {
  const seatKey = instructorProfileSeatKey(seatId);
  return useSyncExternalStore(
    subscribeInstructorProfile,
    () => loadInstructorProfile(localStorage, seatKey),
    () => loadInstructorProfile({ getItem: () => null }, seatKey),
  );
}


function hoursLabel(minutes: number): string {
  const hours = minutes / 60;
  if (hours < 10) {
    const text = hours.toFixed(1);
    return text.endsWith('.0') ? text.slice(0, -2) : text;
  }
  return String(Math.round(hours));
}

export function InstructorSheet() {
  installGymActor();
  const events = useEvents();
  const seat = useCurrentSeat();
  const [marked, setMarked] = useState<number | null>(null);
  const deviceGymName = useGymName();
  const { report, commit } = useStudentFile();
  const to = useStudentPath();
  const media = useProfileMedia();
  const saved = useInstructorProfile(seat?.id ?? null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(saved.name);
  const [draftBelt, setDraftBelt] = useState<InstructorProfileBeltId | ''>(saved.belt);
  useEffect(() => {
    ensureGymBackfill();
    void syncGymEvents();
  }, []);
  const view = gymViewFor({ seatId: seat?.id ?? null, preset: seat?.presetId ?? null, optedIn: false });
  const studentName = report.profile.displayName.trim();
  const resolved = resolveInstructorName({
    savedName: saved.name,
    seatName: seatInstructorName(seat, deviceGymName),
    studentName,
    academyName: deviceGymName,
  });
  const name = resolved.name;
  const studentBeltLabel = studentName || report.profile.belt ? rankFaceLabel(wornBeltPreview(report)) : '';
  const beltLabel = resolveInstructorBelt({ savedBelt: saved.belt, studentBeltLabel });
  if (view.kind === 'hidden') return null;
  const split = eventsForView(events, view);
  const classes = netClasses(split.detail);
  const cloud = readGymMeta().cloudSynced;
  const academy = readGymMeta().cloudTotals;
  const role = seat?.presetId === 'instructors' ? 'Instructors' : seat?.presetId === 'coach' ? 'Coach' : seat ? 'Instructor' : 'Owner';

  const openEdit = () => {
    setDraftName(saved.name || (resolved.placeholder ? '' : name));
    setDraftBelt(saved.belt);
    setEditing(true);
  };

  const onSaveProfile = () => {
    saveInstructorProfile({ name: draftName, belt: draftBelt }, localStorage, instructorProfileSeatKey(seat?.id ?? null));
    setEditing(false);
  };

  return (
    <div className="ip-preview ip-preview--embedded" data-testid="instructor-sheet">
      <section className="ip-sheet" aria-label="Instructor character sheet" data-testid="instructor-identity">
        <header className="ip-sheet__head">
          <p className="ip-kicker">Advantage · Instructor Edition</p>
          <h1 data-testid="instructor-headline">{name}</h1>
          {deviceGymName ? (
            <p className="ip-sheet__academy" data-testid="instructor-academy-line">
              {deviceGymName}
            </p>
          ) : null}
          <p className="ip-quiet">
            {role} · {cloud ? 'Advantage Cloud' : 'This device'}
          </p>
          <button type="button" className="ip-edit" data-testid="instructor-edit" onClick={openEdit}>
            ✎ Edit profile
          </button>
        </header>
        {editing ? (
          <form
            className="ip-edit-form"
            data-testid="instructor-edit-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveProfile();
            }}
          >
            <label>
              Instructor name
              <input
                data-testid="instructor-edit-name"
                value={draftName}
                maxLength={INSTRUCTOR_NAME_MAX}
                autoComplete="name"
                placeholder="Your name"
                onChange={(event) => setDraftName(event.target.value)}
              />
            </label>
            <label>
              Belt
              <select
                data-testid="instructor-edit-belt"
                value={draftBelt}
                onChange={(event) => setDraftBelt((event.target.value || '') as InstructorProfileBeltId | '')}
              >
                <option value="">Same as student profile</option>
                {INSTRUCTOR_PROFILE_BELTS.map((belt) => (
                  <option key={belt.id} value={belt.id}>
                    {belt.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="ip-edit-actions">
              <button type="submit" className="ip-log-btn" data-testid="instructor-edit-save">
                Save
              </button>
              <button type="button" className="ip-edit-cancel" data-testid="instructor-edit-cancel" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="ip-id">
            <p>
              <span>Instructor name</span>
              <strong data-testid="instructor-name">{name}</strong>
            </p>
            {deviceGymName ? (
              <p>
                <span>Academy</span>
                <strong>{deviceGymName}</strong>
              </p>
            ) : null}
            {beltLabel ? (
              <p>
                <span>Belt</span>
                <strong data-testid="instructor-belt">{beltLabel}</strong>
              </p>
            ) : null}
          </div>
        )}
        <div className="ip-hours" data-testid="instructor-teaching-hours">
          <div>
            <span>Classes taught</span>
            <strong>{classes.count}</strong>
            <small>Logged in Advantage</small>
          </div>
          <div>
            <span>Hours taught</span>
            <strong>{hoursLabel(classes.minutes)} h</strong>
            <small>From classes marked taught</small>
          </div>
        </div>
        <div className="ip-record" data-testid="instructor-record">
          <h3>Record</h3>
          <p className="ip-quiet">
            {cloud
              ? 'Academy totals include seats synced through Advantage Cloud.'
              : 'These numbers are this device. Full academy totals come with Advantage Cloud.'}
          </p>
          {cloud && academy && view.kind === 'own' && view.anonymousTotals ? (
            <p className="ip-quiet">
              Academy: {academy.classes} classes, {academy.promotions} promotions, {academy.stripes} stripes. No student
              names.
            </p>
          ) : null}
          {split.detail.some((event) => event.source === 'backfill') ? (
            <p className="ip-quiet">
              Roster and belt numbers already on this device are estimates. Stripes start when you give them.
            </p>
          ) : null}
          <button type="button" className="ip-log-btn" onClick={() => setMarked(markPastPlansTaught())}>
            Mark past plans as taught
          </button>
          {marked !== null ? (
            <p className="ip-quiet" role="status">
              {marked
                ? `Marked ${marked} past ${marked === 1 ? 'plan' : 'plans'} as taught. Those counts are estimates.`
                : 'No unmarked past plans.'}
            </p>
          ) : null}
        </div>
      </section>

      <section className="ip-card" aria-label="Instructor D12" data-testid="instructor-d12-card">
        <h2>Instructor D12</h2>
        <InstructorD12Panel seatId={seat?.id ?? null} />
      </section>

      <section className="ip-card" aria-label="My student profile" data-testid="instructor-student-profile">
        <h2>My student profile</h2>
        <p className="ip-quiet">
          The same profile this browser uses in Student Edition, including your D8, belt, mat hours, and
          other profile cards. Links open those Student Edition pages.
        </p>
        {!studentName ? (
          <p className="ip-quiet" data-testid="instructor-student-empty">
            No student profile is filled in yet. Add your name and ratings in Student Edition to see them
            here. Nothing is filled in with sample data.
          </p>
        ) : null}
        <div className="student instructor-student-profile__sheet">
          <StudentCardLayout
            home
            portrait={media.portrait}
            to={to}
            bodyScan={<BodyScanSection report={report} commit={commit} to={to} />}
          />
        </div>
      </section>

      <CopyAccountReference id={readAccountReference()} />
    </div>
  );
}
