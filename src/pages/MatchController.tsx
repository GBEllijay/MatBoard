import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Chrome } from '../components/Chrome';
import { ScoreboardSkinSwitcher } from '../components/ScoreboardSkinSwitcher';
import { Sheet } from '../components/Sheet';
import { OutcomeCalls, OutcomePickSheet, useOutcomeSheet } from '../components/OutcomeCalls';
import { PlayExitMark } from '../components/PlayExitMark';
import { RankChip } from '../components/RankChip';
import { RosterNameField } from '../components/RosterNameField';
import { useBoutQuerySync, useBracketOutcomeReturn } from '../hooks/useBracketBoutReturn';
import { useInterval } from '../hooks/useClock';
import { useMatchBoard } from '../hooks/useMatchBoard';
import { useWakeLock } from '../hooks/useWakeLock';
import { useMatchState } from '../hooks/useStores';
import { CARLOS_THRESHOLD_MAX, CARLOS_THRESHOLD_MIN, type CarlosCelebrationPrefs } from '../lib/carlosCelebration';
import {
  END_CUE_OPTIONS,
  patchAudioPrefs,
  playSelectedEndCue,
  playStartCue,
  playWarningCue,
  unlockAudio,
  type EndCue,
} from '../lib/audio';
import { declareMatchOutcome, scoreboardPath, visibleOutcomeBanner } from '../lib/bracketBout';
import { openDisplayWindow, openOrCastDisplay } from '../lib/cast';
import { minutesToMs, formatMmSs, secondsToMs } from '../lib/format';
import { competitorFocus, displayFocusId, parseDisplayFocus } from '../lib/matchFocus';
import {
  CLOCK_NUDGES_SEC,
  dispatchMatch,
  expireMatchClock,
  remainingCapMs,
  remainingNow,
  TIME_PRESETS_MIN,
  type ScoreKind,
  type Side,
} from '../lib/matchStore';
import { needsRefDecision, outcomeSubtitle } from '../lib/outcomes';
import { withSuiteFrom } from '../lib/productNames';
import { scoreboardSkinClass } from '../lib/scoreboardSkin';

