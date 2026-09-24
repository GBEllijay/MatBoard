import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { EmptyHint } from '../components/EmptyHint';
import { FullscreenChip } from '../components/FullscreenChip';
import { PlayExitMark } from '../components/PlayExitMark';
import { OutcomePickSheet } from '../components/OutcomeCalls';
import { RosterNameField } from '../components/RosterNameField';
import { Sheet } from '../components/Sheet';
import { useLockViewportZoom, usePinchZoom } from '../hooks/usePinchZoom';
import { inputTypeUsesKeyboard } from '../lib/keepFieldVisible';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useToolboxParent } from '../hooks/useToolboxParent';
import { useVisibleViewportHeight } from '../hooks/useVisibleViewportHeight';
import {
  useBracketTheme,
  useMatchState,
  useRosterState,
  useTournamentLibrary,
  useTournamentState,
} from '../hooks/useStores';
import { EMPTY_BRACKET_BODY, EMPTY_BRACKET_TITLE, OWNER_BRACKET_CLOUD_NOTE } from '../lib/coachCopy';
import { linkedBracketMatchId, openBracketBout, scoreboardPath, unlinkBracketBout } from '../lib/bracketBout';
import { setBracketTheme } from '../lib/bracketTheme';
import { rosterGymForName } from '../lib/rosterStore';
import { tournamentToolLabel } from '../lib/productNames';
import {
  bracketHasContent,
  bracketRoundLine,
  canUndoLast,
  deleteBracket,
  displayBracketName,
  isByeSlot,
  leftRoundIds,
  matchHasBye,
  newBracket,
  renameActiveBracket,
  resetTournament,
  rightRoundIds,
  roundLabel,
  seedPlaceholder,
  seedSlots,
  setCompetitorCount,
  setMatchOutcome,
  setSlotName,
  setTournamentTitle,
  slotId,
  slotMark,
  slotName,
  switchBracket,
  treeSizeFor,
  clampCompetitorCount,
  maxCompetitors,
  sizePresets,
  undoLastOutcome,
  undoMatchOutcome,
  visibleRoundPrefixes,
  type BracketMatchId,
  type MatchSide,
  type RoundPrefix,
} from '../lib/tournamentStore';
import { type OutcomeCall } from '../lib/outcomes';

