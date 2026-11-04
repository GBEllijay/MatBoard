/**
 * Coach Clipboard student card (design D). One layout for the coach's Student
 * Roster card and the student's own card preview. Coach-only rows (notes,
 * private notes, Competitor Roster toggle, sends) render only in coach mode.
 *
 * This file draws. It does not save. Callers pass values and handlers.
 */
import { useId, useState, type ReactNode } from 'react';
import { ASSESSMENT_AREAS, type AssessmentEntry, type AssessmentScore } from '../../lib/studentAssessment';
import type { AssessmentSummary, BenchmarkItem, DateFacts } from '../../lib/rosterCard';
import { cardDate, NO_DATE } from '../../lib/rosterCard';
import type { TrainingStyle } from '../../lib/progress/types';
import type { WornBeltPreview } from '../../lib/studentRank';
import { ADVANTAGE_MARK_SRC } from '../../lib/gymLogo';
import { WornBeltMark } from '../../pages/student/wornBelt';
import { DEFAULT_CARD_LOOK, type CardLook } from '../../lib/cardLook';
import '../../pages/student/beltWeave.css';
import './coachClipboard.css';

export type AssessmentView = 'coach' | 'self' | 'both';

export type CardPhotoView = {
  /** Shown image, approved by the head coach. Empty draws initials. */
  src: string;
  initials: string;
  /** Any image waiting on the head coach or a parent. */
  pending: boolean;
  /** Head coach or head instructor: Choose photo. */
  onChoose?: () => void;
  /**
   * Per-student 'No photos'. When set the card draws initials only, hides
   * Choose photo and shows the badge, on every style and skin.
   */
  noPhotos?: NoPhotosView;
};

export type NoPhotosView = {
  on: boolean;
  /** Who set it. A family flag is locked for the coach. */
  setBy?: 'coach' | 'family';
  /** Coach switch. Missing or locked means read-only. */
  onToggle?: () => void;
  locked?: boolean;
};

export type ClipboardCardProps = {
  mode: 'coach' | 'student';
  /** Gym-level style and skin. Defaults to Coach Clipboard, Dark. */
  look?: CardLook;
  kicker: string;
  name: string;
  photo: CardPhotoView;
  gymName: string;
  /** Gym logo data URL, or null for the Advantage mark. */
  gymLogo: string | null;
  belt: WornBeltPreview;
  onEditBelt?: () => void;
  beltLine: string;
  dates: DateFacts;
  startedOn: string;
  onStartedOn?: (value: string) => void;
  trainingStyle: TrainingStyle | '';
  onTrainingStyle?: (value: TrainingStyle) => void;
  assessment: AssessmentSummary;
  assessmentView: AssessmentView;
  onAssessmentView: (view: AssessmentView) => void;
  coachAssessments: readonly AssessmentEntry[];
  onNewAssessment?: () => void;
  /** Shown after a coach assessment is saved and not yet sent. */
  assessmentSend?: ReactNode;
  benchmarks: { items: BenchmarkItem[]; done: number; total: number; beltLabel: string; source: string };
  onBenchmark?: (id: string) => void;
  benchmarkSync: boolean;
  onBenchmarkSync?: (on: boolean) => void;
  benchmarkEmpty?: ReactNode;
  /** Coach: explicit Send benchmarks, shown while sync is on. */
  benchmarkSend?: ReactNode;
  /** Notes tab body. Coach: Training notes & suggestions, Private coach notes. Student: Suggestions from coach. */
  notes: ReactNode;
  notesLabel: string;
  /** Coach: first controls directly under the header (Add to Competitor Roster). */
  topControls?: ReactNode;
  /** Coach panel under the sheet: status, Registered notices, Link to student. */
  extras?: ReactNode;
  footer: string;
};

const STYLE_CHOICES: { id: TrainingStyle; label: string }[] = [
  { id: 'gi', label: 'Gi' },
  { id: 'nogi', label: 'No-Gi' },
  { id: 'both', label: 'Both' },
];

type Tab = 'overview' | 'assessments' | 'benchmarks' | 'notes';

