import { todayIso } from '../../lib/studentEdition';
import { BODY_ZONES, INJURY_STATUSES, STATUS_LABEL, zoneFromText, zoneLabel } from '../../lib/bodyScan';
/**
 * Mat time on a journal card (student-logged), and the Mat hours stat on the
 * student's own card. The stat wears the student's current belt cloth, reusing
 * the woven-belt treatment from My rank (beltWeave.css, .s-belt-mark .rung--*).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { QUALITY_SCALES, qualityStage } from '../../lib/sessionQuality';
import {
  JOURNAL_SESSION_LABELS,
  MAT_LOG_SESSIONS,
  MAT_LOG_SESSION_LABELS,
  clampMinutes,
  clockMatTime,
  formatMatTime,
  matHoursLabel,
  matHoursLongLabel,
  matHoursSplit,
  matHoursTotal,
  matMinuteOptions,
  matQuarterOptions,
  sessionLabel,
} from '../../lib/matHours';
import { WheelPicker } from '../../components/WheelPicker';
import { JOURNAL_SESSIONS, JOURNAL_SESSION_OTHER_MAX, type JournalSession, type StudentProgressReport } from '../../lib/progress/types';
import { wornBeltPreview, type WornBeltPreview } from '../../lib/studentRank';
import { kidsClothStyle } from './wornBelt';
import './beltWeave.css';
import './matHours.css';

const MINUTE_OPTIONS = matMinuteOptions();
const QUARTER_OPTIONS = matQuarterOptions();

export function MatTimeField({
  idPrefix,
  session,
  minutes,
  onSession,
  onMinutes,
  sessionOther = '',
  onSessionOther,
  /** Log mat time: three types and a 15-minute wheel. The journal keeps every minute and Other. */
  logTime = false,
}: {
  idPrefix: string;
  session: JournalSession;
  minutes: number;
  onSession: (next: JournalSession) => void;
  onMinutes: (next: number) => void;
  sessionOther?: string;
  onSessionOther?: (next: string) => void;
  logTime?: boolean;
}) {
  const value = clampMinutes(minutes);
  const kinds = logTime ? MAT_LOG_SESSIONS : JOURNAL_SESSIONS;
  const options = logTime ? QUARTER_OPTIONS : MINUTE_OPTIONS;
  return (
    <fieldset className="ink mat-time" aria-label={`${idPrefix}Mat time`}>
      <legend className="ink__label">Time on the mat</legend>
      <div className="mat-time__row" role="group" aria-label={`${idPrefix}Session type`}>
        {kinds.map((kind) => (
          <button
            key={kind}
            type="button"
            className="mat-time__chip mat-time__chip--kind"
            aria-pressed={session === kind}
            onClick={() => onSession(kind)}
          >
            {logTime && kind !== 'other' ? MAT_LOG_SESSION_LABELS[kind] : JOURNAL_SESSION_LABELS[kind]}
          </button>
        ))}
      </div>
      {session === 'other' && onSessionOther ? (
        <label className="mat-time__other">
          <span className="ink__label">What was it? (optional)</span>
          <input
            aria-label={`${idPrefix}Other session type`}
            value={sessionOther}
            maxLength={JOURNAL_SESSION_OTHER_MAX}
            placeholder="Wrestling, seminar, private…"
            spellCheck
            autoCorrect="on"
            autoCapitalize="sentences"
            onChange={(event) => onSessionOther(event.target.value)}
          />
        </label>
      ) : null}
      <div className="mat-time__stepper" role="group" aria-label={`${idPrefix}Custom time`}>
        <WheelPicker label={`${idPrefix}Time on the mat`} value={value} options={options} onChange={(next) => onMinutes(clampMinutes(next))} />
        <output className="mat-time__value" aria-live="polite" aria-label={`${idPrefix}Minutes on the mat`}>
          {value ? clockMatTime(value) : 'Untimed'}
        </output>
        {value ? (
          <button type="button" className="mat-time__clear" onClick={() => onMinutes(0)}>
            Clear
          </button>
        ) : null}
      </div>
      <small className="mat-time__note">
        {logTime
          ? "Scroll in 15-minute steps. Just for you. Counts toward your mat hours. Coaches don't see it."
          : "Scroll to any minute; it settles gently on 10s. Just for you. Counts toward your mat hours. Coaches don't see it."}
      </small>
    </fieldset>
  );
}

/** Line on a saved card: "Open mat · 1h 30m on the mat" or "Class · untimed". */
export function matTimeLine(session: JournalSession, minutes: number, other = ''): string {
  const time = formatMatTime(minutes);
  return `${sessionLabel(session, other)} · ${time ? `${time} on the mat` : 'untimed'}`;
}

