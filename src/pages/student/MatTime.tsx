/**
 * Mat time on a journal card (student-logged), and the Mat hours stat on the
 * student's own card. The stat wears the student's current belt cloth, reusing
 * the woven-belt treatment from My rank (beltWeave.css, .s-belt-mark .rung--*).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { QUALITY_SCALES, qualityStage } from '../../lib/sessionQuality';
import {
  MAT_TIME_CHIPS,
  MAT_TIME_STEP,
  JOURNAL_MINUTES_MAX,
  JOURNAL_SESSION_LABELS,
  clampMinutes,
  clockMatTime,
  formatMatTime,
  matHoursLabel,
  matHoursLongLabel,
  matHoursSplit,
  matHoursTotal,
} from '../../lib/matHours';
import { JOURNAL_SESSIONS, type JournalSession, type StudentProgressReport } from '../../lib/progress/types';
import { wornBeltPreview, type WornBeltPreview } from '../../lib/studentRank';
import { kidsClothStyle } from './wornBelt';
import './beltWeave.css';
import './matHours.css';

export function MatTimeField({
  idPrefix,
  session,
  minutes,
  onSession,
  onMinutes,
}: {
  idPrefix: string;
  session: JournalSession;
  minutes: number;
  onSession: (next: JournalSession) => void;
  onMinutes: (next: number) => void;
}) {
  const value = clampMinutes(minutes);
  const step = (delta: number) => onMinutes(clampMinutes(value + delta));
  return (
    <fieldset className="ink mat-time" aria-label={`${idPrefix}Mat time`}>
      <legend className="ink__label">Time on the mat</legend>
      <div className="mat-time__row" role="group" aria-label={`${idPrefix}Session type`}>
        {JOURNAL_SESSIONS.map((kind) => (
          <button
            key={kind}
            type="button"
            className="mat-time__chip mat-time__chip--kind"
            aria-pressed={session === kind}
            onClick={() => onSession(kind)}
          >
            {JOURNAL_SESSION_LABELS[kind]}
          </button>
        ))}
      </div>
      <div className="mat-time__row" role="group" aria-label={`${idPrefix}Quick time`}>
        {MAT_TIME_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            className="mat-time__chip"
            aria-pressed={value === chip}
            onClick={() => onMinutes(value === chip ? 0 : chip)}
          >
            {formatMatTime(chip)}
          </button>
        ))}
      </div>
      <div className="mat-time__stepper" role="group" aria-label={`${idPrefix}Custom time`}>
        <button type="button" className="mat-time__step" aria-label={`${idPrefix}Less time`} disabled={value <= 0} onClick={() => step(-MAT_TIME_STEP)}>
          −
        </button>
        <output className="mat-time__value" aria-live="polite" aria-label={`${idPrefix}Minutes on the mat`}>
          {value ? clockMatTime(value) : 'Untimed'}
        </output>
        <button
          type="button"
          className="mat-time__step"
          aria-label={`${idPrefix}More time`}
          disabled={value >= JOURNAL_MINUTES_MAX}
          onClick={() => step(MAT_TIME_STEP)}
        >
          +
        </button>
        {value ? (
          <button type="button" className="mat-time__clear" onClick={() => onMinutes(0)}>
            Clear
          </button>
        ) : null}
      </div>
      <small className="mat-time__note">Just for you. Counts toward your mat hours. Coaches don't see it.</small>
    </fieldset>
  );
}

/** Line on a saved card: "Open mat · 1h 30m on the mat" or "Class · untimed". */
export function matTimeLine(session: JournalSession, minutes: number): string {
  const time = formatMatTime(minutes);
  return `${JOURNAL_SESSION_LABELS[session]} · ${time ? `${time} on the mat` : 'untimed'}`;
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
  quality: number;
  mark: SessionMark;
  area: string;
  injuryNote: string;
  reason: 'medical' | 'other';
  start: string;
  end: string;
};

export function extrasFromCard(card: {
  quality: number;
  injury: { area: string; note: string } | null;
  hiatus: { reason: 'medical' | 'other'; start: string; end: string } | null;
}): SessionExtrasValue {
  return {
    quality: card.quality,
    mark: card.hiatus ? 'hiatus' : card.injury ? 'injury' : 'none',
    area: card.injury?.area ?? '',
    injuryNote: card.injury?.note ?? '',
    reason: card.hiatus?.reason ?? 'other',
    start: card.hiatus?.start ?? '',
    end: card.hiatus?.end ?? '',
  };
}

export const EMPTY_EXTRAS: SessionExtrasValue = { quality: 0, mark: 'none', area: '', injuryNote: '', reason: 'other', start: '', end: '' };

/** Draft fields for addJournalEntry / updateJournalEntry. Null clears on edit. */
export function extrasDraft(value: SessionExtrasValue, date: string) {
  return {
    quality: value.quality,
    injury: value.mark === 'injury' ? { area: value.area, note: value.injuryNote } : null,
    hiatus: value.mark === 'hiatus' ? { reason: value.reason, start: value.start || date, end: value.end } : null,
  };
}

/** Optional quality chips (belt-worded) and Injury / Break marks. Private to the student. */
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
    <fieldset className="ink mat-time" aria-label={`${idPrefix}How it went`}>
      <legend className="ink__label">How it went (optional)</legend>
      <small className="mat-time__note">{scale.prompt}</small>
      <div className="mat-time__row" role="group" aria-label={`${idPrefix}Session quality`}>
        {scale.labels.map((text, index) => (
          <button
            key={text}
            type="button"
            className="mat-time__chip"
            aria-pressed={value.quality === index + 1}
            onClick={() => set({ quality: value.quality === index + 1 ? 0 : index + 1 })}
          >
            {text}
          </button>
        ))}
      </div>
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
  );
}
