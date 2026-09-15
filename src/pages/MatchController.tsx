import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chrome } from '../components/Chrome';
import { useInterval } from '../hooks/useClock';
import { useWakeLock } from '../hooks/useWakeLock';
import { useMatchState } from '../hooks/useStores';
import { unlockAudio } from '../lib/audio';
import { openDisplayWindow, openOrCastDisplay } from '../lib/cast';
import { minutesToMs, formatMmSs } from '../lib/format';
import { dispatchMatch, expireMatchClock, remainingNow, TIME_PRESETS_MIN, type ScoreKind, type Side } from '../lib/matchStore';

export function MatchControllerPage() {
  const match = useMatchState();
  const [, setTick] = useState(0);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('4');
  const [castNote, setCastNote] = useState('');
  const remaining = remainingNow(match);

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

  const onCast = async () => {
    void unlockAudio();
    try {
      const mode = await openOrCastDisplay();
      setCastNote(mode === 'cast' ? 'Display sent to the chosen screen.' : 'Scoreboard opened in a new window.');
    } catch {
      setCastNote('Cast canceled. Use Open Display if you want a window instead.');
    }
  };

  return (
    <main className="controller">
      <Chrome
        title="Controller"
        right={
          <>
            <button type="button" className="chip" onClick={openDisplayWindow}>
              Display
            </button>
            <button type="button" className="chip chip--gold" onClick={() => void onCast()}>
              Cast
            </button>
          </>
        }
      />

      <CompetitorPad
        side="blue"
        title="Blue"
        name={match.blue.name}
        gym={match.blue.gym}
        points={match.blue.points}
        advantages={match.blue.advantages}
        disadvantages={match.blue.disadvantages}
      />

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
        <div className="presets" role="group" aria-label="Match length presets">
          {TIME_PRESETS_MIN.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={`preset${match.durationMs === minutesToMs(minutes) ? ' preset--on' : ''}`}
              onClick={() => setPreset(minutes)}
            >
              {minutes}
            </button>
          ))}
          <button type="button" className="preset" onClick={() => setCustomOpen((v) => !v)}>
            Custom
          </button>
        </div>
        {customOpen ? (
          <div className="custom-time">
            <label>
              Minutes
              <input
                inputMode="numeric"
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
              value={match.round}
              onChange={(e) => dispatchMatch({ type: 'setField', field: 'round', value: e.target.value })}
            />
          </label>
          <label>
            Division
            <input
              value={match.division}
              onChange={(e) => dispatchMatch({ type: 'setField', field: 'division', value: e.target.value })}
              placeholder="Optional"
            />
          </label>
        </div>

        <label className="toggle">
          <input
            type="checkbox"
            checked={match.endBuzzer}
            onChange={(e) => dispatchMatch({ type: 'setEndBuzzer', value: e.target.checked })}
          />
          Match end buzzer (off by default)
        </label>
        {castNote ? <p className="cast-note">{castNote}</p> : null}
        <p className="cast-note">
          Cast notes: keep this Controller on the table. Tap <strong>Cast</strong> to send the landscape scoreboard to a
          Chromecast / extra display, or <strong>Display</strong> to pop a window you can fullscreen or HDMI to a TV.
          Same-browser windows stay in sync automatically.
        </p>
        <Link className="text-link" to="/match">
          Open scoreboard on this device
        </Link>
      </section>

      <CompetitorPad
        side="white"
        title="White"
        name={match.white.name}
        gym={match.white.gym}
        points={match.white.points}
        advantages={match.white.advantages}
        disadvantages={match.white.disadvantages}
      />
    </main>
  );
}

function CompetitorPad({
  side,
  title,
  name,
  gym,
  points,
  advantages,
  disadvantages,
}: {
  side: Side;
  title: string;
  name: string;
  gym: string;
  points: number;
  advantages: number;
  disadvantages: number;
}) {
  return (
    <section className={`pad pad--${side}`}>
      <h2>{title}</h2>
      <div className="pad__fields">
        <label>
          Name
          <input
            value={name}
            onChange={(e) => dispatchMatch({ type: 'setCompetitor', side, field: 'name', value: e.target.value })}
          />
        </label>
        <label>
          Gym
          <input
            value={gym}
            placeholder="Optional"
            onChange={(e) => dispatchMatch({ type: 'setCompetitor', side, field: 'gym', value: e.target.value })}
          />
        </label>
      </div>
      <div className="pad__scores">
        <FatScore side={side} kind="points" label="Points" value={points} />
        <FatScore side={side} kind="advantages" label="Adv" value={advantages} />
        <FatScore side={side} kind="disadvantages" label="Neg" value={disadvantages} />
      </div>
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