function finalCloth(preview: WornBeltPreview): CSSProperties {
  // Coral, red-white, and red: the final belts have no woven rung; use their main color.
  const cloth = preview.appearance === 'red-white' ? '#c8202a' : preview.appearance === 'red-black' ? '#b3161b' : '#c8202a';
  return { ['--cloth' as string]: cloth, ['--edge' as string]: '#7d0f13', ['--stitch' as string]: 'rgba(255,255,255,0.35)' };
}

/** "128.5 mat hours" on the student's current belt cloth. Updates with rank. */
/** Total stat on belt cloth. With `onAdd`, tapping the total opens quick-add and a small unit chip toggles hours / days-years. */
export function MatHoursStat({ report, onAdd }: { report: StudentProgressReport; onAdd?: () => void }) {
  const total = matHoursTotal(report.journal);
  const preview = wornBeltPreview(report);
  const kids = preview.kind === 'kids';
  const final = preview.kind === 'final';
  const rung = kids ? 'rung rung--kids' : final ? 'rung' : `rung rung--${preview.belt}`;
  const style = kids ? kidsClothStyle(preview) : final ? finalCloth(preview) : undefined;
  // Dark ink on light cloth: white, and kids belts flagged navy (yellow, grey, orange…).
  const ink = (!kids && !final && preview.belt === 'white') || (kids && preview.ink === 'navy') ? 'dark' : 'light';
  const split = matHoursSplit(total);
  const [long, setLong] = useState(false);
  const shown = useCountUp(total.minutes);
  const label = long ? matHoursLongLabel(total.minutes) : matHoursLabel(total.minutes);
  const visible = long ? label : matHoursLabel(shown);
  return (
    <span className="mat-hours" data-belt={preview.belt} data-ink={ink} data-testid="mat-hours" role="group" aria-label={`Total ${label}`}>
      <span className={rung} style={style}>
        <span className="belt mat-hours__belt">
          <span className="belt__body">
            {onAdd ? (
              <button type="button" className="belt__name mat-hours__value" aria-label={`${label}. Log mat time`} onClick={onAdd}>
                {visible} <span className="mat-hours__plus" aria-hidden="true">+</span>
              </button>
            ) : (
              <button
                type="button"
                className="belt__name mat-hours__value"
                aria-pressed={long}
                aria-label={long ? `${label}. Show hours` : `${label}. Show days and years`}
                onClick={() => setLong((v) => !v)}
              >
                {visible}
              </button>
            )}
            <span className="belt__sub mat-hours__sub">{split || (total.minutes ? 'Logged in your journal' : 'Tap to log mat time')}</span>

          </span>
        </span>
      </span>
            {onAdd ? (
        <button
          type="button"
          className="mat-hours__units"
          aria-pressed={long}
          aria-label={long ? 'Show hours' : 'Show days and years'}
          onClick={() => setLong((v) => !v)}
        >
          {long ? 'Hours' : 'Days · years'}
        </button>
      ) : null}
    </span>
  );
}

