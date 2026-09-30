import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { EmptyHint } from '../components/EmptyHint';
import { FullscreenChip } from '../components/FullscreenChip';
import { KidsBracketChrome } from '../components/KidsBracketChrome';
import { KidsScoreboardSwitcher } from '../components/KidsScoreboardSwitcher';
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
  useKidsScoreboard,
  useMatchState,
  useRosterState,
  useTournamentLibrary,
  useTournamentState,
} from '../hooks/useStores';
import { EMPTY_BRACKET_BODY, EMPTY_BRACKET_TITLE, OWNER_BRACKET_CLOUD_NOTE } from '../lib/coachCopy';
import { linkedBracketMatchId, openBracketBout, scoreboardPath, unlinkBracketBout } from '../lib/bracketBout';
import { setBracketTheme } from '../lib/bracketTheme';
import { kidsLiveLine, kidsWinState } from '../lib/kidsScoreboard';
import { rosterGymForName } from '../lib/rosterStore';
import { tournamentToolLabel } from '../lib/productNames';
import {
  bracketHasContent,
  bracketRoundLine,
  byeCountFor,
  canUndoLast,
  deleteBracket,
  displayBracketName,
  isByeSlot,
  isThreePersonBracket,
  leftRoundIds,
  placementLabel,
  placementOf,
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
  setPlacement,
  setSlotName,
  setTournamentTitle,
  slotId,
  slotMark,
  slotName,
  switchBracket,
  THREE_PERSON_LOSER_SLOT,
  treeSizeFor,
  clampCompetitorCount,
  maxCompetitors,
  sizePresets,
  undoLastOutcome,
  undoMatchOutcome,
  visibleRoundPrefixes,
  type BracketMatchId,
  type MatchSide,
  type PlacementStyle,
  type RoundPrefix,
} from '../lib/tournamentStore';
import { type OutcomeCall } from '../lib/outcomes';

