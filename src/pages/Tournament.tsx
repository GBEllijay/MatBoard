import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FullscreenChip } from '../components/FullscreenChip';
import { PlayExitMark } from '../components/PlayExitMark';
import { Sheet } from '../components/Sheet';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useMatchState, useTournamentState } from '../hooks/useStores';
import { linkedBracketMatchId, openBracketBout, scoreboardPath } from '../lib/bracketBout';
import {
  LEFT_QF,
  LEFT_R16,
  RIGHT_QF,
  RIGHT_R16,
  canUndoLast,
  resetTournament,
  roundLabel,
  seedPlaceholder,
  seedSlots,
  setMatchOutcome,
  setSlotName,
  setTournamentTitle,
  slotId,
  slotMark,
  slotName,
  undoLastOutcome,
  undoMatchOutcome,
  type BoutOutcomeKind,
  type BracketMatchId,
  type MatchSide,
} from '../lib/tournamentStore';

const MARKS: { kind: BoutOutcomeKind; label: string }[] = [
  { kind: 'score', label: 'Win' },
  { kind: 'dq', label: 'DQ' },
  { kind: 'tech', label: 'T-loss' },
];

export function TournamentPage() {
  const tournament = useTournamentState();
  const match = useMatchState();
  const fs = usePlayFullscreen();
  const navigate = useNavigate();
  const [namesOpen, setNamesOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const seeds = seedSlots();
  const champion = slotName(tournament, 'champion');
  const liveMatchId = linkedBracketMatchId(match.bracketMatchId);
  const undoReady = canUndoLast(tournament);

  const exitBoard = () => {
    void fs.exit().finally(() => {
      navigate('/');
    });
  };

  return (
    <main className={`tournament${fs.className ? ` ${fs.className}` : ''}`}>
      <PlayExitMark onExit={exitBoard} />
      <header className="tournament__bar">
        <div className="tournament__brand">
          <p className="tournament__eyebrow">Owner’s Toolbox</p>
          <h1>Mock Tournament</h1>
        </div>
        <label className="tournament__title">
          <span>Division</span>
          <input
            value={tournament.title}
            onChange={(event) => setTournamentTitle(event.target.value)}
            placeholder="Division or class (optional)"
            aria-label="Division or class name"
          />
        </label>
        <div className="tournament__actions">
          <button type="button" className="btn btn--ghost" onClick={() => setNamesOpen(true)}>
            Edit names
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!undoReady}
            onClick={() => undoLastOutcome()}
          >
            Undo last
          </button>
          {confirmReset ? (
            <div className="tournament__confirm">
              <span>Clear this bracket?</span>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  resetTournament();
                  setConfirmReset(false);
                }}
              >
                Yes, clear
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmReset(false)}>
                Keep
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmReset(true)}>
              Reset
            </button>
          )}
          <FullscreenChip
            supported={fs.supported}
            active={fs.active}
            nudge={fs.showFallback}
            shortcut={fs.tvStation}
            onToggle={() => void fs.toggle()}
          />
        </div>
      </header>

      <p className="tournament__hint">
        Tap <strong>Score</strong> to open the match board with those two names. <strong>Win</strong>,{' '}
        <strong>Sub</strong>, <strong>DQ</strong>, or <strong>T-loss</strong> there (or <strong>Win</strong> /{' '}
        <strong>DQ</strong> / <strong>T-loss</strong> here) advances the winner. <strong>Undo last</strong> backs out a
        mistaken tap without wiping later bouts that already have their own result. Saved on this device.
      </p>

      <div className="tournament__board">
        <div className="bracket" role="group" aria-label="16-person single-elimination bracket">
          <div className="bracket__side bracket__side--left">
            <RoundColumn ids={LEFT_R16} label="Round of 16" liveMatchId={liveMatchId} />
            <RoundColumn ids={LEFT_QF} label="Quarterfinals" liveMatchId={liveMatchId} />
            <RoundColumn ids={['sf-0']} label="Semifinals" liveMatchId={liveMatchId} />
          </div>

          <div className="bracket__finals">
            <MatchCard matchId="final-0" liveMatchId={liveMatchId} />
            <div className={`bracket__champ${champion ? ' is-filled' : ''}`}>
              <span>Champion</span>
              <input
                value={champion}
                onChange={(event) => setSlotName('champion', event.target.value)}
                placeholder="Winner"
                aria-label="Champion"
              />
            </div>
          </div>

          <div className="bracket__side bracket__side--right">
            <RoundColumn ids={['sf-1']} label="Semifinals" liveMatchId={liveMatchId} />
            <RoundColumn ids={RIGHT_QF} label="Quarterfinals" liveMatchId={liveMatchId} />
            <RoundColumn ids={RIGHT_R16} label="Round of 16" liveMatchId={liveMatchId} />
          </div>
        </div>
      </div>

      <Sheet open={namesOpen} title="Competitor names" onClose={() => setNamesOpen(false)}>
        <p className="tournament__sheet-copy">
          Sixteen people, one bracket. Names stay on this phone or computer — nothing is uploaded.
        </p>
        <ol className="tournament__seeds">
          {seeds.map((id, index) => (
            <li key={id}>
              <label>
                <span>{index + 1}</span>
                <input
                  value={slotName(tournament, id)}
                  onChange={(event) => setSlotName(id, event.target.value)}
                  placeholder={seedPlaceholder(index)}
                  aria-label={`Competitor ${index + 1}`}
                />
              </label>
            </li>
          ))}
        </ol>
        <button type="button" className="btn" onClick={() => setNamesOpen(false)}>
          Done
        </button>
      </Sheet>
    </main>
  );
}

