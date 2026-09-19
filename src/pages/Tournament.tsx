import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FullscreenChip } from '../components/FullscreenChip';
import { PlayExitMark } from '../components/PlayExitMark';
import { Sheet } from '../components/Sheet';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useTournamentState } from '../hooks/useStores';
import {
  LEFT_QF,
  LEFT_R16,
  RIGHT_QF,
  RIGHT_R16,
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
  type BoutOutcomeKind,
  type BracketMatchId,
  type MatchSide,
} from '../lib/tournamentStore';

const MARKS: { kind: BoutOutcomeKind; label: string }[] = [
  { kind: 'win', label: 'Win' },
  { kind: 'dq', label: 'DQ' },
  { kind: 'tech', label: 'Tech' },
];

export function TournamentPage() {
  const tournament = useTournamentState();
  const fs = usePlayFullscreen();
  const navigate = useNavigate();
  const [namesOpen, setNamesOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const seeds = seedSlots();
  const champion = slotName(tournament, 'champion');

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
            placeholder="Gi · Adult · Medium-Heavy"
            aria-label="Division or class name"
          />
        </label>
        <div className="tournament__actions">
          <button type="button" className="btn btn--ghost" onClick={() => setNamesOpen(true)}>
            Edit names
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
        Type names in each slot. Tap <strong>Win</strong> on the fighter who won, or <strong>DQ</strong> /{' '}
        <strong>Tech</strong> on the fighter who is out — the other person moves on. Saved on this device.
      </p>

      <div className="tournament__board">
        <div className="bracket" role="group" aria-label="16-person single-elimination bracket">
          <div className="bracket__side bracket__side--left">
            <RoundColumn ids={LEFT_R16} label="Round of 16" />
            <RoundColumn ids={LEFT_QF} label="Quarterfinals" />
            <RoundColumn ids={['sf-0']} label="Semifinals" />
          </div>

          <div className="bracket__finals">
            <MatchCard matchId="final-0" />
            <div className={`bracket__champ${champion ? ' is-filled' : ''}`}>
              <span>Champion</span>
              <input
                value={champion}
                onChange={(event) => setSlotName('champion', event.target.value)}
                placeholder="Winner of the final"
                aria-label="Champion"
              />
            </div>
          </div>

          <div className="bracket__side bracket__side--right">
            <RoundColumn ids={['sf-1']} label="Semifinals" />
            <RoundColumn ids={RIGHT_QF} label="Quarterfinals" />
            <RoundColumn ids={RIGHT_R16} label="Round of 16" />
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

function RoundColumn({ ids, label }: { ids: readonly BracketMatchId[]; label: string }) {
  return (
    <div className={`bracket__round bracket__round--${ids.length}`}>
      <h2>{label}</h2>
      <div className="bracket__matches">
        {ids.map((id) => (
          <MatchCard key={id} matchId={id} />
        ))}
      </div>
    </div>
  );
}

function MatchCard({ matchId }: { matchId: BracketMatchId }) {
  const tournament = useTournamentState();
  const result = tournament.results[matchId];

  return (
    <article className="t-match" aria-label={roundLabel(matchId)}>
      <SlotRow matchId={matchId} side="a" />
      <SlotRow matchId={matchId} side="b" />
      {result ? <span className="t-match__tag">{outcomeTag(result.kind)}</span> : null}
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
  const placeholder = seedIndex >= 0 ? seedPlaceholder(seedIndex) : 'Winner advances here';

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
          const pressed = mark === kind;
          return (
            <button
              key={kind}
              type="button"
              className={`t-mark t-mark--${kind}${pressed ? ' is-on' : ''}`}
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

function outcomeTag(kind: BoutOutcomeKind): string {
  if (kind === 'dq') return 'DQ';
  if (kind === 'tech') return 'Technical loss';
  return 'Win';
}