export function TournamentPage() {
  const tournament = useTournamentState();
  const library = useTournamentLibrary();
  const match = useMatchState();
  const theme = useBracketTheme();
  const kids = useKidsScoreboard();
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
  const [pendingPlacement, setPendingPlacement] = useState<PlacementStyle | null>(null);
  const [saveName, setSaveName] = useState('');
  const [customSize, setCustomSize] = useState(String(tournament.size));
  const seeds = seedSlots(tournament);
  const champion = slotName(tournament, 'champion');
  const liveMatchId = linkedBracketMatchId(match.bracketMatchId);
  const kidsCelebration = kidsWinState(kids.enabled, tournament);
  const kidsWin = kidsCelebration.show;
  const kidsChampion = kidsCelebration.name;
  const kidsScore = kidsCelebration.scoreLine;
  const champLabel = kidsWin ? kidsChampion : champion;
  const kidsLive =
    kids.enabled && liveMatchId && !kidsWin && !tournament.results[liveMatchId]
      ? kidsLiveLine({
          title: tournament.title.trim() || match.division,
          blueName: match.blue.name,
          whiteName: match.white.name,
          bluePoints: match.blue.points,
          whitePoints: match.white.points,
        })
      : null;
  const undoReady = canUndoLast(tournament);
  const emptyBracket = !bracketHasContent(tournament);
  const canReset = bracketHasContent(tournament);
  const tree = treeSizeFor(tournament.size);
  const placement = placementOf(tournament);
  const threePerson = isThreePersonBracket(tournament);
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
    setPendingPlacement(null);
    if (Object.keys(tournament.results).length) {
      setPendingSize(size);
      return;
    }
    applySize(size);
  };

  const applyPlacementNow = (style: PlacementStyle) => {
    unlinkBracketBout();
    setPlacement(style);
    setPendingPlacement(null);
  };

  const requestPlacement = (style: PlacementStyle) => {
    if (style === placement) {
      setPendingPlacement(null);
      return;
    }
    setPendingSize(null);
    if (Object.keys(tournament.results).length) {
      setPendingPlacement(style);
      return;
    }
    applyPlacementNow(style);
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
      className={`tournament tournament--${theme}${kids.enabled ? ` tournament--kids tournament--kids-${kids.skin}` : ''}${fs.className ? ` ${fs.className}` : ''}`}
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
              setPendingPlacement(null);
              setSizeOpen(true);
            }}
          >
            {placement === 'lineup' ? `Lineup ${tournament.size}` : tournament.size}
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
        {kids.enabled ? (
          <>
            Kids' Scoreboards paints this bracket. Pick a background, then fullscreen for the gym TV.
            Grand Master Carlos comes in from the left only after a champion, with "Bom trabalho!"
          </>
        ) : (
          <>
            Tap <strong>Score</strong> to open the match board. <strong>Win</strong> or <strong>DQ</strong>{' '}
            flash the winner. <strong>Undo last result</strong> backs out a mistaken tap. Save a named
            bracket on this device, then switch without losing progress. Reset asks first so a demo
            cannot wipe the bracket by accident.
          </>
        )}
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
        {kids.enabled ? (
          <KidsBracketChrome
            skin={kids.skin}
            win={kidsWin}
            champion={kidsChampion}
            scoreLine={kidsScore}
            liveLine={kidsLive}
            liveMatch={kidsLive ? match : null}
          />
        ) : null}
        <div className="bracket-viewport">
          <div
            className={`bracket bracket--tree-${tree}${threePerson ? ' bracket--three' : ''}`}
            ref={bracketRef}
            role="group"
            aria-label={
              threePerson
                ? '3-competitor bracket, 2nd seed versus 3rd seed, loser faces 1st seed, winners meet in the final'
                : `${tournament.size}-competitor single-elimination bracket`
            }
          >
          {tree > 2 ? (
            <div className="bracket__side bracket__side--left">
              {rounds.map((prefix) => (
                <RoundColumn
                  key={`left-${prefix}`}
                  ids={leftRoundIds(prefix)}
                  label={sideRoundLabel(threePerson, prefix, 'left')}
                  detail={sideRoundDetail(threePerson, prefix, 'left')}
                  liveMatchId={liveMatchId}
                />
              ))}
            </div>
          ) : null}

          <div className="bracket__finals">
            <MatchCard matchId="final-0" liveMatchId={liveMatchId} />
            <div className={`bracket__champ${champLabel ? ' is-filled' : ''}${kidsWin ? ' is-kids-win' : ''}`}>
              <BeltRail kind="tournament" />
              <span>{kidsWin ? 'Winner' : 'Champion'}</span>
              {champLabel ? (
                <p
                  className="bracket__champ-flash"
                  role="status"
                  aria-label={kidsWin && kidsScore ? `${kidsChampion}, ${kidsScore}` : champLabel}
                >
                  {champLabel}
                  {kidsWin && kidsScore ? <strong className="kids-champ-score">{kidsScore}</strong> : null}
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
                  label={sideRoundLabel(threePerson, prefix, 'right')}
                  detail={sideRoundDetail(threePerson, prefix, 'right')}
                  liveMatchId={liveMatchId}
                />
              ))}
            </div>
          ) : null}
          </div>
        </div>
      </div>

      <div className="kids-switch-row">
        <KidsScoreboardSwitcher prefs={kids} />
      </div>

      <Sheet open={namesOpen} title="Competitor names" onClose={() => setNamesOpen(false)}>
        <p className="tournament__sheet-copy">
          {tournament.size} competitor{tournament.size === 1 ? '' : 's'}, one bracket
          {byeCountHint(tournament)}.
          {threePerson
            ? ' Semifinal is 2nd seed vs 3rd seed. The loser faces the 1st seed. Winners of those two matches meet in the final.'
            : ''}
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
          setPendingPlacement(null);
        }}
      >
        <p className="tournament__sheet-copy">
          Any count from 2 to {sizeMax}. Seeded is the default. A field of 3 plays 2nd vs 3rd, the
          loser faces the 1st seed, and those winners meet in the final. A field of 5 opens with 4th
          vs 5th, and 1st, 2nd, and 3rd receive byes. A field of 7 gives the bye to the 1st seed.
          Eight and up, and every other custom count, fill to the next power of two with those same
          seeded byes.
          {proUnlocked
            ? ' Pro boards save up to 64 competitors on this device.'
            : ' Mock Tournament stays at 16.'}
        </p>
        <p className="tournament__sheet-copy">Placement</p>
        <div className="tournament__size-presets" role="radiogroup" aria-label="Placement rules">
          <button
            type="button"
            role="radio"
            aria-checked={placement === 'ibjjf'}
            className={`chip${placement === 'ibjjf' ? ' chip--gold' : ''}`}
            onClick={() => requestPlacement('ibjjf')}
          >
            {placementLabel('ibjjf')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={placement === 'lineup'}
            className={`chip${placement === 'lineup' ? ' chip--gold' : ''}`}
            onClick={() => requestPlacement('lineup')}
          >
            Lineup
          </button>
        </div>
        <p className="tournament__sheet-copy">
          Lineup is the override. Names fill the bracket from the top, and byes sit on the last
          first-round cards.
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
              Changing to {pendingSize} clears results and rebuilds the draw. Keep names when they
              fit.
            </span>
            <button type="button" className="btn" onClick={() => applySize(pendingSize)}>
              Change size
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setPendingSize(null)}>
              Keep size
            </button>
          </div>
        ) : null}
        {pendingPlacement != null ? (
          <div className="tournament__confirm">
            <span>
              Switching to {placementLabel(pendingPlacement)} clears results and
              rebuilds the draw. Names stay in seed order.
            </span>
            <button type="button" className="btn" onClick={() => applyPlacementNow(pendingPlacement)}>
              Change placement
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setPendingPlacement(null)}>
              Keep placement
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

function byeCountHint(current: { size: number; placement?: string }): string {
  const byes = byeCountFor(current.size, placementOf(current));
  if (!byes) return '';
  return `, plus ${byes} ${byes === 1 ? 'bye' : 'byes'}`;
}

function sideRoundLabel(threePerson: boolean, prefix: RoundPrefix, side: 'left' | 'right'): string {
  if (threePerson && prefix === 'sf') {
    return side === 'left' ? 'Semifinal' : 'Consolation';
  }
  return roundLabel(`${prefix}-0` as BracketMatchId);
}

function sideRoundDetail(threePerson: boolean, prefix: RoundPrefix, side: 'left' | 'right'): string {
  if (!threePerson || prefix !== 'sf') return '';
  return side === 'left' ? '2nd seed vs 3rd seed' : 'Loser vs 1st seed';
}

function matchAriaLabel(threePerson: boolean, matchId: BracketMatchId): string {
  if (threePerson && matchId === 'sf-0') return 'Semifinal, 2nd seed vs 3rd seed';
  if (threePerson && matchId === 'sf-1') return 'Consolation, loser vs 1st seed';
  return roundLabel(matchId);
}

function RoundColumn({
  ids,
  label,
  detail,
  liveMatchId,
}: {
  ids: readonly BracketMatchId[];
  label: string;
  detail?: string;
  liveMatchId: BracketMatchId | null;
}) {
  if (!ids.length) return null;
  return (
    <div className={`bracket__round bracket__round--${ids.length}`}>
      <h2>{label}</h2>
      {detail ? <p className="bracket__path">{detail}</p> : null}
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
      aria-label={matchAriaLabel(isThreePersonBracket(tournament), matchId)}
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
  const placeholder =
    isThreePersonBracket(tournament) && id === THREE_PERSON_LOSER_SLOT
      ? 'Loser'
      : seedIndex >= 0
        ? seedPlaceholder(seedIndex)
        : 'Winner';
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
