import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Chrome } from '../components/Chrome';
import { ScoreboardSkinPicker } from '../components/ScoreboardSkinPicker';
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
import {
  GRANDMASTER_THRESHOLD_MAX,
  GRANDMASTER_THRESHOLD_MIN,
  type GrandmasterCelebrationPrefs,
} from '../lib/grandmasterCelebration';
import { playSelectedEndCue, playStartCue, playWarningCue, unlockAudio } from '../lib/audio';
import { EndCueControls } from '../components/EndCueControls';
import { declareMatchOutcome, scoreboardPath, visibleOutcomeBanner } from '../lib/bracketBout';
import { kidsBoardClass } from '../lib/kidsScoreboard';
import { openDisplayWindow, openOrCastDisplay } from '../lib/cast';
import { formatMmSs } from '../lib/format';
import { isListedRound, MATCH_ROUND_OPTIONS } from '../lib/matchRound';
import { durationOptions, MATCH_LENGTH_RANGE } from '../lib/timeWheel';
import { WheelPicker } from '../components/WheelPicker';
import { competitorFocus, displayFocusId, parseDisplayFocus } from '../lib/matchFocus';
import {
  dispatchMatch,
  expireMatchClock,
  remainingCapMs,
  remainingNow,
  type ScoreKind,
  type Side,
} from '../lib/matchStore';
import { needsRefDecision, outcomeSubtitle } from '../lib/outcomes';

const MATCH_LENGTH_OPTIONS = durationOptions(MATCH_LENGTH_RANGE);
import { scoreboardSkinClass } from '../lib/scoreboardSkin';