export function TournamentPage() {
  const tournament = useTournamentState();
  const library = useTournamentLibrary();
  const match = useMatchState();
  const theme = useBracketTheme();
  const fs = usePlayFullscreen();
  const boardRef = useRef<HTMLDivElement>(null);
  const bracketRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const parent = useToolboxParent();
  const proUnlocked = useProUnlocked();
  const sizeMax = maxCompetitors(proUnlocked);
  const fromSuite = searchParams.get('from') === 'suite';
  const exitPath = fromSuite ? '/suite' : parent.path;
  const [namesOpen, setNamesOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingSize, setPendingSize] = useState<number | null>(null);
  const [saveName, setSaveName] = useState('');
  const [customSize, setCustomSize] = useState(String(tournament.size));
  const seeds = seedSlots(tournament);
  const champion = slotName(tournament, 'champion');
  const liveMatchId = linkedBracketMatchId(match.bracketMatchId);
  const undoReady = canUndoLast(tournament);
  const emptyBracket = !bracketHasContent(tournament);
  const canReset = bracketHasContent(tournament);
  const tree = treeSizeFor(tournament.size);
  const rounds = visibleRoundPrefixes(tree).filter((prefix) => prefix !== 'final');
  const activeRow = library.saved.find((row) => row.id === library.activeId) ?? library.saved[0];
  const savedLabel = activeRow ? displayBracketName(activeRow) : 'Untitled';
  const named = savedLabel !== 'Untitled';

  useVisibleViewportHeight();
  useLockViewportZoom();
  usePinchZoom(boardRef, bracketRef);

  const exitBoard = () => {
    void fs.exit().finally(() => {
      navigate(exitPath);
    });
  };

  const applySize = (size: number) => {
    unlinkBracketBout();
    setCompetitorCount(size, sizeMax);
    setPendingSize(null);
    setSizeOpen(false);
  };

  const requestSize = (size: number) => {
    if (size === tournament.size) {
      setSizeOpen(false);
      return;
    }
    if (Object.keys(tournament.results).length) {
      setPendingSize(size);
      return;
    }
    applySize(size);
  };

  const openSaved = () => {
    setSaveName(activeRow?.name.trim() || tournament.title.trim() || '');
    setSavedOpen(true);
  };

  const saveCurrent = () => {
    renameActiveBracket(saveName);
    setSavedOpen(false);
  };

  const startNewBracket = () => {
    unlinkBracketBout();
    if (saveName.trim()) renameActiveBracket(saveName);
    newBracket(clampCompetitorCount(tournament.size, sizeMax));
    setSaveName('');
  };

  const loadSaved = (id: string) => {
    if (id === library.activeId) return;
    unlinkBracketBout();
    switchBracket(id);
    setSavedOpen(false);
  };

  return (
    <main
      className={`tournament${theme === 'bright' ? ' tournament--bright' : ''}${
        fs.className ? ` ${fs.className}` : ''
      }`}
    >
      <BeltRail kind="tournament" />
      <PlayExitMark to={exitPath} onExit={exitBoard} />
      <header className="tournament__bar">
        <div className="tournament__brand">
          <p className="tournament__eyebrow">{parent.eyebrow}</p>
          <h1>{tournamentToolLabel(proUnlocked)}</h1>
        </div>
        <div className="tournament__center">
          <p className="tournament__roundline">{bracketRoundLine(tournament)}</p>
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
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setCustomSize(String(tournament.size));
              setPendingSize(null);
              setSizeOpen(true);
            }}
          >
            Size {tournament.size}
          </button>
          <button type="button" className="btn btn--ghost tournament__save-btn" onClick={openSaved}>
            {named ? savedLabel : 'Save'}
          </button>
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
        flash the winner. <strong>Undo last result</strong> backs out a mistaken tap. Save a named
        bracket on this device, then switch without losing progress. Reset asks first so a demo
        cannot wipe the bracket by accident.
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

      <div className="tournament__board" ref={boardRef} onPointerDown={blurTextEntry}>
        <div className="bracket-viewport">
          <div
            className={`bracket bracket--tree-${tree}`}
            ref={bracketRef}
            role="group"
            aria-label={`${tournament.size}-competitor single-elimination bracket`}
          >
          {tree > 2 ? (
            <div className="bracket__side bracket__side--left">
              {rounds.map((prefix) => (
                <RoundColumn
                  key={`left-${prefix}`}
                  ids={leftRoundIds(prefix)}
                  label={roundLabel(`${prefix}-0` as BracketMatchId)}
                  liveMatchId={liveMatchId}
                />
              ))}
            </div>
          ) : null}

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

          {tree > 2 ? (
            <div className="bracket__side bracket__side--right">
              {([...rounds].reverse() as RoundPrefix[]).map((prefix) => (
                <RoundColumn
                  key={`right-${prefix}`}
                  ids={rightRoundIds(prefix)}
                  label={roundLabel(`${prefix}-0` as BracketMatchId)}
                  liveMatchId={liveMatchId}
                />
              ))}
            </div>
          ) : null}
          </div>
        </div>
      </div>

      <Sheet open={namesOpen} title="Competitor names" onClose={() => setNamesOpen(false)}>
        <p className="tournament__sheet-copy">
          {tournament.size} competitor{tournament.size === 1 ? '' : 's'}, one bracket
          {byeCountHint(tournament.size)}.
        </p>
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
        open={sizeOpen}
        title="Bracket size"
        onClose={() => {
          setSizeOpen(false);
          setPendingSize(null);
        }}
      >
        <p className="tournament__sheet-copy">
          Any count from 2 to {sizeMax}. Uneven fields use byes so nobody waits on a phantom pairing.
          {proUnlocked
            ? ' Pro boards save up to 64 competitors on this device.'
            : ' Mock Tournament stays at 16.'}
        </p>
        <div className="tournament__size-presets" role="group" aria-label="Size presets">
          {sizePresets(proUnlocked).map((preset) => (
            <button
              key={preset}
              type="button"
              className={`chip${tournament.size === preset ? ' chip--gold' : ''}`}
              onClick={() => requestSize(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
        <label className="tournament__custom-size">
          <span>{proUnlocked ? 'Custom 2–64' : 'Custom 3–15'}</span>
          <input
            type="number"
            min={2}
            max={sizeMax}
            inputMode="numeric"
            value={customSize}
            aria-label="Custom competitor count"
            onChange={(event) => setCustomSize(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const next = Number(customSize);
            if (!Number.isFinite(next) || next < 2 || next > sizeMax) return;
            requestSize(next);
          }}
        >
          Use custom size
        </button>
        {pendingSize != null ? (
          <div className="tournament__confirm">
            <span>
              Changing to {pendingSize} clears results and rebuilds byes. Keep names when they fit.
            </span>
            <button type="button" className="btn" onClick={() => applySize(pendingSize)}>
              Change size
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setPendingSize(null)}>
              Keep size
            </button>
          </div>
        ) : null}
      </Sheet>
      <Sheet open={savedOpen} title="Saved brackets" onClose={() => setSavedOpen(false)}>
        <p className="tournament__sheet-copy">
          Name this board (Gi Blue Belt, Kids, No-Gi) and keep several on this device. Switching
          leaves every saved bracket as you left it.
        </p>
        <label className="tournament__title">
          <span>Name</span>
          <input
            value={saveName}
            onChange={(event) => setSaveName(event.target.value)}
            placeholder="Gi Blue Belt"
            maxLength={80}
            aria-label="Saved bracket name"
          />
        </label>
        <div className="tournament__save-actions">
          <button type="button" className="btn" onClick={saveCurrent}>
            Save
          </button>
          <button type="button" className="btn btn--ghost" onClick={startNewBracket}>
            New bracket
          </button>
        </div>
        <ul className="tournament__saved">
          {library.saved.map((row) => {
            const active = row.id === library.activeId;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className={`tournament__saved-row${active ? ' is-active' : ''}`}
                  onClick={() => loadSaved(row.id)}
                >
                  <strong>{displayBracketName(row)}</strong>
                  <span>
                    {bracketRoundLine(row.board)}
                    {active ? ' · Open' : ''}
                  </span>
                </button>
                {library.saved.length > 1 ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      if (row.id === library.activeId) unlinkBracketBout();
                      deleteBracket(row.id);
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="tournament__cloud">
          {proUnlocked
            ? OWNER_BRACKET_CLOUD_NOTE
            : 'Coach saves stay on this phone. Nothing is uploaded.'}
        </p>
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
          This clears names and results on the open board. Other saved brackets stay put. Keep this
          one unless you mean to start over.
        </p>
      </Sheet>
    </main>
  );
}

function isTextEntry(el: HTMLElement): boolean {
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return !el.disabled;
  if (!(el instanceof HTMLInputElement) || el.disabled) return false;
  return inputTypeUsesKeyboard(el.type || 'text');
}

/** iOS keeps the keyboard up unless the focused field blurs. Taps on the mat do that. */
function blurTextEntry(event: ReactPointerEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !isTextEntry(active)) return;
  active.blur();
}

function byeCountHint(size: number): string {
  const tree = treeSizeFor(size);
  const byes = tree - size;
  if (!byes) return '';
  return `, plus ${byes} ${byes === 1 ? 'bye' : 'byes'}`;
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
  if (!ids.length) return null;
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
  const bye = matchHasBye(tournament, matchId);

  const openScore = () => {
    openBracketBout(matchId);
    navigate(scoreboardPath(matchId));
  };

  return (
    <article
      className={`t-match${matchId === 'final-0' ? ' t-match--final' : ''}${live ? ' t-match--live' : ''}${
        hasResult ? ' t-match--done' : ''
      }${bye ? ' t-match--bye' : ''}`}
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
        {bye ? (
          <p className="t-bye-note">Advances</p>
        ) : (
          <button
            type="button"
            className="t-score"
            onClick={openScore}
            aria-label={`Open ${roundLabel(matchId)} on scoreboard`}
          >
            Score
          </button>
        )}
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
  const bye = isByeSlot(tournament, id);
  const roster = useRosterState();
  const name = slotName(tournament, id);
  const gym = rosterGymForName(name, roster.students);
  const mark = slotMark(tournament.results[matchId], side);
  const seeds = seedSlots(tournament);
  const seedIndex = seeds.indexOf(id);
  const placeholder = seedIndex >= 0 ? seedPlaceholder(seedIndex) : 'Winner';
  const result = tournament.results[matchId];
  const winOn = result?.call === 'win' && result.winnerSide === side;
  const dqOn = result?.call === 'dq' && result.winnerSide !== side;
  const [sheet, setSheet] = useState<OutcomeCall | null>(null);
  const label = name.trim() || placeholder;
  const hideMarks = bye || matchHasBye(tournament, matchId);

  if (bye) {
    return (
      <div className="t-slot t-slot--bye">
        <span className="t-slot__bye">BYE</span>
      </div>
    );
  }

  return (
    <div
      className={`t-slot${mark === 'win' || mark === 'advanced' ? ' t-slot--won' : ''}${
        mark === 'dq' ? ' t-slot--dq' : ''
      }${mark === 'lost' ? ' t-slot--lost' : ''}${seedIndex >= 0 ? ' t-slot--seed' : ''}`}
    >
      <div className="t-slot__who">
        {seedIndex >= 0 ? <span className="t-slot__seed">{seedIndex + 1}.</span> : null}
        <div className="t-slot__name">
          <RosterNameField
            value={name}
            onChange={(value) => setSlotName(id, value)}
            onPrefill={(prefill) => setSlotName(id, prefill.name)}
            placeholder={placeholder}
            ariaLabel={`${roundLabel(matchId)}, ${side === 'a' ? 'top' : 'bottom'} competitor`}
            compact
          />
          {gym ? <span className="t-slot__gym">{gym}</span> : null}
        </div>
      </div>
      {hideMarks ? null : (
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
      )}
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
