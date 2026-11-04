/**
 * Coach-area count of classes taught, plus the promotion log.
 * The instructor character sheet replaces this when Pro is open.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useCurrentSeat } from './SeatSessionBar';
import { ensureGymBackfill, markPastPlansTaught } from '../lib/gymBackfill.ts';
import { installGymActor } from '../lib/gymActor.ts';
import {
  eventsForView,
  formatDays,
  gymViewFor,
  netClasses,
  promotionEvents,
  stripesGiven,
  studentLabel,
  tenureStats,
} from '../lib/gymEvents.ts';
import { getGymEventsSnapshot, readGymEvents, subscribeGymEvents } from '../lib/gymEventLog.ts';
import { getRoster, subscribeRoster } from '../lib/rosterStore.ts';
import type { GymEvent } from '../lib/gymEvents.ts';
import './gymSheet.css';

function useEvents(): GymEvent[] {
  return useSyncExternalStore(subscribeGymEvents, getGymEventsSnapshot, getGymEventsSnapshot);
}

function useRosterTick(): number {
  return useSyncExternalStore(subscribeRoster, () => getRoster().students.length, () => 0);
}

export function GymCoachPulse() {
  installGymActor();
  const events = useEvents();
  useRosterTick();
  const seat = useCurrentSeat();
  const [marked, setMarked] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    ensureGymBackfill();
  }, []);
  const view = gymViewFor({
    seatId: seat?.id ?? null,
    preset: seat?.presetId ?? null,
    optedIn: false,
  });
  if (view.kind === 'hidden') return null;
  const split = eventsForView(events, view);
  const classes = netClasses(split.detail);
  const academy = netClasses(split.totals);
  const log = [...promotionEvents(split.detail), ...split.detail.filter((event) => event.type === 'stripe.awarded')].sort((a, b) =>
    a.at < b.at ? 1 : -1,
  );
  const estimates = split.detail.some((event) => event.source === 'backfill');
  const students = getRoster().students;
  const tenure = tenureStats(split.detail);

  return (
    <section className="gym-pulse" aria-label="Academy tracking" data-testid="gym-pulse">
      <p className="gym-pulse__kicker">This device</p>
      <p className="gym-pulse__count">
        <strong data-testid="classes-taught">{classes.count}</strong>
        <span>{classes.count === 1 ? 'class taught' : 'classes taught'}</span>
      </p>
      {view.kind === 'own' && view.anonymousTotals && academy.count !== classes.count ? (
        <p className="gym-pulse__note">Academy total: {academy.count} classes. No student names.</p>
      ) : null}
      <p className="gym-pulse__note">
        {stripesGiven(split.detail)} stripes given · {promotionEvents(split.detail).length} promotions
        {tenure.counted ? ` · longest active member ${formatDays(tenure.longestDays)}` : ''}
      </p>
      {estimates ? (
        <p className="gym-pulse__note">Roster and belt numbers already on this device are estimates. Stripes start counting when you give them.</p>
      ) : null}
      <div className="gym-pulse__actions">
        <button type="button" className="btn btn--ghost" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          {open ? 'Hide promotion log' : 'Promotion log'}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setMarked(markPastPlansTaught())}
        >
          Mark past plans as taught
        </button>
      </div>
      {marked !== null ? (
        <p className="gym-pulse__note" role="status">
          {marked ? `Marked ${marked} past ${marked === 1 ? 'plan' : 'plans'} as taught. Those counts are estimates.` : 'No unmarked past plans.'}
        </p>
      ) : null}
      {open ? (
        log.length ? (
          <ul className="gym-pulse__log" aria-label="Promotion log">
            {log.slice(0, 12).map((event) => (
              <li key={event.id}>
                {event.source === 'backfill' ? 'Estimate · ' : ''}
                {studentLabel(event.studentId, students, readGymEvents())}
                {event.type === 'promotion'
                  ? event.from.belt
                    ? ` · ${event.from.belt} → ${event.to.belt}`
                    : ` · ${event.to.belt}`
                  : ` · stripe ${event.stripeFrom} → ${event.stripeTo} on ${event.belt}`}
                {` · ${event.date}`}
              </li>
            ))}
          </ul>
        ) : (
          <p className="gym-pulse__note">No promotions yet.</p>
        )
      ) : null}
    </section>
  );
}