/** Subtle count-up when the total grows. First paint shows the real value; reduced motion skips it. */
function useCountUp(target: number): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    from.current = target;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (target <= start || reduce || typeof requestAnimationFrame !== 'function') {
      setValue(target);
      return;
    }
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / 600);
      setValue(Math.round(start + (target - start) * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

export type SessionMark = 'none' | 'injury' | 'hiatus';
export type SessionExtrasValue = {
  howItWent: string;
  mark: SessionMark;
  area: string;
  injuryNote: string;
  zone: string;
  status: '' | 'hurt' | 'healing' | 'healed';
  markedOn: string;
  reason: 'medical' | 'other';
  start: string;
  end: string;
};

export function extrasFromCard(card: {
  howItWent: string;
  injury: { area: string; note: string; zone?: string; status?: 'hurt' | 'healing' | 'healed'; markedOn?: string } | null;
  hiatus: { reason: 'medical' | 'other'; start: string; end: string } | null;
}): SessionExtrasValue {
  return {
    howItWent: card.howItWent,
    mark: card.hiatus ? 'hiatus' : card.injury ? 'injury' : 'none',
    area: card.injury?.area ?? '',
    injuryNote: card.injury?.note ?? '',
    zone: card.injury?.zone ?? '',
    status: card.injury?.status ?? '',
    markedOn: card.injury?.markedOn ?? '',
    reason: card.hiatus?.reason ?? 'other',
    start: card.hiatus?.start ?? '',
    end: card.hiatus?.end ?? '',
  };
}

export const EMPTY_EXTRAS: SessionExtrasValue = { howItWent: '', mark: 'none', area: '', injuryNote: '', zone: '', status: '', markedOn: '', reason: 'other', start: '', end: '' };

/** Draft fields for addJournalEntry / updateJournalEntry. Null clears on edit. */
export function extrasDraft(value: SessionExtrasValue, date: string) {
  return {
    howItWent: value.howItWent,
    injury: value.mark === 'injury'
      ? {
          area: value.area,
          note: value.injuryNote,
          ...(value.zone ? { zone: value.zone } : {}),
          ...(value.status ? { status: value.status, ...(value.markedOn ? { markedOn: value.markedOn } : {}) } : {}),
        }
      : null,
    hiatus: value.mark === 'hiatus' ? { reason: value.reason, start: value.start || date, end: value.end } : null,
  };
}

/** "How it went" free-text note (lined paper, belt-worded prompt) and Injury / Break marks. Private to the student. */
export function SessionExtras({
  idPrefix,
  report,
  value,
  onChange,
}: {
  idPrefix: string;
  report: StudentProgressReport;
  value: SessionExtrasValue;
  onChange: (next: SessionExtrasValue) => void;
}) {
  const preview = wornBeltPreview(report);
  const scale = QUALITY_SCALES[qualityStage(preview.belt, preview.kind === 'kids')];
  const set = (patch: Partial<SessionExtrasValue>) => onChange({ ...value, ...patch });
  return (
    <>
    <label className="ink ink--wobble journal-note">
      <span className="ink__label">How it went</span>
      <span className="student-quiet" aria-hidden="true">
        {scale.prompt}
      </span>
      <textarea spellCheck autoCorrect="on" autoCapitalize="sentences"
        aria-label={`${idPrefix}How it went`}
        rows={2}
        maxLength={400}
        placeholder={scale.labels[2]}
        value={value.howItWent}
        onChange={(e) => set({ howItWent: e.target.value })}
      />
    </label>
    <fieldset className="ink mat-time" aria-label={`${idPrefix}Card marks`}>
      <legend className="ink__label">Mark card (optional)</legend>
      <div className="mat-time__row" role="group" aria-label={`${idPrefix}Mark card`}>
        {(['none', 'injury', 'hiatus'] as const).map((mark) => (
          <button key={mark} type="button" className="mat-time__chip mat-time__chip--kind" aria-pressed={value.mark === mark} onClick={() => set({ mark })}>
            {mark === 'none' ? 'Session' : mark === 'injury' ? 'Injury' : 'Break / hiatus'}
          </button>
        ))}
      </div>
      {value.mark === 'injury' ? (
        <div className="mat-time__mark">
          <label className="ink">
            <span className="ink__label">Body area</span>
            <input className="ink__input" aria-label={`${idPrefix}Injury area`} value={value.area} maxLength={80} onChange={(e) => set({ area: e.target.value })} />
          </label>
          <label className="ink">
            <span className="ink__label">Injury note</span>
            <input className="ink__input" aria-label={`${idPrefix}Injury note`} value={value.injuryNote} maxLength={320} onChange={(e) => set({ injuryNote: e.target.value })} />
          </label>
          <label className="ink">
            <span className="ink__label">Body zone (optional)</span>
            <select className="ink__input" aria-label={`${idPrefix}Body zone`} value={value.zone} onChange={(e) => set({ zone: e.target.value })}>
              <option value="">{value.area && zoneFromText(value.area) ? `Match from area (${zoneLabel(zoneFromText(value.area))})` : 'Pick a zone'}</option>
              {BODY_ZONES.map((z) => (
                <option key={z.id} value={z.id}>{z.label}</option>
              ))}
            </select>
          </label>
          <div className="mat-time__row" role="group" aria-label={`${idPrefix}Injury status`}>
            {INJURY_STATUSES.map((st) => (
              <button key={st} type="button" className="mat-time__chip" aria-pressed={(value.status || 'hurt') === st} onClick={() => set({ status: st, markedOn: todayIso() })}>
                {STATUS_LABEL[st]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {value.mark === 'hiatus' ? (
        <div className="mat-time__mark">
          <div className="mat-time__row" role="group" aria-label={`${idPrefix}Break reason`}>
            {(['medical', 'other'] as const).map((reason) => (
              <button key={reason} type="button" className="mat-time__chip" aria-pressed={value.reason === reason} onClick={() => set({ reason })}>
                {reason === 'medical' ? 'Medical' : 'Other'}
              </button>
            ))}
          </div>
          <label className="ink">
            <span className="ink__label">Break starts</span>
            <input className="ink__input" type="date" aria-label={`${idPrefix}Break start`} value={value.start} onChange={(e) => set({ start: e.target.value })} />
          </label>
          <label className="ink">
            <span className="ink__label">Back on (blank if still out)</span>
            <input className="ink__input" type="date" aria-label={`${idPrefix}Break end`} value={value.end} onChange={(e) => set({ end: e.target.value })} />
          </label>
          <small className="mat-time__note">A break pauses your streak. It never breaks it.</small>
        </div>
      ) : null}
      <small className="mat-time__note">Private. Never sent to a coach.</small>
    </fieldset>
    </>
  );
}
