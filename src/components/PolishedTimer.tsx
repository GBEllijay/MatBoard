import type { MouseEvent, ReactNode } from 'react';
import { usePolishedSkinModule, useViewportSize } from '../hooks/usePolishedSkins';
import { formatMmSs, formatMss } from '../lib/format';
import type { PolishedTimerSlug } from '../lib/polishedSkins';
import { brasilRing, keynoteRing } from '../skins/polished/ring';
import { METAL_METER_SEGMENTS, metalMeterLit, metalPhaseParts, metalTimerTitle } from '../skins/polished/heavyMetal';
import { psychedelicTimerTitle, reggaeTimerTitle, timerNextLine, timerProgress, visionaryTimerTitle } from '../skins/polished/timerText';

const STAR =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8l3.1 6.6 7.1.9-5.2 4.9 1.4 7.1L12 17.8l-6.4 3.5 1.4-7.1L1.8 9.3l7.1-.9z" fill="#fff" stroke="#2A1A7A" stroke-width="1.6" stroke-linejoin="round"/></svg>';

const STICKER_TILT: readonly (readonly [string, string])[] = [
  ['-5deg', '-1.5vh'],
  ['4deg', '1vh'],
  ['0deg', '0vh'],
  ['-3deg', '1.6vh'],
  ['5deg', '-1vh'],
];

/**
 * Round timer painted in a polished skin (Media Edition and above).
 * The round line still toggles fullscreen and the digits still start or pause.
 */