export function MatchControllerPage() {
  const match = useMatchState();
  const [, setTick] = useState(0);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('4');
  const [castNote, setCastNote] = useState('');
  const [tvHelpOpen, setTvHelpOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const board = useMatchBoard();
  const suite = board.suite;
  const remaining = remainingNow(match);
  const durationIsPreset = TIME_PRESETS_MIN.some((minutes) => match.durationMs === minutesToMs(minutes));
  const focusParam = searchParams.get('focus');
  const linkedId = board.linkedId;
  const plainWhite = board.plainWhite;
  const skin = board.skinFor(match.skin);
  const flashing = Boolean(match.outcomeFlash);
  const banner = visibleOutcomeBanner(match);
  const refNeeded = needsRefDecision({ ...match, remainingMs: remaining });
  const outcomeSheet = useOutcomeSheet();

  useBoutQuerySync();
  useBracketOutcomeReturn();

  useEffect(() => {
    const focus = parseDisplayFocus(focusParam);
    if (!focus) return;
    const id = displayFocusId(focus);
    const run = () => {
      const el = document.getElementById(id);
      if (!(el instanceof HTMLElement)) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (el instanceof HTMLInputElement) {
        el.focus({ preventScroll: true });
        el.select();
      } else {
        el.focus({ preventScroll: true });
      }
    };
    const raf = window.requestAnimationFrame(run);
    return () => window.cancelAnimationFrame(raf);
  }, [focusParam]);

  useWakeLock(match.running);
  useInterval(
    useCallback(() => {
      expireMatchClock();
      setTick((n) => n + 1);
    }, []),
    100,
    true,
  );

  const setPreset = (minutes: number) => {
    dispatchMatch({ type: 'setDuration', durationMs: minutesToMs(minutes) });
  };

  const applyCustom = () => {
    const minutes = Number(customMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 180) return;
    dispatchMatch({ type: 'setDuration', durationMs: minutesToMs(minutes) });
    setCustomOpen(false);
  };

  // Selection only. Switching cues mid-match must not play a stop sound.
  // Preview cues below are what play the sound.
  const chooseMatchEndCue = (cue: EndCue) => {
    patchAudioPrefs({ endCue: cue });
    dispatchMatch({ type: 'setEndCue', value: cue });
  };

  const onCast = async () => {
    void unlockAudio();
    try {
      const mode = await openOrCastDisplay({ fromSuite: suite.fromSuite, whiteBoard: board.whiteBoard });
      setCastNote(
        mode === 'cast'
          ? 'Display sent to the chosen screen.'
          : 'Scoreboard opened in a new window on this computer. Press F there for fullscreen.',
      );
    } catch {
      setCastNote('Cast canceled. Use Open Display if you want a window instead.');
    }
  };

  return (
    <main className={`controller ${scoreboardSkinClass(skin)}${suite.fromSuite ? ' origin-suite' : ''}`}>
      <PlayExitMark to={suite.homePath} />
      <Chrome
        right={
          <>
            {linkedId ? (
              <Link to={withSuiteFrom('/tournament', suite.fromSuite)} className="chip">
                Back to bracket
              </Link>
            ) : null}
            <button type="button" className="chip" onClick={() => openDisplayWindow({ fromSuite: suite.fromSuite, whiteBoard: board.whiteBoard })}>
              Display
            </button>
            <button type="button" className="chip chip--gold" onClick={() => void onCast()}>
              Cast
            </button>
          </>
        }
      />

      {plainWhite ? null : (
        <section className="kids-switch-panel" aria-label="Scoreboard skin">
          <p className="cue-preview-label">Scoreboard skin</p>
          <ScoreboardSkinSwitcher skin={match.skin} />
        </section>
      )}

      <section className="controller__clock">
        <button
          type="button"
          className="clock-btn clock-btn--control"
          onClick={() => {
            void unlockAudio();
            dispatchMatch({ type: 'toggleClock' });
          }}
        >
          {formatMmSs(remaining)}
        </button>
        <div className="clock-nudges" role="group" aria-label="Adjust remaining time">
          {CLOCK_NUDGES_SEC.map((seconds) => {
            const atFloor = remaining <= 0;
            const atCeil = remaining >= remainingCapMs(match.durationMs);
            const disabled = seconds < 0 ? atFloor : atCeil;
            const label = `${seconds < 0 ? '−' : '+'}${Math.abs(seconds)}s`;
            return (
              <button
                key={seconds}
                type="button"
                className="clock-nudge"
                disabled={disabled}
                aria-label={seconds < 0 ? `Subtract ${Math.abs(seconds)} seconds` : `Add ${seconds} seconds`}
                onClick={() => dispatchMatch({ type: 'adjustClock', deltaMs: secondsToMs(seconds) })}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="controller__clock-actions">
          <button type="button" className="btn" onClick={() => dispatchMatch({ type: 'toggleClock' })}>
            {match.running ? 'Pause' : remaining <= 0 ? 'Restart' : 'Start'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => dispatchMatch({ type: 'resetClock' })}>
            Reset clock
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => dispatchMatch({ type: 'resetScores' })}>
            Reset scores
          </button>
        </div>
        <div className="presets presets--match-length" role="group" aria-label="Match length presets">
          {TIME_PRESETS_MIN.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={`preset${match.durationMs === minutesToMs(minutes) ? ' preset--on' : ''}`}
              aria-label={`${minutes} minutes`}
              onClick={() => setPreset(minutes)}
            >
              {minutes}
            </button>
          ))}
          <button
            type="button"
            className={`preset${!durationIsPreset ? ' preset--on' : ''}`}
            aria-expanded={customOpen}
            onClick={() => setCustomOpen((v) => !v)}
          >
            Custom
          </button>
        </div>
        {customOpen ? (
          <div className="custom-time">
            <label>
              Minutes
              <input
                inputMode="decimal"
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
              />
            </label>
            <button type="button" className="btn" onClick={applyCustom}>
              Set
            </button>
          </div>
        ) : null}

        <div className="controller__meta">
          <label>
            Round
            <input
              id={displayFocusId('round')}
              value={match.round}
              placeholder="Optional"
              onChange={(e) => dispatchMatch({ type: 'setField', field: 'round', value: e.target.value })}
            />
          </label>
          <label>
            Division
            <input
              id={displayFocusId('division')}
              value={match.division}
              onChange={(e) => dispatchMatch({ type: 'setField', field: 'division', value: e.target.value })}
              placeholder="Optional"
            />
          </label>
        </div>

        <fieldset>
          <legend>Match sounds</legend>
          <label className="toggle">
            <input
              type="checkbox"
              checked={match.startBeep}
              onChange={(e) => dispatchMatch({ type: 'setStartBeep', value: e.target.checked })}
            />
            Start beep
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={match.warningBeep}
              onChange={(e) => dispatchMatch({ type: 'setWarningBeep', value: e.target.checked })}
            />
            10-second warning
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={match.endBuzzer}
              onChange={(e) => dispatchMatch({ type: 'setEndBuzzer', value: e.target.checked })}
            />
            Match end sound
          </label>
          <div className="cue-preview">
            <p className="cue-preview-label">Match end cue</p>
            <div className="presets presets--end-cue" role="radiogroup" aria-label="Match end cue">
              {END_CUE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={match.endCue === option.id}
                  className={`preset${match.endCue === option.id ? ' preset--on' : ''}`}
                  onClick={() => chooseMatchEndCue(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="cue-preview">
            <p className="cue-preview-label">Preview cues</p>
            <div className="presets presets--three" role="group" aria-label="Preview match cues">
              <button
                type="button"
                className="preset"
                onClick={() => {
                  void unlockAudio().then(() => playStartCue());
                }}
              >
                Start
              </button>
              <button
                type="button"
                className="preset"
                onClick={() => {
                  void unlockAudio().then(() => playWarningCue());
                }}
              >
                10s
              </button>
              <button
                type="button"
                className="preset"
                disabled={!match.endBuzzer}
                onClick={() => {
                  void unlockAudio().then(() => playSelectedEndCue('match', match.endCue));
                }}
              >
                End
              </button>
            </div>
          </div>
        </fieldset>
        <label className="toggle">
          <input
            type="checkbox"
            checked={match.autoAnnounce}
            onChange={(e) => dispatchMatch({ type: 'setAutoAnnounce', value: e.target.checked })}
          />
          Auto-announce winner
        </label>
        {board.showCarlos ? <CarlosControls prefs={match.carlos} /> : null}
        {castNote ? <p className="cast-note">{castNote}</p> : null}
      </section>

      {refNeeded ? (
        <p className="cast-note controller__ref-note" role="status">
          Clock ended in a tie. Pick Win or DQ next to a name.
        </p>
      ) : null}

      <CompetitorPad
        side="blue"
        title="Blue"
        name={match.blue.name}
        gym={match.blue.gym}
        rank={match.blue.rank}
        points={match.blue.points}
        advantages={match.blue.advantages}
        disadvantages={match.blue.disadvantages}
        flashing={flashing}
        highlightCalls={refNeeded}
        focusCalls
        banner={banner?.side === 'blue' ? banner : null}
        reason={banner?.side === 'blue' ? outcomeSubtitle(match.outcome) : null}
        names={plainWhite ? 'white' : 'competitor'}
        onWin={() => outcomeSheet.openWin('blue', 'Blue')}
        onDq={() => outcomeSheet.openDq('blue', 'Blue')}
      />

      <CompetitorPad
        side="white"
        title="White"
        name={match.white.name}
        gym={match.white.gym}
        rank={match.white.rank}
        points={match.white.points}
        advantages={match.white.advantages}
        disadvantages={match.white.disadvantages}
        flashing={flashing}
        highlightCalls={refNeeded}
        banner={banner?.side === 'white' ? banner : null}
        reason={banner?.side === 'white' ? outcomeSubtitle(match.outcome) : null}
        names={plainWhite ? 'white' : 'competitor'}
        onWin={() => outcomeSheet.openWin('white', 'White')}
        onDq={() => outcomeSheet.openDq('white', 'White')}
      />

      <OutcomePickSheet
        open={outcomeSheet.sheet?.call ?? null}
        title={
          outcomeSheet.sheet?.call === 'dq'
            ? `${outcomeSheet.sheet.label} DQ`
            : `${outcomeSheet.sheet?.label ?? ''} win`
        }
        onClose={outcomeSheet.close}
        onPickWin={(method) => {
          if (!outcomeSheet.sheet) return;
          declareMatchOutcome(outcomeSheet.sheet.side, { call: 'win', method });
          outcomeSheet.close();
        }}
        onPickDq={(reason) => {
          if (!outcomeSheet.sheet) return;
          declareMatchOutcome(outcomeSheet.sheet.side, { call: 'dq', reason });
          outcomeSheet.close();
        }}
      />

      <section className="controller__help">
        <button
          type="button"
          className="controller__suggest"
          aria-haspopup="dialog"
          onClick={() => setTvHelpOpen(true)}
        >
          Instructions / Suggestions
        </button>
        <Link className="text-link" to={board.originPath(scoreboardPath(linkedId))}>
          Open scoreboard on this device
        </Link>
      </section>
      <Sheet
        className="sheet--help"
        open={tvHelpOpen}
        title="How to show the scoreboard on a gym TV"
        onClose={() => setTvHelpOpen(false)}
      >
        <div className="controller-help">
          <section>
            <h3>On a gym TV</h3>
            <p>
              Plug a computer or stick into the TV (or use the TV’s browser if it has one). Open Advantage and go to{' '}
              <strong>Display</strong> / the scoreboard screen. Press <strong>F</strong> (or use the fullscreen
              control) so the board fills the TV.
            </p>
          </section>
          <section>
            <h3>On your phone</h3>
            <p>
              Open Advantage and use <strong>Controller</strong> (or Match) to run the clock and scores. Keep this
              phone as the remote while the TV shows Display.
            </p>
          </section>
          <section>
            <h3>Casting</h3>
            <p>
              You can also cast from your phone to the TV with AirPlay or Chromecast when your TV supports it. If the
              cast looks small, open Display on the TV-side browser and fullscreen there for the clearest board.
            </p>
          </section>
          <section>
            <h3>Tip</h3>
            <p>
              Use one phone as Controller and one screen as Display. That’s the setup that works best on the mat.
            </p>
          </section>
        </div>
      </Sheet>
    </main>
  );
}

function CarlosControls({ prefs }: { prefs: CarlosCelebrationPrefs }) {
  const [draft, setDraft] = useState(String(prefs.pointsThreshold));

  useEffect(() => {
    setDraft(String(prefs.pointsThreshold));
  }, [prefs.pointsThreshold]);

  return (
    <fieldset className="carlos-controls">
      <legend>Master Carlos</legend>
      <label className="toggle">
        <input
          type="checkbox"
          checked={prefs.enabled}
          onChange={(e) => dispatchMatch({ type: 'setCarlos', value: { enabled: e.target.checked } })}
        />
        Show on the scoreboard
      </label>
      <p className="cast-note">
        Optional for every kids’ training match. He slides in on this scoreboard only when the match ends —
        for a win, or if points went over the total during the bout. Off means no Carlos from these triggers.
      </p>
      {prefs.enabled ? (
        <>
          <label className="toggle">
            <input
              type="checkbox"
              checked={prefs.onWin}
              onChange={(e) => dispatchMatch({ type: 'setCarlos', value: { onWin: e.target.checked } })}
            />
            On a match win
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={prefs.onPoints}
              onChange={(e) => dispatchMatch({ type: 'setCarlos', value: { onPoints: e.target.checked } })}
            />
            At match end, if points went over a total
          </label>
          <label className="carlos-threshold">
            Over
            <input
              inputMode="numeric"
              aria-label="Point threshold"
              value={draft}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, '').slice(0, 2);
                setDraft(next);
                const n = Number(next);
                if (Number.isInteger(n) && n >= CARLOS_THRESHOLD_MIN && n <= CARLOS_THRESHOLD_MAX) {
                  dispatchMatch({ type: 'setCarlos', value: { pointsThreshold: n } });
                }
              }}
              onBlur={() => {
                const n = Number(draft);
                if (!Number.isInteger(n) || n < CARLOS_THRESHOLD_MIN || n > CARLOS_THRESHOLD_MAX) {
                  setDraft(String(prefs.pointsThreshold));
                }
              }}
            />
            points
          </label>
        </>
      ) : null}
    </fieldset>
  );
}

function CompetitorPad({
  side,
  title,
  name,
  gym,
  rank,
  points,
  advantages,
  disadvantages,
  flashing,
  highlightCalls,
  focusCalls = false,
  banner,
  reason,
  names,
  onWin,
  onDq,
}: {
  side: Side;
  title: string;
  name: string;
  gym: string;
  rank: string;
  points: number;
  advantages: number;
  disadvantages: number;
  flashing: boolean;
  highlightCalls: boolean;
  focusCalls?: boolean;
  banner: { kind: 'win' | 'dq'; text: string } | null;
  reason: string | null;
  /** White Live Bout uses the on-phone match-name list. Suite and linked bouts keep the Competitor Roster. */
  names: 'white' | 'competitor';
  onWin: () => void;
  onDq: () => void;
}) {
  return (
    <section className={`pad pad--${side}`}>
      <h2>{title}</h2>
      <div className="pad__fields">
        <label>
          <span className="pad__name-label">
            Name
            {rank ? <RankChip belt={rank} compact /> : null}
          </span>
          <RosterNameField
            id={displayFocusId(competitorFocus(side, 'name'))}
            value={name}
            ariaLabel={`${title} name`}
            names={names}
            onChange={(value) => dispatchMatch({ type: 'setCompetitor', side, field: 'name', value })}
            onPrefill={(prefill) => {
              dispatchMatch({ type: 'setCompetitor', side, field: 'name', value: prefill.name });
              dispatchMatch({ type: 'setCompetitor', side, field: 'rank', value: prefill.belt });
              dispatchMatch({ type: 'setCompetitor', side, field: 'gym', value: prefill.gym });
            }}
          />
        </label>
        <label>
          Gym
          <input
            id={displayFocusId(competitorFocus(side, 'gym'))}
            value={gym}
            placeholder="Optional"
            onChange={(e) => dispatchMatch({ type: 'setCompetitor', side, field: 'gym', value: e.target.value })}
          />
        </label>
      </div>
      <OutcomeCalls
        sideLabel={title}
        disabled={flashing}
        highlight={highlightCalls}
        focusId={focusCalls}
        focusDomId={focusCalls ? displayFocusId('outcome') : undefined}
        variant="pad"
        onWin={onWin}
        onDq={onDq}
      />
      <div className="pad__scores">
        <FatScore side={side} kind="points" label="Points" value={points} />
        <FatScore side={side} kind="advantages" label="Adv" value={advantages} />
        <FatScore side={side} kind="disadvantages" label="Pen" value={disadvantages} />
      </div>
      {banner ? (
        <p className="pad__banner" aria-live="polite">
          {banner.text}
          {reason ? <span className="pad__banner-reason">{reason}</span> : null}
        </p>
      ) : null}
    </section>
  );
}

function FatScore({
  side,
  kind,
  label,
  value,
}: {
  side: Side;
  kind: ScoreKind;
  label: string;
  value: number;
}) {
  return (
    <div className={`fat-score fat-score--${kind}`}>
      <span className="fat-score__label">{label}</span>
      <strong>{value}</strong>
      <div className="fat-score__btns">
        <button type="button" onClick={() => dispatchMatch({ type: 'bump', side, kind, delta: -1 })}>
          −1
        </button>
        <button type="button" onClick={() => dispatchMatch({ type: 'bump', side, kind, delta: 1 })}>
          +1
        </button>
      </div>
    </div>
  );
}
