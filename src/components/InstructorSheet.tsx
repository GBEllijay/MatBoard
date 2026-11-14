/**
 * Instructor character sheet on Instructor Edition (and the unseated Pro
 * owner sheet). Same navy / logo-blue / cream paint as
 * /preview/instructor-sheet. Identity and teaching totals come from the
 * live seat and gym log. The student profile block reuses Student Edition
 * cards and stores (D8, belt, mat hours, medals, body scan). The Instructor
 * D12 sits in the Shape zone, immediately after the student D8.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AccountReference } from './AccountReference';
import { InstructorD12Panel } from './InstructorD12Panel';
import { readAccountReference } from '../lib/accountReference.ts';
import { ensureGymBackfill, markPastPlansTaught } from '../lib/gymBackfill.ts';
import { installGymActor } from '../lib/gymActor.ts';
import { syncGymEvents } from '../lib/gymEventSync.ts';
import {
  beltsPromoted,
  eventsForView,
  gymViewFor,
  netClasses,
  promotionEvents,
  studentLabel,
} from '../lib/gymEvents.ts';
import { getGymEventsSnapshot, readGymEvents, readGymMeta, subscribeGymEvents } from '../lib/gymEventLog.ts';
import { useGymName } from '../hooks/useGymBrand.ts';
import { getRoster } from '../lib/rosterStore.ts';
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
  useEffect(() => {
    ensureGymBackfill();
    void syncGymEvents();
  }, []);
  const view = gymViewFor({ seatId: seat?.id ?? null, preset: seat?.presetId ?? null, optedIn: false });
  if (view.kind === 'hidden') return null;
  const split = eventsForView(events, view);
  const classes = netClasses(split.detail);
  const promotions = promotionEvents(split.detail);
  const belts = beltsPromoted(split.detail);
  const maxBelt = belts.reduce((peak, row) => Math.max(peak, row.count), 0);
  const cloud = readGymMeta().cloudSynced;
  const academy = readGymMeta().cloudTotals;
  const students = getRoster().students;
  const name = seat ? seat.email.split('@')[0] || 'Instructor' : deviceGymName || 'Owner';
  const role = seat?.presetId === 'instructors' ? 'Instructors' : seat?.presetId === 'coach' ? 'Coach' : seat ? 'Instructor' : 'Owner';
  const log = [...promotions, ...split.detail.filter((event) => event.type === 'stripe.awarded')].sort((a, b) => (a.at < b.at ? 1 : -1));
  const studentName = report.profile.displayName.trim();
  const beltLabel = studentName || report.profile.belt ? rankFaceLabel(wornBeltPreview(report)) : '';

  return (
    <div className="ip-preview ip-preview--embedded" data-testid="instructor-sheet">
      <section className="ip-sheet" aria-label="Instructor character sheet" data-testid="instructor-identity">
        <header className="ip-sheet__head">
          <p className="ip-kicker">Advantage · Instructor Edition</p>
          <h1>{name}</h1>
          <p className="ip-quiet">
            {role}
            {deviceGymName && seat ? ` · ${deviceGymName}` : ''} · {cloud ? 'Advantage Cloud' : 'This device'}
          </p>
          <AccountReference id={readAccountReference()} />
        </header>
        <div className="ip-id">
          <p>
            <span>Instructor name</span>
            <strong>{name}</strong>
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
              <strong>{beltLabel}</strong>
            </p>
          ) : null}
        </div>
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
            shapeExtra={<InstructorD12Panel seatId={seat?.id ?? null} />}
            bodyScan={<BodyScanSection report={report} commit={commit} to={to} />}
          />
        </div>
      </section>

      <section className="ip-card" aria-label="Promotion log" data-testid="instructor-log">
        <h2>Belts promoted</h2>
        {belts.length ? (
          <ul className="gym-bars">
            {belts.map((row) => (
              <li key={row.belt}>
                <span>{row.belt}</span>
                <i style={{ width: `${maxBelt ? Math.max(8, (row.count / maxBelt) * 100) : 0}%` }} />
                <b>{row.count}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ip-quiet">No belt promotions yet.</p>
        )}
        <h3>Promotion log</h3>
        {log.length ? (
          <ul className="gym-log">
            {log.slice(0, 8).map((event) => (
              <li key={event.id}>
                <b>
                  {event.source === 'backfill' ? 'Estimate · ' : ''}
                  {studentLabel(event.studentId, students, readGymEvents())}
                </b>
                <span>
                  {event.type === 'promotion'
                    ? event.from.belt
                      ? `${event.from.belt} → ${event.to.belt}`
                      : event.to.belt
                    : `Stripe ${event.stripeFrom} → ${event.stripeTo}`}
                  {` · ${event.date}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ip-quiet">No promotions yet.</p>
        )}
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
      </section>
    </div>
  );
}