export function PolishedTimer({
  slug,
  rest,
  remainingMs,
  workMs,
  breakMs,
  round,
  phaseLine,
  phaseLabel,
  onPhase,
  onClock,
  running,
  children,
}: {
  slug: PolishedTimerSlug;
  rest: boolean;
  remainingMs: number;
  workMs: number;
  breakMs: number;
  round: number;
  /** "WORK · ROUND 1 / 5". */
  phaseLine: string;
  /** Accessible name of the fullscreen toggle. */
  phaseLabel: string;
  onPhase: (event: MouseEvent) => void;
  onClock: (event: MouseEvent) => void;
  /** Heavy Metal only: a paused clock dims the meter and shows PAUSED. */
  running?: boolean;
  children?: ReactNode;
}) {
  const mod = usePolishedSkinModule(slug);
  const view = useViewportSize();
  const p = timerProgress(remainingMs, rest ? breakMs : workMs);
  const digits = formatMmSs(remainingMs);
  const next = timerNextLine(rest, workMs, breakMs, round);
  const deco = mod ? (rest && mod.TIMER_REST_DECO != null ? mod.TIMER_REST_DECO : mod.TIMER_DECO) : '';
  const ringP = Math.round(p * 1000) / 1000;

  const metalPhase = slug === 'heavy-metal' ? metalPhaseParts(phaseLine) : null;
  const metalPaused = slug === 'heavy-metal' && running === false;

  const clockBtn = (content: ReactNode, cls = 'digits', data?: string) => (
    <button
      type="button"
      className={`${cls} sk-btn tm-clock`}
      data-d={data}
      aria-label={`${digits}. Start or pause the round clock`}
      onClick={onClock}
    >
      {content}
    </button>
  );

  let inner: ReactNode;
  switch (slug) {
    case 'kids-arcade':
      inner = (
        <>
          {clockBtn(digits)}
          <div className="bar">
            <div className="fill">
              <span className="knob" dangerouslySetInnerHTML={{ __html: STAR }} />
            </div>
          </div>
          <div className="sub">
            <span className={`chip work${rest ? '' : ' on'}`}>WORK {formatMmSs(workMs)}</span>
            <span className={`chip rest${rest ? ' on' : ''}`}>REST {formatMmSs(breakMs)}</span>
          </div>
        </>
      );
      break;
    case 'kids-sticker': {
      const chars = [...digits].map((ch, i) => {
        if (ch === ':') return <b key={i} className="colon">:</b>;
        const [r, y] = STICKER_TILT[i % STICKER_TILT.length];
        return (
          <b key={i} style={{ ['--r' as string]: r, ['--y' as string]: y }}>
            {ch}
          </b>
        );
      });
      inner = (
        <>
          {clockBtn(chars)}
          <div className="sub">
            <div className="sbar">
              <i />
            </div>
            <span className="chip">
              {rest ? `NEXT: WORK ${formatMss(workMs / 1000)}` : `NEXT: REST ${formatMss(breakMs / 1000)}`}
            </span>
          </div>
        </>
      );
      break;
    }
    case 'keynote':
      inner = (
        <>
          <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: keynoteRing(view.w, view.h, ringP, rest) }} />
          {clockBtn(digits)}
          <div className="sub">{next.split(' · ').join('\u00a0\u00a0·\u00a0\u00a0')}</div>
        </>
      );
      break;
    case 'heavy-metal': {
      const title = metalTimerTitle(rest, round);
      const lit = metalMeterLit(p);
      inner = (
        <>
          <i className="crest" aria-hidden="true" />
          <div className="title">
            <span className="metal-face">{title.word}</span>
            {title.numeral != null ? <span className="n">{title.numeral}</span> : null}
          </div>
          {clockBtn(digits, 'digits', digits)}
          <div className="meter" aria-hidden="true">
            {Array.from({ length: METAL_METER_SEGMENTS }, (_, i) => (
              <i key={i} className={i < lit ? 'on' : undefined} style={{ ['--i' as string]: i }} />
            ))}
          </div>
          <div className="next">{next}</div>
          <div className="paused-tag" aria-hidden="true">
            PAUSED
          </div>
        </>
      );
      break;
    }
    case 'brasil':
      inner = (
        <div className="globe-wrap">
          <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: brasilRing(view.w, view.h, ringP) }} />
          <div className="globe">
            <div className="band">
              <span>ORDEM E PROGRESSO</span>
            </div>
            {mod?.GLOBE_STARS ? <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: mod.GLOBE_STARS }} /> : null}
            {clockBtn(digits)}
          </div>
        </div>
      );
      break;
    case 'woodblock':
      inner = (
        <div className="cartouche">
          {clockBtn(digits)}
          <div className="wbar">
            <i />
          </div>
          <div className="sub">{rest ? `次 · WORK ${formatMmSs(workMs)}` : `次 · REST ${formatMmSs(breakMs)}`}</div>
        </div>
      );
      break;
    case 'reggae':
      inner = (
        <div className="panel">
          <div className="title">{reggaeTimerTitle(rest, round)}</div>
          {clockBtn(digits, 'digits', digits)}
          <div className="rbar">
            <i />
          </div>
          <div className="next">{next}</div>
        </div>
      );
      break;
    case 'psychedelic':
      inner = (
        <div className="plate">
          <div className="drips">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="title">{psychedelicTimerTitle(rest, round)}</div>
          {clockBtn(digits)}
          <div className="pbar">
            <i className="fill" />
            {mod?.KNOB_EYE ? <span className="knob" dangerouslySetInnerHTML={{ __html: mod.KNOB_EYE }} /> : null}
          </div>
          <div className="next">{next}</div>
        </div>
      );
      break;
    case 'calcadao':
      inner = (
        <div className="panel">
          {clockBtn(digits)}
          <div className="cbar">
            <i />
          </div>
          <div className="cnext">{next}</div>
        </div>
      );
      break;
    case 'visionary':
      inner = (
        <div className="halo-wrap">
          <div className="ticks" />
          <div className="ring track" />
          <div className="ring fill" />
          {mod?.VIS_KNOB_EYE ? <div className="knob" dangerouslySetInnerHTML={{ __html: mod.VIS_KNOB_EYE }} /> : null}
          <div className="disc">
            {mod?.VIS_DISC_FLOWER ? <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: mod.VIS_DISC_FLOWER }} /> : null}
            <div className="title">{visionaryTimerTitle(rest, round)}</div>
            {clockBtn(digits)}
            <div className="next">{next}</div>
          </div>
        </div>
      );
      break;
  }

  return (
    <div className={`skin-root skin-root--timer${mod ? '' : ' skin-root--loading'}`} data-skin={slug}>
      <div className={`tm${rest ? ' rest' : ''}${metalPaused ? ' is-paused' : ''}`} style={{ ['--p' as string]: p.toFixed(4) }}>
        {deco ? <div className="skin-deco" dangerouslySetInnerHTML={{ __html: deco }} /> : null}
        <img className="logo" src="/card-logo.png" alt="Advantage" />
        <button type="button" className="phase sk-btn tm-phase" aria-label={phaseLabel} onClick={onPhase}>
          {metalPhase ? (
            <>
              <span className="phase-pill">{metalPhase.pill}</span>
              {metalPhase.sub ? <span className="endless">{metalPhase.sub}</span> : null}
            </>
          ) : (
            phaseLine
          )}
        </button>
        {inner}
        {children}
      </div>
    </div>
  );
}
