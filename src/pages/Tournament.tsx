import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { EmptyHint } from '../components/EmptyHint';
import { FullscreenChip } from '../components/FullscreenChip';
import { PlayExitMark } from '../components/PlayExitMark';
import { OutcomePickSheet } from '../components/OutcomeCalls';
import { RosterNameField } from '../components/RosterNameField';
import { Sheet } from '../components/Sheet';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useToolboxParent } from '../hooks/useToolboxParent';
import { useBracketTheme, useMatchState, useTournamentState } from '../hooks/useStores';
import { EMPTY_BRACKET_BODY, EMPTY_BRACKET_TITLE } from '../lib/coachCopy';
import { linkedBracketMatchId, openBracketBout, scoreboardPath } from '../lib/bracketBout';
import { setBracketTheme } from '../lib/bracketTheme';
import {
  LEFT_QF,
  LEFT_R16,
  RIGHT_QF,
  RIGHT_R16,
  bracketHasContent,
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
  type BracketMatchId,
  type MatchSide,
} from '../lib/tournamentStore';
import { type OutcomeCall } from '../lib/outcomes';

export function TournamentPage() {
  const tournament = useTournamentState();
  const match = useMatchState();
  const theme = useBracketTheme();
  const fs = usePlayFullscreen();
  const navigate = useNavigate();
  const parent = useToolboxParent();
  const [namesOpen, setNamesOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const seeds = seedSlots();
  const champion = slotName(tournament, 'champion');
  const liveMatchId = linkedBracketMatchId(match.bracketMatchId);
  const undoReady = canUndoLast(tournament);
  // Results or names count as content — a win on placeholders must hide the empty banner.
  const emptyBracket = !bracketHasContent(tournament);
  const canReset = bracketHasContent(tournament);

  const exitBoard = () => {
    void fs.exit().finally(() => {
      navigate(parent.path);
    });
  };

  return (
    <main
      className={`tournament${theme === 'bright' ? ' tournament--bright' : ''}${
        fs.className ? ` ${fs.className}` : ''
      }`}
    >
      <BeltRail kind="tournament" />
      <PlayExitMark to={parent.path} onExit={exitBoard} />
      <header className="tournament__bar">
        <div className="tournament__brand">
          <p className="tournament__eyebrow">{parent.eyebrow}</p>
          <h1>Mock Tournament</h1>
        </div>
        <div className="tournament__center">
          <p className="tournament__roundline">Round of 16</p>
          <label className="tournament__title">
            <span>Division</span>
            <input
              value={tournament.title}
              onChange={(event) => setTournamentTitle(event.target.value)}
              placeholder="Division or class (optional)"
              aria-label="Division or class name"
            />
          </label>
        </div>
        <div className="tournament__actions">
          <div className="tournament__theme" role="radiogroup" aria-label="Bracket theme">
            <button
              type="button"
              role="radio"
              aria-checked={theme === 'bright'}
              className={`chip${theme === 'bright' ? ' chip--gold' : ''}`}
              onClick={() => setBracketTheme('bright')}
            >
              Bright
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={theme === 'dark'}
              className={`chip${theme === 'dark' ? ' chip--gold' : ''}`}
              onClick={() => setBracketTheme('dark')}
            >
              Dark
            </button>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => setNamesOpen(true)}>
            Edit names
          </button>
          <button
            type="button"
            className={`btn${undoReady ? '' : ' btn--ghost'}`}
            disabled={!undoReady}
            onClick={() => undoLastOutcome()}
          >
            Undo last result
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!canReset}
            onClick={() => setConfirmReset(true)}
          >
            Reset
          </button>
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
        Tap <strong>Score</strong> to open the match board. <strong>Win</strong> or <strong>DQ</strong>{' '}
        flash the winner. <strong>Undo last result</strong> backs out a mistaken tap. Reset asks first
        so a demo cannot wipe the bracket by accident.
      </p>

      {emptyBracket ? (
        <EmptyHint
          title={EMPTY_BRACKET_TITLE}
          body={EMPTY_BRACKET_BODY}
          action={
            <button type="button" className="btn" onClick={() => setNamesOpen(true)}>
              Edit names
            </button>
          }
        />
      ) : null}

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
              <BeltRail kind="tournament" />
              <span>Champion</span>
              {champion ? (
                <p className="bracket__champ-flash" role="status">
                  {champion}
                </p>
              ) : null}
              <RosterNameField
                value={champion}
                onChange={(value) => setSlotName('champion', value)}
                onPrefill={(prefill) => setSlotName('champion', prefill.name)}
                placeholder="Winner"
                ariaLabel="Champion"
                compact
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
        <p className="tournament__sheet-copy">Sixteen competitors, one bracket.</p>
        <ol className="tournament__seeds">
          {seeds.map((id, index) => (
            <li key={id}>
              <label>
                <span>{index + 1}</span>
                <RosterNameField
                  value={slotName(tournament, id)}
                  onChange={(value) => setSlotName(id, value)}
                  onPrefill={(prefill) => setSlotName(id, prefill.name)}
                  placeholder={seedPlaceholder(index)}
                  ariaLabel={`Competitor ${index + 1}`}
                />
              </label>
            </li>
          ))}
        </ol>
        <button type="button" className="btn" onClick={() => setNamesOpen(false)}>
          Done
        </button>
      </Sheet>
      <Sheet
        open={confirmReset}
        title="Reset this bracket?"
        onClose={() => setConfirmReset(false)}
        footer={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => {
                resetTournament();
                setConfirmReset(false);
              }}
            >
              Yes, clear bracket
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmReset(false)}>
              Keep bracket
            </button>
          </>
        }
      >
        <p className="tournament__sheet-copy">
          This clears names and results. Keep the bracket unless you mean to start over.
        </p>
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
      className={`t-match${matchId === 'final-0' ? ' t-match--final' : ''}${live ? ' t-match--live' : ''}${hasResult ? ' t-match--done' : ''}`}
      aria-label={roundLabel(matchId)}
    >
      {matchId === 'final-0' ? (
        <p className="t-match__finals-label">
          <span>Championship match</span>
          <strong>Finals</strong>
        </p>
      ) : null}
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
  const result = tournament.results[matchId];
  const winOn = result?.call === 'win' && result.winnerSide === side;
  const dqOn = result?.call === 'dq' && result.winnerSide !== side;
  const [sheet, setSheet] = useState<OutcomeCall | null>(null);
  const label = name.trim() || placeholder;

  return (
    <div
      className={`t-slot${mark === 'win' || mark === 'advanced' ? ' t-slot--won' : ''}${
        mark === 'dq' ? ' t-slot--dq' : ''
      }${mark === 'lost' ? ' t-slot--lost' : ''}${seedIndex >= 0 ? ' t-slot--seed' : ''}`}
    >
      <div className="t-slot__who">
        {seedIndex >= 0 ? <span className="t-slot__seed">{seedIndex + 1}.</span> : null}
        <RosterNameField
          value={name}
          onChange={(value) => setSlotName(id, value)}
          onPrefill={(prefill) => setSlotName(id, prefill.name)}
          placeholder={placeholder}
          ariaLabel={`${roundLabel(matchId)}, ${side === 'a' ? 'top' : 'bottom'} competitor`}
          compact
        />
      </div>
      <div className="t-slot__marks" role="group" aria-label="Bout result">
        <button
          type="button"
          className={`t-mark t-mark--win${winOn ? ' is-on' : ''}`}
          aria-pressed={winOn}
          aria-haspopup="dialog"
          onClick={() => setSheet('win')}
        >
          Win
        </button>
        <button
          type="button"
          className={`t-mark t-mark--dq${dqOn ? ' is-on' : ''}`}
          aria-pressed={dqOn}
          aria-haspopup="dialog"
          onClick={() => setSheet('dq')}
        >
          DQ
        </button>
      </div>
      <OutcomePickSheet
        open={sheet}
        title={sheet === 'dq' ? `${label} DQ` : `${label} win`}
        onClose={() => setSheet(null)}
        onPickWin={(method) => {
          setMatchOutcome(matchId, side, { call: 'win', method });
          setSheet(null);
        }}
        onPickDq={(reason) => {
          setMatchOutcome(matchId, side, { call: 'dq', reason });
          setSheet(null);
        }}
      />
    </div>
  );
}