function RoundColumn({
  ids,
  label,
  liveMatchId,
}: {
  ids: readonly BracketMatchId[];
  label: string;
  liveMatchId: BracketMatchId | null;
}) {
  return (
    <div className={`bracket__round bracket__round--${ids.length}`}>
      <h2>{label}</h2>
      <div className="bracket__matches">
        {ids.map((id) => (
          <MatchCard key={id} matchId={id} liveMatchId={liveMatchId} />
        ))}
      </div>
    </div>
  );
}

function MatchCard({
  matchId,
  liveMatchId,
}: {
  matchId: BracketMatchId;
  liveMatchId: BracketMatchId | null;
}) {
  const tournament = useTournamentState();
  const navigate = useNavigate();
  const hasResult = Boolean(tournament.results[matchId]);
  const live = liveMatchId === matchId;

  const openScore = () => {
    openBracketBout(matchId);
    navigate(scoreboardPath(matchId));
  };

  return (
    <article
      className={`t-match${live ? ' t-match--live' : ''}`}
      aria-label={roundLabel(matchId)}
    >
      <div className="t-match__bouts">
        <SlotRow matchId={matchId} side="a" />
        <SlotRow matchId={matchId} side="b" />
      </div>
      <div className="t-match__play">
        <button
          type="button"
          className="t-score"
          onClick={openScore}
          aria-label={`Open ${roundLabel(matchId)} on scoreboard`}
        >
          Score
        </button>
        {hasResult ? (
          <button
            type="button"
            className="t-undo"
            onClick={() => undoMatchOutcome(matchId)}
            aria-label={`Undo ${roundLabel(matchId)} result`}
          >
            Undo
          </button>
        ) : null}
      </div>
    </article>
  );
}

function SlotRow({ matchId, side }: { matchId: BracketMatchId; side: MatchSide }) {
  const tournament = useTournamentState();
  const id = slotId(matchId, side);
  const name = slotName(tournament, id);
  const mark = slotMark(tournament.results[matchId], side);
  const seeds = seedSlots();
  const seedIndex = seeds.indexOf(id);
  const placeholder = seedIndex >= 0 ? seedPlaceholder(seedIndex) : 'Winner';

  return (
    <div
      className={`t-slot${mark === 'win' || mark === 'advanced' ? ' t-slot--won' : ''}${
        mark === 'dq' ? ' t-slot--dq' : ''
      }${mark === 'tech' ? ' t-slot--tech' : ''}${mark === 'lost' ? ' t-slot--lost' : ''}`}
    >
      <input
        value={name}
        onChange={(event) => setSlotName(id, event.target.value)}
        placeholder={placeholder}
        aria-label={`${roundLabel(matchId)}, ${side === 'a' ? 'top' : 'bottom'} competitor`}
      />
      <div className="t-slot__marks" role="group" aria-label="Bout result">
        {MARKS.map(({ kind, label }) => {
          const result = tournament.results[matchId];
          const pressed =
            kind === 'score' ? mark === 'win' && result?.kind === 'score' : mark === kind;
          const markClass = kind === 'score' ? 'win' : kind;
          return (
            <button
              key={kind}
              type="button"
              className={`t-mark t-mark--${markClass}${pressed ? ' is-on' : ''}`}
              aria-pressed={pressed}
              onClick={() => setMatchOutcome(matchId, side, kind)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