export function CoachClipboardCard(props: ClipboardCardProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const tabsId = useId();
  const coach = props.mode === 'coach';
  const noPhotos = Boolean(props.photo.noPhotos?.on);
  const tabs: { id: Tab; label: string; count?: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'assessments', label: 'Assessments', count: String(props.coachAssessments.length) },
    { id: 'benchmarks', label: 'Benchmarks', count: props.benchmarks.total ? `${props.benchmarks.done}/${props.benchmarks.total}` : undefined },
    { id: 'notes', label: props.notesLabel },
  ];
  return (
    <div className="clipboard" data-mode={props.mode} data-style={(props.look ?? DEFAULT_CARD_LOOK).style} data-skin={(props.look ?? DEFAULT_CARD_LOOK).skin}>
      <div className="clipboard__board">
        <div className="clipboard__clip" aria-hidden="true" />
        <article className="clipboard__sheet" aria-label={`${props.name || 'Student'} card`}>
          <header className="clipboard__hdr">
            <div className="clipboard__idc">
              {props.photo.src && !noPhotos ? (
                <img className="clipboard__photo" src={props.photo.src} alt={`${props.name} photo`} />
              ) : (
                <span className="clipboard__initials" aria-label="No photo yet">
                  {props.photo.initials}
                </span>
              )}
              {props.photo.pending && !noPhotos ? <span className="clipboard__pending">Pending approval</span> : null}
              {noPhotos ? (
                <span className="clipboard__nophotos" data-testid="no-photos-badge">
                  No photos
                  {props.photo.noPhotos?.setBy === 'family' ? <small>· Set by family</small> : null}
                </span>
              ) : null}
              {props.photo.onChoose && !noPhotos ? (
                <button type="button" className="clipboard__choose" onClick={props.photo.onChoose}>
                  Choose photo ›<span>head instructor picks</span>
                </button>
              ) : null}
              {props.photo.noPhotos?.onToggle || (coach && props.photo.noPhotos) ? (
                <button
                  type="button"
                  className="clipboard__nophotos-toggle"
                  role="switch"
                  aria-checked={noPhotos}
                  disabled={!props.photo.noPhotos?.onToggle || props.photo.noPhotos?.locked}
                  title={props.photo.noPhotos?.locked ? 'Set by family. Only the family can clear it.' : undefined}
                  onClick={props.photo.noPhotos?.onToggle}
                >
                  {noPhotos ? (props.photo.noPhotos?.locked ? 'No photos · Set by family' : 'Allow photos') : 'Mark No photos'}
                </button>
              ) : null}
            </div>
            <div className="clipboard__who">
              <div className="clipboard__k">{props.kicker}</div>
              <h2 className="clipboard__n">
                {props.onEditBelt ? (
                  <button type="button" className="clipboard__tap clipboard__tap--name" aria-describedby={`${tabsId}-tap`} onClick={props.onEditBelt}>
                    {props.name || 'Add your name'}
                  </button>
                ) : (
                  props.name || 'Add your name'
                )}
              </h2>
              {props.onEditBelt ? (
                <span id={`${tabsId}-tap`} className="clipboard__sr">
                  Tap the name or belt to change details
                </span>
              ) : null}
            </div>
            <div className="clipboard__crest">
              <img src={props.gymLogo || ADVANTAGE_MARK_SRC} alt={props.gymLogo ? `${props.gymName || 'Gym'} logo` : 'Advantage'} />
              <small>{props.gymName || 'Gym not set'}</small>
            </div>
            <div className="clipboard__brow">
              {props.onEditBelt ? (
                <button type="button" className="clipboard__belt clipboard__tap" aria-label="Change belt and stripes" onClick={props.onEditBelt}>
                  <WornBeltMark preview={props.belt} />
                </button>
              ) : (
                <span className="clipboard__belt">
                  <WornBeltMark preview={props.belt} />
                </span>
              )}
              {props.onEditBelt ? (
                <button type="button" className="clipboard__pencil" aria-label="Edit belt and stripes" onClick={props.onEditBelt}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              ) : null}
            </div>
          </header>

          {props.topControls ? <div className="clipboard__top" data-testid="clipboard-top">{props.topControls}</div> : null}

          <div className="clipboard__tabs" role="tablist" aria-label="Card sections" id={tabsId}>
            {tabs.map((row) => (
              <button
                key={row.id}
                type="button"
                role="tab"
                aria-selected={tab === row.id}
                className={tab === row.id ? 'on' : ''}
                onClick={() => setTab(row.id)}
              >
                {row.label}
                {row.count ? <span className="cnt">{row.count}</span> : null}
              </button>
            ))}
          </div>

          <dl className="clipboard__facts">
            <div className="f">
              <dt>Belt</dt>
              <dd>{props.beltLine}</dd>
            </div>
            <div className="f">
              <dt>Belt achieved</dt>
              <dd>{props.dates.beltAchieved}</dd>
            </div>
            <div className="f">
              <dt>Last stripe awarded</dt>
              <dd>{props.dates.lastStripe}</dd>
              {props.dates.lastStripeNote ? <span className="nost">{props.dates.lastStripeNote}</span> : null}
            </div>
            <div className="f">
              <dt>
                Training start <span className="opt">(optional)</span>
              </dt>
              {props.onStartedOn ? (
                <dd>
                  <input
                    type="date"
                    aria-label="Training start date"
                    value={props.startedOn}
                    onChange={(event) => props.onStartedOn?.(event.target.value)}
                  />
                </dd>
              ) : (
                <dd>{cardDate(props.startedOn) || 'Not set'}</dd>
              )}
            </div>
            <div className="f wide">
              <dt>Trains</dt>
              <dd>
                <span className="seg" role="radiogroup" aria-label="Trains">
                  {STYLE_CHOICES.map((choice) => (
                    <button
                      key={choice.id}
                      type="button"
                      role="radio"
                      aria-checked={props.trainingStyle === choice.id}
                      className={props.trainingStyle === choice.id ? 'on' : ''}
                      disabled={!props.onTrainingStyle}
                      onClick={() => props.onTrainingStyle?.(choice.id)}
                    >
                      {choice.label}
                    </button>
                  ))}
                </span>
                {props.trainingStyle ? null : <span className="nost">Not set</span>}
              </dd>
            </div>
          </dl>

          {tab === 'overview' ? (
            <div className="clipboard__grid">
              <AssessmentColumn {...props} />
              <BenchmarkColumn {...props} />
            </div>
          ) : null}
          {tab === 'assessments' ? (
            <div className="clipboard__grid clipboard__grid--one">
              <AssessmentColumn {...props} />
              <AssessmentHistory entries={props.coachAssessments} />
            </div>
          ) : null}
          {tab === 'benchmarks' ? (
            <div className="clipboard__grid clipboard__grid--one">
              <BenchmarkColumn {...props} />
            </div>
          ) : null}
          {tab === 'notes' ? <div className="clipboard__notes">{props.notes}</div> : null}
        </article>
        {props.extras ? <div className="clipboard__extras">{props.extras}</div> : null}
        <div className="clipboard__foot">
          <span className="clipboard__amark">
            <img src={ADVANTAGE_MARK_SRC} alt="" />
            Advantage
          </span>
          <span>{props.footer}</span>
        </div>
      </div>
    </div>
  );
}