export function MatchControllerPage() {
  const match = useMatchState();
  const [, setTick] = useState(0);
  const [castNote, setCastNote] = useState('');
  const [tvHelpOpen, setTvHelpOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const board = useMatchBoard();
  const suite = board.suite;
  const remaining = remainingNow(match);
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

  const onCast = async () => {
    void unlockAudio();
    try {
      const mode = await openOrCastDisplay({
        fromSuite: suite.fromSuite,
        fromUnlimited: suite.fromUnlimited,
        whiteBoard: board.whiteBoard,
        kidsSkin: board.kidsSkin,
      });
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
    <main className={`controller ${scoreboardSkinClass(skin)}${board.kidsSkin ? ` ${kidsBoardClass(board.kidsSkin)}` : ''}${suite.fromSuite ? ' origin-suite' : ''}`}>
      <PlayExitMark to={suite.homePath} />
      <Chrome
        right={
          <>
            {linkedId ? (
              <Link to={suite.withFrom('/tournament')} className="chip chip--keep">
                Back to bracket
              </Link>
            ) : null}
            <button
              type="button"
              className="chip"
              onClick={() =>
                openDisplayWindow({
                  fromSuite: suite.fromSuite,
                  fromUnlimited: suite.fromUnlimited,
                  whiteBoard: board.whiteBoard,
                  kidsSkin: board.kidsSkin,
                })
              }
            >
              Display
            </button>
            <button type="button" className="chip chip--gold" onClick={() => void onCast()}>
              Cast
            </button>
          </>
        }
      />

      {board.kidsSkin || (plainWhite && !board.polishedOpen && !board.whiteBaseSkins) ? null : (
        <section className="kids-switch-panel" aria-label="Scoreboard skin">
          <p className="cue-preview-label">Scoreboard skin</p>
          {/* Media and above, and Advantage White: one Skins button. A suite board below Media keeps the toggle. */}
          {board.polishedOpen || board.whiteBaseSkins ? <ScoreboardSkinPicker /> : <ScoreboardSkinSwitcher skin={match.skin} />}
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
        <div className="clock-seconds" role="group" aria-label="Adjust remaining time">
          <SecondStep
            deltaMs={-1_000}
            label="Subtract one second"
            disabled={remaining <= 0}
          >
            −
          </SecondStep>
          <SecondStep
            deltaMs={1_000}
            label="Add one second"
            disabled={remaining >= remainingCapMs(match.durationMs)}
          >
            +
          </SecondStep>
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
        <WheelPicker
          label="Match length"
          value={match.durationMs}
          options={MATCH_LENGTH_OPTIONS}
          onChange={(durationMs) => dispatchMatch({ type: 'setDuration', durationMs })}
        />

        <div className="controller__meta">
          <label>
            Round
            <select
              id={displayFocusId('round')}
              aria-label="Round"
              value={match.round}
              onChange={(e) => dispatchMatch({ type: 'setField', field: 'round', value: e.target.value })}
            >
              <option value="">Optional</option>
              {MATCH_ROUND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              {match.round && !isListedRound(match.round) ? <option value={match.round}>{match.round}</option> : null}
            </select>
          </label>
          <label>
            Division
            <input
              id={displayFocusId('division')}
              aria-label="Division"
              value={match.division}
              onChange={(e) => dispatchMatch({ type: 'setField', field: 'division', value: e.target.value })}
              placeholder="Optional"
            />
          </label>
          <label>
            Weight
            <input
              id={displayFocusId('weight')}
              aria-label="Weight"
              value={match.weight}
              onChange={(e) => dispatchMatch({ type: 'setField', field: 'weight', value: e.target.value })}
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
          <EndCueControls label="Match end cue" value={match.endCue} />
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
        {board.showGrandmaster ? (
          <div className="reaction-settings">
            <GrandmasterControls prefs={match.grandmaster} />
            <fieldset className="grandmaster-controls">
              <legend>DQ reaction</legend>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={match.dqDisappointed.enabled}
                  onChange={(e) =>
                    dispatchMatch({ type: 'setDqDisappointed', value: { enabled: e.target.checked } })
                  }
                />
                Show on the scoreboard
              </label>
              <p className="cast-note">Plays once on the scoreboard when a competitor is disqualified.</p>
            </fieldset>
          </div>
        ) : null}
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

function SecondStep({
  deltaMs,
  label,
  disabled,
  children,
}: {
  deltaMs: number;
  label: string;
  disabled: boolean;
  children: string;
}) {
  const delay = useRef<number | null>(null);
  const repeat = useRef<number | null>(null);
  const stop = () => {
    if (delay.current != null) window.clearTimeout(delay.current);
    if (repeat.current != null) window.clearInterval(repeat.current);
    delay.current = null;
    repeat.current = null;
  };
  useEffect(() => stop, []);
  const fire = () => dispatchMatch({ type: 'adjustClock', deltaMs });
  return (
    <button
      type="button"
      className="clock-second"
      aria-label={label}
      disabled={disabled}
      onPointerDown={(event) => {
        if (disabled || (event.button !== 0 && event.pointerType === 'mouse')) return;
        fire();
        event.currentTarget.setPointerCapture(event.pointerId);
        stop();
        delay.current = window.setTimeout(() => {
          repeat.current = window.setInterval(fire, 80);
        }, 350);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </button>
  );
}

function GrandmasterControls({ prefs }: { prefs: GrandmasterCelebrationPrefs }) {
  const [draft, setDraft] = useState(String(prefs.pointsThreshold));

  useEffect(() => {
    setDraft(String(prefs.pointsThreshold));
  }, [prefs.pointsThreshold]);

  return (
    <fieldset className="grandmaster-controls">
      <legend>Grandmaster cheer</legend>
      <label className="toggle">
        <input
          type="checkbox"
          checked={prefs.enabled}
          onChange={(e) => dispatchMatch({ type: 'setGrandmaster', value: { enabled: e.target.checked } })}
        />
        Show on the scoreboard
      </label>
      <p className="cast-note">Slides in after a win, or when the score passes the total.</p>
      {prefs.enabled ? (
        <>
          <label className="toggle">
            <input
              type="checkbox"
              checked={prefs.onWin}
              onChange={(e) => dispatchMatch({ type: 'setGrandmaster', value: { onWin: e.target.checked } })}
            />
            On a match win
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={prefs.onPoints}
              onChange={(e) => dispatchMatch({ type: 'setGrandmaster', value: { onPoints: e.target.checked } })}
            />
            At match end, if points went over a total
          </label>
          <label className="grandmaster-threshold">
            Over
            <input
              inputMode="numeric"
              aria-label="Point threshold"
              value={draft}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, '').slice(0, 2);
                setDraft(next);
                const n = Number(next);
                if (Number.isInteger(n) && n >= GRANDMASTER_THRESHOLD_MIN && n <= GRANDMASTER_THRESHOLD_MAX) {
                  dispatchMatch({ type: 'setGrandmaster', value: { pointsThreshold: n } });
                }
              }}
              onBlur={() => {
                const n = Number(draft);
                if (!Number.isInteger(n) || n < GRANDMASTER_THRESHOLD_MIN || n > GRANDMASTER_THRESHOLD_MAX) {
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
