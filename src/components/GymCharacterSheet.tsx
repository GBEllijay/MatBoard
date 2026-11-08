/**
 * Gym character sheet. Same zone frame as the student sheet, scaled to the academy:
 * identity, stat strip, belts over time, instructors, and tenure.
 * Sits above the Pro belt console. Hidden for seats the roster does not include,
 * unless the owner opts them in. No locked tiles.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCurrentSeat } from './SeatSessionBar';
import {
  academyInstructorsHref,
  academyLessonHref,
  academyProfileHome,
  academyRosterHref,
} from '../lib/academySheetNav.ts';
import { ensureGymBackfill } from '../lib/gymBackfill.ts';
import { installGymActor } from '../lib/gymActor.ts';
import { syncGymEvents } from '../lib/gymEventSync.ts';
import {
  academySheetOpen,
  activeStudentCount,
  eventsForView,
  formatDays,
  gymViewFor,
  instructorTallies,
  netClasses,
  promotionEvents,
  promotionsByYear,
  stripesGiven,
  tenureStats,
  type InstructorTally,
} from '../lib/gymEvents.ts';
import { getGymEventsSnapshot, readGymMeta, subscribeGymEvents } from '../lib/gymEventLog.ts';
import { ADVANTAGE_MARK_SRC, readGymLogo, saveGymLogoFile, subscribeGymLogo } from '../lib/gymLogo.ts';
import { GYM_NAME_MAX, readGymName, subscribeGymName, writeGymName } from '../lib/gymName.ts';
import {
  getGymProfileSnapshot,
  gymLineageText,
  gymLineageVisible,
  profileOptIn,
  subscribeGymProfile,
  writeGymProfile,
  type GymProfile,
} from '../lib/gymProfile.ts';
import type { GymEvent } from '../lib/gymEvents.ts';
import './gymSheet.css';

function useEvents(): GymEvent[] {
  return useSyncExternalStore(subscribeGymEvents, getGymEventsSnapshot, getGymEventsSnapshot);
}

function useProfile(): GymProfile {
  return useSyncExternalStore(subscribeGymProfile, getGymProfileSnapshot, getGymProfileSnapshot);
}

function useLogo(): string | null {
  return useSyncExternalStore(subscribeGymLogo, readGymLogo, readGymLogo);
}

function useDeviceGymName(): string {
  return useSyncExternalStore(subscribeGymName, readGymName, readGymName);
}

export function GymCharacterSheet() {
  installGymActor();
  const events = useEvents();
  const profile = useProfile();
  const logo = useLogo();
  const deviceGymName = useDeviceGymName();
  const seat = useCurrentSeat();
  const home = academyProfileHome(useLocation().pathname);
  const [editing, setEditing] = useState(false);
  const [logoNote, setLogoNote] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ensureGymBackfill();
    void syncGymEvents();
  }, []);
  useEffect(() => {
    if (editing) nameRef.current?.focus();
  }, [editing]);

  const optedIn = profileOptIn(profile, seat?.presetId ?? null);
  const access = { seatId: seat?.id ?? null, preset: seat?.presetId ?? null, optedIn };
  if (!academySheetOpen(access)) return null;
  const view = gymViewFor(access);
  const cloud = readGymMeta().cloudSynced;
  const remote = readGymMeta().cloudTotals;
  const split = eventsForView(events, view);
  const useRemote = cloud && view.kind === 'own' && remote;
  const classes = useRemote ? { count: remote.classes, minutes: remote.minutes } : netClasses(view.kind === 'owner' && cloud ? events : split.totals);
  const promotions = useRemote ? remote.promotions : promotionEvents(view.kind === 'owner' && cloud ? events : split.totals).length;
  const stripes = useRemote ? remote.stripes : stripesGiven(view.kind === 'owner' && cloud ? events : split.totals);
  const active = useRemote ? remote.activeStudents : activeStudentCount(view.kind === 'owner' && cloud ? events : split.totals);
  const tenure = useRemote && remote.tenure ? remote.tenure : tenureStats(view.kind === 'owner' && cloud ? events : split.totals);
  const years = useRemote ? [] : promotionsByYear(view.kind === 'owner' && cloud ? events : split.totals);
  const belts = useRemote ? remote.belts : years.flatMap((row) => row.belts);
  const instructors: InstructorTally[] = useRemote
    ? remote.instructors
    : view.kind === 'own'
      ? instructorTallies(split.totals).map((row) => (row.seatId === view.seatId ? row : { ...row, name: 'Other instructors', seatId: 'other' }))
      : instructorTallies(events);
  const collapsed = collapseOthers(instructors, view.kind === 'own' ? view.seatId : null);
  const gymName = deviceGymName || 'Your academy';
  const owner = !seat;

  const onLogoFile = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    void saveGymLogoFile(file).then(
      () => setLogoNote('Logo saved on this device.'),
      () => setLogoNote('That picture could not be saved.'),
    );
  };

  return (
    <section className="gym-sheet" aria-label="Gym character sheet" data-testid="gym-sheet">
      <div className="sheet-zone sheet-zone--identity" data-zone="identity">
        <h3 className="sheet-cap">Identity</h3>
        <div className="gym-id">
          {owner && editing ? (
            <label className="gym-id__logo-hit" data-gym-logo={logo ? 'set' : 'empty'}>
              {logo ? (
                <img className="gym-id__logo" src={logo} alt="Gym logo" />
              ) : (
                <span className="gym-id__upload">
                  <span className="gym-id__upload-title">Upload a gym logo</span>
                  <span className="gym-id__upload-hint">Tap to upload</span>
                </span>
              )}
              <input
                className="gym-id__file"
                type="file"
                accept="image/*"
                aria-label={logo ? 'Replace gym logo' : 'Upload a gym logo'}
                onChange={onLogoFile}
              />
            </label>
          ) : (
            <img className="gym-id__logo" src={logo || ADVANTAGE_MARK_SRC} alt={logo ? 'Gym logo' : 'Advantage'} />
          )}
          <div>
            <h2>{gymName}</h2>
            <p>{cloud ? 'Advantage Cloud' : 'This device'}</p>
            {profile.foundedOn ? <p>Founded {profile.foundedOn}</p> : null}
            {profile.founders.trim() ? <p>Founders {profile.founders}</p> : null}
            {gymLineageText(profile) ? <p className="gym-lineage-read">{gymLineageText(profile)}</p> : null}
            {owner ? (
              <button
                type="button"
                className="gym-edit"
                aria-expanded={editing}
                data-testid="academy-edit"
                onClick={() => setEditing((open) => !open)}
              >
                {editing ? 'Done' : '✎ Edit academy profile'}
              </button>
            ) : null}
          </div>
        </div>
        {owner && editing ? (
          <form className="gym-fields" onSubmit={(event) => event.preventDefault()}>
            <label>
              Academy name
              <input
                ref={nameRef}
                aria-label="Academy name"
                value={deviceGymName}
                maxLength={GYM_NAME_MAX}
                autoComplete="organization"
                onChange={(event) => writeGymName(event.target.value)}
              />
            </label>
            <p className="gym-sheet__note">
              Saved on this device. Media, the gallery, the timer, and the class board use this name and the logo above. A board title, when one is set, shows on that board instead. A student&apos;s own academy name is separate.
            </p>
            <label>
              Founded
              <input type="date" value={profile.foundedOn} onChange={(event) => writeGymProfile({ foundedOn: event.target.value })} />
            </label>
            <label>
              Founders
              <input value={profile.founders} maxLength={120} onChange={(event) => writeGymProfile({ founders: event.target.value })} />
            </label>
            <div className="gym-lineage">
              <button
                type="button"
                role="switch"
                className="gym-lineage-switch"
                aria-checked={gymLineageVisible(profile)}
                aria-describedby="gym-lineage-help"
                onClick={() => writeGymProfile({ lineageVisible: !gymLineageVisible(profile) })}
              >
                <span>Show lineage</span>
                <span aria-hidden="true">{gymLineageVisible(profile) ? 'On' : 'Off'}</span>
              </button>
              <p id="gym-lineage-help" className="gym-sheet__note">
                Teaching ancestry of this academy: who it was founded under, and who that teacher was under. Not instructors who have taught or visited.
              </p>
              {gymLineageVisible(profile) ? (
                <label>
                  Lineage
                  <textarea
                    aria-label="Lineage"
                    value={profile.lineage}
                    maxLength={240}
                    onChange={(event) => writeGymProfile({ lineage: event.target.value })}
                  />
                </label>
              ) : null}
            </div>
            <fieldset>
              <legend className="sheet-cap">Share academy totals</legend>
              {(
                [
                  ['assistant-coach', 'Assistant coaches'],
                  ['program-director', 'Program directors'],
                  ['custom', 'Custom seats'],
                ] as const
              ).map(([id, label]) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={profile.optIn.includes(id)}
                    onChange={(event) => {
                      const optIn = event.target.checked ? [...profile.optIn, id] : profile.optIn.filter((item) => item !== id);
                      writeGymProfile({ optIn });
                    }}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            {logoNote ? <p className="gym-sheet__note" role="status">{logoNote}</p> : null}
          </form>
        ) : null}
      </div>
      <div className="sheet-zone sheet-zone--stats" data-zone="stats">
        <div className="sheet-stats">
          <CountTile owner={owner} href={academyRosterHref(home)} label="Promotions" count={promotions} detail="Open the roster. Promotions are entered on a student card." />
          <CountTile owner={owner} href={academyRosterHref(home)} label="Stripes given" count={stripes} detail="Open the roster. Stripes are entered on a student card." />
          <CountTile owner={owner} href={academyLessonHref(home)} label="Classes taught" count={classes.count} detail="Open the lesson plan. I taught this is what this count records." />
          <CountTile owner={owner} href={academyRosterHref(home)} label="Active students" count={active} detail="Open the roster. Students are added there." />
        </div>
      </div>
      <div className="sheet-zone sheet-zone--radar" data-zone="belts">
        <h3 className="sheet-cap">Belts promoted over time</h3>
        {years.length ? (
          years.map((year) => (
            <div key={year.year}>
              <p className="gym-sheet__note">{year.year}</p>
              <ul className="gym-bars">
                {year.belts.map((row) => (
                  <li key={`${year.year}-${row.belt}`}>
                    <span>{row.belt}</span>
                    <i />
                    <b>
                      {row.count}
                      {row.estimate ? ` · ${row.estimate} est.` : ''}
                    </b>
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : belts.length ? (
          <ul className="gym-bars">
            {belts.map((row) => (
              <li key={row.belt}>
                <span>{row.belt}</span>
                <i />
                <b>{row.count}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gym-sheet__empty">No belt promotions yet.</p>
        )}
      </div>
      <div className="sheet-zone sheet-zone--wins" data-zone="instructors">
        {owner ? (
          <Link
            className="gym-zone-link"
            to={academyInstructorsHref(home)}
            aria-label="Open instructor invitation and access. These lines are classes and promotions, not seat assignments."
          >
            <InstructorLines rows={collapsed} />
          </Link>
        ) : (
          <InstructorLines rows={collapsed} />
        )}
      </div>
      <div className="sheet-zone sheet-zone--record" data-zone="tenure">
        <h3 className="sheet-cap">Tenure</h3>
        <p className="gym-sheet__note">
          {tenure.counted
            ? `Average ${formatDays(tenure.averageDays)} · median ${formatDays(tenure.medianDays)} · longest active ${formatDays(tenure.longestDays)}`
            : 'Tenure starts when students are on the roster.'}
        </p>
        <p className="gym-sheet__note">
          {cloud
            ? 'Gym totals come from Advantage Cloud.'
            : 'These numbers are this device. Full gym totals come with Advantage Cloud.'}
        </p>
      </div>
    </section>
  );
}

function CountTile({
  owner,
  href,
  label,
  count,
  detail,
}: {
  owner: boolean;
  href: string;
  label: string;
  count: number;
  detail: string;
}) {
  const body = (
    <>
      <span className="sheet-stat__num">{count}</span>
      <span>{label}</span>
    </>
  );
  if (!owner) return <p className="sheet-stat">{body}</p>;
  return (
    <Link className="sheet-stat sheet-stat--link" to={href} aria-label={`${label}. ${detail}`}>
      {body}
    </Link>
  );
}

function InstructorLines({ rows }: { rows: readonly InstructorTally[] }) {
  return (
    <>
      <h3 className="sheet-cap">Instructors</h3>
      {rows.length ? (
        <ul className="gym-log">
          {rows.map((row) => (
            <li key={row.seatId}>
              <b>{row.name}</b>
              <span>
                {row.classes} {row.classes === 1 ? 'class' : 'classes'} · {row.stripes} stripes · {row.promotions} promotions
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="gym-sheet__empty">No classes or promotions recorded yet.</p>
      )}
    </>
  );
}

function collapseOthers(rows: readonly InstructorTally[], seatId: string | null): InstructorTally[] {
  if (!seatId) {
    const named = new Map<string, InstructorTally>();
    for (const row of rows) {
      const key = row.seatId;
      const current = named.get(key) ?? { ...row, classes: 0, minutes: 0, promotions: 0, stripes: 0 };
      current.classes += row.classes;
      current.minutes += row.minutes;
      current.promotions += row.promotions;
      current.stripes += row.stripes;
      current.name = row.name;
      named.set(key, current);
    }
    return [...named.values()];
  }
  const mine = rows.filter((row) => row.seatId === seatId);
  const rest = rows.filter((row) => row.seatId !== seatId);
  const other = rest.reduce<InstructorTally>(
    (sum, row) => ({
      seatId: 'other',
      name: 'Other instructors',
      classes: sum.classes + row.classes,
      minutes: sum.minutes + row.minutes,
      promotions: sum.promotions + row.promotions,
      stripes: sum.stripes + row.stripes,
    }),
    { seatId: 'other', name: 'Other instructors', classes: 0, minutes: 0, promotions: 0, stripes: 0 },
  );
  return other.classes || other.promotions || other.stripes ? [...mine, other] : mine;
}
