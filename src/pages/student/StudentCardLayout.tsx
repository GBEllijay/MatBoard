/**
 * Student card layout (profile page, top to bottom):
 * card face (name + belt) → small mat hours frame + timer → Shape radar (read-only)
 * → the three most recent medals → mat hours details (streak, split, report card).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RadarChart } from '../../components/RadarChart';
import { loadAssessments } from '../../lib/studentAssessment';
import { matHoursSplit, matHoursTotal } from '../../lib/matHours';
import { wornBeltPreview, type WornBeltPreview } from '../../lib/studentRank';
import { readStreakTarget, streakLabel, streakWeekLine, trainingStreak } from '../../lib/trainingStreak';
import { MEDAL_LABEL, recentMedals, type CardMedal, type MedalKind } from '../../lib/cardMedals';
import type { StudentProgressReport } from '../../lib/progress/types';
import { MatQuickAddSheet } from './MatQuickAdd';
import { useStudentFile } from './chrome';
import { ProfileCardFace } from './ProfileCardFace';
import './studentCardLayout.css';

const ADULT_FRAME: Record<string, string> = {
  white: '#f2f0ea',
  blue: '#2f6fd6',
  purple: '#7b3fb0',
  brown: '#8a5a2b',
  black: '#1a1a1a',
  coral: '#e2584a',
  redWhite: '#d0263a',
  red: '#d0263a',
};

/** Frame color: the student's current belt (kids belts included). */
export function beltFrameColor(preview: WornBeltPreview): string {
  if (preview.kind === 'kids' && preview.base) return preview.base;
  return ADULT_FRAME[preview.belt] ?? ADULT_FRAME.white;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Units = 'hours' | 'days' ;

function frameValue(minutes: number, units: Units): { value: string; unit: string } {
  if (units === 'hours') {
    const h = minutes / 60;
    return { value: Number.isInteger(h) ? String(h) : h.toFixed(1), unit: 'mat hrs' };
  }
  const days = minutes / 1440;
  if (days >= 365) return { value: (days / 365).toFixed(2), unit: 'mat yrs' };
  return { value: days.toFixed(1), unit: 'mat days' };
}

/** Small frame in the belt color. Tap toggles hours ↔ days/years. */
export function MatHoursFrame({ report }: { report: StudentProgressReport }) {
  const [units, setUnits] = useState<Units>('hours');
  const preview = wornBeltPreview(report);
  const color = beltFrameColor(preview);
  const minutes = matHoursTotal(report.journal).minutes;
  const shown = frameValue(minutes, units);
  const next = units === 'hours' ? 'Show days and years' : 'Show hours';
  return (
    <button
      type="button"
      className="mh-frame"
      data-testid="mat-hours-frame"
      data-belt={preview.belt}
      data-units={units}
      style={{ borderColor: color, ['--frame' as string]: color }}
      aria-pressed={units !== 'hours'}
      title={next}
      onClick={() => setUnits((u) => (u === 'hours' ? 'days' : 'hours'))}
    >
      <span className="mh-frame__value">{shown.value}</span>
      <span className="mh-frame__unit">{shown.unit}</span>
    </button>
  );
}

/** Original stopwatch graphic, navy and logo blue with a soft glow. */
export function MatTimerButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="mh-timer" aria-label="Add mat time" data-testid="mat-timer" onClick={onClick}>
      <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
        <defs>
          <radialGradient id="mhTimerFace" cx="40%" cy="35%">
            <stop offset="0" stopColor="#1b3f7a" />
            <stop offset="1" stopColor="#0c2344" />
          </radialGradient>
        </defs>
        <rect x="20" y="3" width="8" height="5" rx="1.5" fill="#004eba" />
        <path d="M35 9l4 4" stroke="#6ea8ff" strokeWidth="3" strokeLinecap="round" />
        <circle cx="24" cy="27" r="17" fill="url(#mhTimerFace)" stroke="#6ea8ff" strokeWidth="2.5" />
        <circle cx="24" cy="27" r="12.5" fill="none" stroke="#6ea8ff" strokeOpacity=".45" strokeDasharray="1.5 3" />
        <path d="M24 27V17" stroke="#e8f1ff" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M24 27l6 4" stroke="#6ea8ff" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="24" cy="27" r="2.2" fill="#e8f1ff" />
        <path d="M37 34h6M40 31v6" stroke="#e8f1ff" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/** Read-only Shape radar from the latest saved self-assessment. */
export function CardRadar({ to }: { to: (path: string) => string }) {
  const entries = typeof localStorage === 'undefined' ? [] : loadAssessments(localStorage).entries;
  const latest = entries[0];
  return (
    <section className="card-radar" aria-label="Shape" data-testid="card-radar">
      {latest ? (
        <RadarChart scores={latest.scores} />
      ) : (
        <div className="card-empty" data-testid="card-radar-empty">
          <h3>Shape</h3>
          <p>No check-in yet. Rate yourself to see your shape here.</p>
        </div>
      )}
      <Link className="card-link" to={to('/student/self-assessment')}>
        {latest ? `Self-assessment · ${latest.date} ›` : 'Open self-assessment ›'}
      </Link>
    </section>
  );
}

export function MedalGraphic({ kind, size = 48 }: { kind: MedalKind; size?: number }) {
  const face = { gold: ['#ffe08a', '#d4a017', '#8a6400'], silver: ['#f2f5fa', '#aeb7c4', '#5d6675'], bronze: ['#f3c19a', '#c27a44', '#6e3d17'] }[kind];
  const rib = { gold: '#6ea8ff', silver: '#ffffff', bronze: '#0c2344' }[kind];
  const n = { gold: '1', silver: '2', bronze: '3' }[kind];
  const id = `medal-${kind}`;
  return (
    <svg className="medal" width={size} height={Math.round(size * 1.25)} viewBox="0 0 64 80" aria-hidden="true">
      <defs>
        <radialGradient id={id} cx="35%" cy="30%">
          <stop offset="0" stopColor={face[0]} />
          <stop offset=".7" stopColor={face[1]} />
          <stop offset="1" stopColor={face[2]} />
        </radialGradient>
      </defs>
      <path d="M14 0h14l8 30h-14z" fill="#004eba" />
      <path d="M36 0h14l-8 30h-14z" fill={rib} />
      <circle cx="32" cy="52" r="24" fill={`url(#${id})`} stroke={face[2]} strokeWidth="2" />
      <circle cx="32" cy="52" r="18" fill="none" stroke={face[2]} strokeOpacity=".55" strokeWidth="1.5" strokeDasharray="2 2.5" />
      <text x="32" y="59" textAnchor="middle" fontWeight="800" fontSize="20" fill={face[2]}>{n}</text>
    </svg>
  );
}

const METHOD: Record<string, string> = { points: 'Points', sub: 'Submission', advantage: 'Advantage', dq: 'DQ' };
const RESULT: Record<string, string> = { win: 'Win', loss: 'Loss', draw: 'Draw' };

export function MatchLogSheet({ medal, onClose }: { medal: CardMedal; onClose: () => void }) {
  const wins = medal.matches.filter((m) => m.result === 'win').length;
  return (
    <div className="match-log" role="dialog" aria-modal="false" aria-label={`${medal.name} match log`} data-testid="match-log">
      <div className="match-log__hd">
        <MedalGraphic kind={medal.kind} size={44} />
        <div>
          <h3>{medal.name}</h3>
          <p>{[medal.division, `${MEDAL_LABEL[medal.kind]}, ${medal.place}`, medal.date].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <p className="match-log__k">{`${medal.matches.length} ${medal.matches.length === 1 ? 'match' : 'matches'} · ${wins} ${wins === 1 ? 'win' : 'wins'}`}</p>
      <ol className="match-log__list">
        {medal.matches.map((m) => (
          <li key={m.id} className="match-log__row" data-testid="match-log-row">
            <div>
              <b>{m.opponent || 'Opponent not recorded'}</b>
              {m.note ? <span className="match-log__sc">{m.note}</span> : null}
              {m.date ? <span className="match-log__sc">{m.date}</span> : null}
            </div>
            <div className={`match-log__res match-log__res--${m.result}`}>
              {RESULT[m.result] ?? m.result}
              {m.method ? <small>{METHOD[m.method] ?? m.method}</small> : null}
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="ink-btn match-log__close" onClick={onClose}>Close</button>
    </div>
  );
}

export function CardMedals({ report, to, rail = false }: { report: StudentProgressReport; to: (path: string) => string; rail?: boolean }) {
  const medals = recentMedals(report.competition);
  const [open, setOpen] = useState<string | null>(null);
  const shown = medals.find((m) => m.resultId === open) ?? null;
  return (
    <section className={rail ? 'card-medals card-medals--rail' : 'card-medals'} aria-label="Medals" data-testid="card-medals">
      <h3 className="card-medals__k">Recent medals</h3>
      {medals.length ? (
        <ul className="card-medals__strip">
          {medals.map((m) => (
            <li key={m.resultId}>
              <button type="button" className="card-medal" data-testid="card-medal" data-kind={m.kind} aria-label={`${MEDAL_LABEL[m.kind]}, ${m.place}, ${m.name}. Open match log`} onClick={() => setOpen(m.resultId)}>
                <MedalGraphic kind={m.kind} />
                <b>{m.name}</b>
                <span>{m.place}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card-empty" data-testid="card-medals-empty">No medals yet. Record a competition in Results and podium finishes show here.</p>
      )}
      <Link className="card-link" to={to('/student/results')}>Results ›</Link>
      {shown ? <MatchLogSheet medal={shown} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

/** Rest of the mat hours stat: total, split, streak, report card. */
export function MatHoursDetails({ report, to }: { report: StudentProgressReport; to: (path: string) => string }) {
  const target = typeof localStorage === 'undefined' ? 2 : readStreakTarget(localStorage);
  const streak = trainingStreak(report.journal, todayIso(), target);
  const total = matHoursTotal(report.journal);
  const split = matHoursSplit(total);
  return (
    <div className="card-stat card-stat--mat-hours card-details" data-testid="profile-mat-hours">
      <span className="card-stat__label">Mat hours · from your journal</span>
      {split ? <p className="card-details__split" data-testid="profile-split">{split}</p> : null}
      <p className="profile-mat-hours__streak" data-testid="profile-streak">
        <strong>{streakLabel(streak)}</strong>
        <span>{streakWeekLine(streak)}</span>
      </p>
      <Link className="ink-btn profile-mat-hours__report" to={to('/student/report')} aria-label="My report card">
        My report card
      </Link>
    </div>
  );
}

/** The whole card column on the profile page. `home` = the /student order with `streak` beside mat hours. */
export function StudentCardLayout({ portrait, logo, to, home = false, streak }: { portrait: string | null; logo: string | null; to: (path: string) => string; home?: boolean; streak?: React.ReactNode }) {
  const { report, commit } = useStudentFile();
  const [adding, setAdding] = useState(false);
  if (home) {
    return (
      <div className="student-card-layout student-card-layout--home" data-testid="student-card-layout">
        <ProfileCardFace report={report} portrait={portrait} logo={logo} to={to} />
        <CardRadar to={to} />
        <CardMedals report={report} to={to} rail />
        <div className="mh-row mh-row--home" data-testid="mat-hours-row">
          <MatHoursFrame report={report} />
          <MatTimerButton onClick={() => setAdding(true)} />
          {streak}
        </div>
        {adding ? <MatQuickAddSheet report={report} commit={commit} onClose={() => setAdding(false)} /> : null}
      </div>
    );
  }
  return (
    <div className="student-card-layout" data-testid="student-card-layout">
      <ProfileCardFace
        report={report}
        portrait={portrait}
        logo={logo}
        to={to}
        beltStat={
          <div className="mh-row" data-testid="mat-hours-row">
            <MatHoursFrame report={report} />
            <MatTimerButton onClick={() => setAdding(true)} />
          </div>
        }
      />
      {adding ? <MatQuickAddSheet report={report} commit={commit} onClose={() => setAdding(false)} /> : null}
      <CardRadar to={to} />
      <CardMedals report={report} to={to} />
      <section className="profile-face__stats" aria-label="Card stats" data-testid="profile-face-stats">
        <MatHoursDetails report={report} to={to} />
      </section>
    </div>
  );
}