function AssessmentColumn(props: ClipboardCardProps) {
  const [trend, setTrend] = useState(false);
  const { assessment, assessmentView: view } = props;
  const showCoach = view !== 'self';
  const showSelf = view !== 'coach';
  const any = (showCoach && assessment.coachLatest) || (showSelf && assessment.selfLatest);
  return (
    <section className="clipboard__col" aria-label="Assessment">
      <h3>
        <span>Assessment</span>
        <span className="seg" role="radiogroup" aria-label="Assessment view">
          {(
            [
              ['coach', 'Coach'],
              ['self', 'Student self'],
              ['both', 'Both'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={view === id} className={view === id ? 'on' : ''} onClick={() => props.onAssessmentView(id)}>
              {label}
            </button>
          ))}
        </span>
      </h3>
      {any ? (
        <>
          <div className="clipboard__as">
            <div>
              {(props.look ?? DEFAULT_CARD_LOOK).style === 'fighter' ? (
                <CardBars
                  coach={showCoach ? assessment.coachLatest?.scores ?? null : null}
                  self={showSelf ? assessment.selfLatest?.scores ?? null : null}
                />
              ) : (
                <CardRadar
                  coach={showCoach ? assessment.coachLatest?.scores ?? null : null}
                  self={showSelf ? assessment.selfLatest?.scores ?? null : null}
                />
              )}
              <div className="clipboard__legend">
                {showCoach && assessment.coachLatest ? (
                  <span>
                    <i className="coach" />
                    Coach · {cardDate(assessment.coachLatest.date)}
                  </span>
                ) : null}
                {showSelf && assessment.selfLatest ? (
                  <span>
                    <i className="self" />
                    Self · {cardDate(assessment.selfLatest.date)}
                  </span>
                ) : null}
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Area</th>
                  {showCoach ? <th>Coach</th> : null}
                  {showSelf ? <th>Self</th> : null}
                  {showCoach && showSelf ? <th>Gap</th> : null}
                </tr>
              </thead>
              <tbody>
                {assessment.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.label}</td>
                    {showCoach ? <td className="c">{row.coach ?? NO_DATE}</td> : null}
                    {showSelf ? <td>{row.self ?? NO_DATE}</td> : null}
                    {showCoach && showSelf ? (
                      <td className={row.gap !== null && Math.abs(row.gap) >= 2 ? 'd hi' : 'd'}>
                        {row.gap === null ? NO_DATE : row.gap === 0 ? '±0' : row.gap > 0 ? `+${row.gap}` : `−${Math.abs(row.gap)}`}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {assessment.strengths || assessment.weaknesses ? (
            <p className="clipboard__sw3">
              {assessment.strengths ? (
                <>
                  <b className="str">Strengths</b>
                  {assessment.strengths}
                </>
              ) : null}
              {assessment.strengths && assessment.weaknesses ? <br /> : null}
              {assessment.weaknesses ? (
                <>
                  <b className="weak">Weaknesses</b>
                  {assessment.weaknesses}
                </>
              ) : null}
            </p>
          ) : null}
        </>
      ) : (
        <p className="clipboard__empty">
          {view === 'self'
            ? 'No self-assessment shared yet.'
            : props.mode === 'coach'
              ? 'No coach assessment yet. Add one after class.'
              : 'No coach assessment yet. It shows here after you accept one.'}
        </p>
      )}
      <div className="clipboard__act">
        {assessment.trend ? (
          <>
            <Spark points={assessment.trend.points} />
            <div className="t">
              <b>
                Coach avg {assessment.trend.from} → {assessment.trend.to}
              </b>
              {assessment.trend.count} assessment{assessment.trend.count === 1 ? '' : 's'} ·{' '}
              <button type="button" className="clipboard__link" aria-expanded={trend} onClick={() => setTrend(!trend)}>
                View trend ›
              </button>
            </div>
          </>
        ) : (
          <div className="t">No trend yet.</div>
        )}
        {props.onNewAssessment ? (
          <button type="button" className="clipboard__btn clipboard__btn--primary" onClick={props.onNewAssessment}>
            + New assessment
          </button>
        ) : null}
      </div>
      {trend ? <AssessmentHistory entries={props.coachAssessments} /> : null}
      {props.assessmentSend}
    </section>
  );
}

function AssessmentHistory({ entries }: { entries: readonly AssessmentEntry[] }) {
  const rows = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!rows.length) return <p className="clipboard__empty">No coach assessments yet.</p>;
  return (
    <section className="clipboard__col" aria-label="Coach trend">
      <h3>
        <span>Coach trend</span>
      </h3>
      <ul className="clipboard__history">
        {rows.map((row) => {
          const values = ASSESSMENT_AREAS.map((area) => row.scores[area.id]);
          const avg = Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
          return (
            <li key={row.id}>
              <b>{cardDate(row.date)}</b>
              <span>Avg {avg}</span>
              {row.note ? <small>{row.note}</small> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BenchmarkColumn(props: ClipboardCardProps) {
  const { benchmarks } = props;
  const coach = props.mode === 'coach';
  return (
    <section className="clipboard__col" aria-label="Belt benchmarks">
      <h3>
        <span>Belt benchmarks · {benchmarks.beltLabel}</span>
      </h3>
      {benchmarks.total ? (
        <>
          <div className="clipboard__mlbl">
            <span>{benchmarks.source}</span>
            <b>
              {benchmarks.done} / {benchmarks.total}
            </b>
          </div>
          <div className="clipboard__mtr" aria-hidden="true">
            {benchmarks.items.map((item) => (
              <i key={item.id} className={item.state === 'done' ? 'on' : ''} />
            ))}
          </div>
          <ul className="clipboard__checks">
            {benchmarks.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`chk${item.state === 'done' ? ' done' : ''}`}
                  aria-pressed={item.state === 'done'}
                  disabled={!props.onBenchmark}
                  onClick={() => props.onBenchmark?.(item.id)}
                >
                  <i aria-hidden="true" />
                  <span>
                    {item.name}
                    {item.state === 'student-done' ? <em>{coach ? 'Student marked done · confirm?' : 'Waiting on coach'}</em> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        props.benchmarkEmpty ?? <p className="clipboard__empty">No benchmarks for this belt yet.</p>
      )}
      <div className="clipboard__syncrow">
        <button
          type="button"
          role="switch"
          aria-checked={props.benchmarkSync}
          className={props.benchmarkSync ? 'sw on' : 'sw'}
          disabled={!props.onBenchmarkSync}
          onClick={() => props.onBenchmarkSync?.(!props.benchmarkSync)}
        >
          <span className="sw__t" aria-hidden="true" />
          <span>
            <b>Sync with student app</b>
            <small>{coach ? `${props.name || 'The student'} gets your sends and can mark items done. Nothing goes out until you tap Send.` : 'Your coach sees the marks you make.'}</small>
          </span>
        </button>
        {props.benchmarkSend}
      </div>
    </section>
  );
}

const R_CX = 155;
const R_CY = 97;
const R_R = 75;

function point(index: number, value: number): string {
  const theta = -Math.PI / 2 + (index * 2 * Math.PI) / ASSESSMENT_AREAS.length;
  const span = (value / 5) * R_R;
  return `${(R_CX + Math.cos(theta) * span).toFixed(1)},${(R_CY + Math.sin(theta) * span).toFixed(1)}`;
}

function shape(scores: Record<string, AssessmentScore> | null): string {
  if (!scores) return '';
  return ASSESSMENT_AREAS.map((area, index) => point(index, scores[area.id] ?? 0)).join(' ');
}

export function CardRadar({ coach, self }: { coach: Record<string, AssessmentScore> | null; self: Record<string, AssessmentScore> | null }) {
  return (
    <svg viewBox="0 0 310 194" className="clipboard__radar" role="img" aria-label="Assessment shape">
      {[1, 2, 3, 4, 5].map((ring) => (
        <polygon key={ring} className={ring === 5 ? 'ring ring--out' : 'ring'} points={ASSESSMENT_AREAS.map((_, index) => point(index, ring)).join(' ')} />
      ))}
      {coach ? <polygon className="coach" points={shape(coach)} strokeWidth="2.2" strokeLinejoin="round" /> : null}
      {self ? <polygon className="self" points={shape(self)} strokeWidth="2.2" strokeDasharray="5 4" strokeLinejoin="round" /> : null}
      {ASSESSMENT_AREAS.map((area, index) => {
        const theta = -Math.PI / 2 + (index * 2 * Math.PI) / ASSESSMENT_AREAS.length;
        const x = R_CX + Math.cos(theta) * (R_R + 14);
        const y = R_CY + Math.sin(theta) * (R_R + 12) + 3;
        const anchor = Math.abs(Math.cos(theta)) < 0.2 ? 'middle' : Math.cos(theta) > 0 ? 'start' : 'end';
        return (
          <text key={area.id} x={x.toFixed(1)} y={y.toFixed(1)} textAnchor={anchor} fontSize="10" fontWeight="600">
            {area.label}
          </text>
        );
      })}
    </svg>
  );
}

function Spark({ points }: { points: number[] }) {
  if (!points.length) return null;
  const step = points.length > 1 ? 82 / (points.length - 1) : 0;
  const coords = points.map((value, index) => `${(4 + index * step).toFixed(1)},${(26 - (value / 5) * 22).toFixed(1)}`);
  return (
    <svg width="90" height="28" viewBox="0 0 90 28" aria-hidden="true">
      <polyline className="clipboard__spark" points={coords.join(' ')} fill="none" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

/** Fighter Card (C): horizontal bars. Coach score is the mark, self is the fill. */
function CardBars({ coach, self }: { coach: Record<string, AssessmentScore> | null; self: Record<string, AssessmentScore> | null }) {
  return (
    <ul className="clipboard__bars" aria-label="Scouting report">
      {ASSESSMENT_AREAS.map((area) => {
        const c = coach ? coach[area.id] ?? null : null;
        const v = self ? self[area.id] ?? null : null;
        return (
          <li key={area.id}>
            <span>{area.label}</span>
            <span className="bar" aria-hidden="true">
              {v !== null ? <i className="self" style={{ width: `${(v / 5) * 100}%` }} /> : null}
              {v === null && c !== null ? <i className="coachfill" style={{ width: `${(c / 5) * 100}%` }} /> : null}
              {v !== null && c !== null ? <i className="mark" style={{ left: `calc(${(c / 5) * 100}% - 1.5px)` }} /> : null}
            </span>
            <b>{c ?? v ?? NO_DATE}</b>
          </li>
        );
      })}
    </ul>
  );
}
