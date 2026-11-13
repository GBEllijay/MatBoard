/**
 * Instructor character sheet. Same zone frame as the student sheet:
 * identity, stat strip, a rank zone, a log zone, and a full-width record.
 * Shown on the instructor homepage when Pro is open. Coach without Pro keeps
 * the simpler count. No locked tiles.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AccountReference } from './AccountReference';
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
import { ADVANTAGE_MARK_SRC } from '../lib/gymLogo.ts';
import { useGymLogo, useGymName } from '../hooks/useGymBrand.ts';
import { getRoster } from '../lib/rosterStore.ts';
import { useCurrentSeat } from './SeatSessionBar';
import type { GymEvent } from '../lib/gymEvents.ts';
import './gymSheet.css';

function useEvents(): GymEvent[] {
  return useSyncExternalStore(subscribeGymEvents, getGymEventsSnapshot, getGymEventsSnapshot);
}

function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      setShown(Math.round(value * (1 - (1 - t) * (1 - t))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span className="sheet-stat__num">{shown}</span>;
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
  const logo = useGymLogo();
  const deviceGymName = useGymName();
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

  return (
    <section className="gym-sheet" aria-label="Instructor character sheet" data-testid="instructor-sheet">
      <div className="sheet-zone sheet-zone--identity" data-zone="identity">
        <h3 className="sheet-cap">Identity</h3>
        <div className="gym-id">
          <img className="gym-id__logo" src={logo || ADVANTAGE_MARK_SRC} alt="" />
          <div>
            <h2>{name}</h2>
            <p>
              {role}
              {deviceGymName && seat ? ` · ${deviceGymName}` : ''} · {cloud ? 'Advantage Cloud' : 'This device'}
            </p>
            <AccountReference id={readAccountReference()} />
          </div>
        </div>
      </div>
      <div className="sheet-zone sheet-zone--stats" data-zone="stats">
        <div className="sheet-stats">
          <p className="sheet-stat">
            <CountUp value={classes.count} />
            <span>Classes taught</span>
          </p>
          <p className="sheet-stat">
            <span className="sheet-stat__num">
              {hoursLabel(classes.minutes)}
              <small>h</small>
            </span>
            <span>Hours taught</span>
          </p>
        </div>
      </div>
      <div className="sheet-zone sheet-zone--radar" data-zone="belts">
        <h3 className="sheet-cap">Belts promoted</h3>
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
          <p className="gym-sheet__empty">No belt promotions yet.</p>
        )}
      </div>
      <div className="sheet-zone sheet-zone--wins" data-zone="log">
        <h3 className="sheet-cap">Promotion log</h3>
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
          <p className="gym-sheet__empty">No promotions yet.</p>
        )}
      </div>
      <div className="sheet-zone sheet-zone--record" data-zone="record">
        <h3 className="sheet-cap">Record</h3>
        <p className="gym-sheet__note">
          {cloud
            ? 'Academy totals include seats synced through Advantage Cloud.'
            : 'These numbers are this device. Full academy totals come with Advantage Cloud.'}
        </p>
        {cloud && academy && view.kind === 'own' && view.anonymousTotals ? (
          <p className="gym-sheet__note">Academy: {academy.classes} classes, {academy.promotions} promotions, {academy.stripes} stripes. No student names.</p>
        ) : null}
        {split.detail.some((event) => event.source === 'backfill') ? (
          <p className="gym-sheet__note">Roster and belt numbers already on this device are estimates. Stripes start when you give them.</p>
        ) : null}
        <button type="button" className="btn btn--ghost" onClick={() => setMarked(markPastPlansTaught())}>
          Mark past plans as taught
        </button>
        {marked !== null ? (
          <p className="gym-sheet__note" role="status">
            {marked ? `Marked ${marked} past ${marked === 1 ? 'plan' : 'plans'} as taught. Those counts are estimates.` : 'No unmarked past plans.'}
          </p>
        ) : null}
      </div>
    </section>
  );
}
