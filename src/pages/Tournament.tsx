import { useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { EmptyHint } from '../components/EmptyHint';
import { FullscreenChip } from '../components/FullscreenChip';
import { KidsBracketChrome, KidsMascotDock } from '../components/KidsBracketChrome';
import { KidsScoreboardSwitcher } from '../components/KidsScoreboardSwitcher';
import { PlayExitMark } from '../components/PlayExitMark';
import { OutcomePickSheet } from '../components/OutcomeCalls';
import { Sheet } from '../components/Sheet';
import { useLockViewportZoom, usePinchZoom } from '../hooks/usePinchZoom';
import { inputTypeUsesKeyboard } from '../lib/keepFieldVisible';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
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
import { DEFAULT_BRACKET_THEME, setBracketTheme } from '../lib/bracketTheme';
import {
  KIDS_BRACKETS_SKINS_LABEL,
  kidsBracketChromeOn,
  kidsBracketScoring,
  kidsLiveLine,
  kidsShowMascot,
  kidsSkinChromeHidden,
  kidsWinLines,
  kidsWinState,
  withKidsSkin,
} from '../lib/kidsScoreboard';
import { isSheetLayerOpen, subscribeSheetLayer } from '../lib/sheetLayer';
import { competitorCards, rosterGymForName, studentRosterCards } from '../lib/rosterStore';
import {
  isBasicCoach,
  isPlainCoachTournament,
  MOCK_TOURNAMENT_NAME,
  SUITE_FROM,
  tournamentToolLabel,
} from '../lib/productNames';
import { coachLinkedWhiteBoard, withMatchOrigin } from '../lib/scoreboardSkin';
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
  fillSeedNames,
  newBracket,
  parseNameList,
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
  const plainCoach = isPlainCoachTournament(
    searchParams.get('from'),
    isBasicCoach(proUnlocked, useCoachUnlocked()),
  );
  const sizeMax = maxCompetitors(proUnlocked);
  const fromSuite = searchParams.get('from') === SUITE_FROM;
  const shownTheme = plainCoach ? DEFAULT_BRACKET_THEME : theme;
  const exitPath = fromSuite ? '/suite' : plainCoach ? '/coach' : parent.path;
  const kidsOn = kidsBracketChromeOn(fromSuite, kids.enabled);
  const [namesOpen, setNamesOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingPlacement, setPendingPlacement] = useState<PlacementStyle | null>(null);
  const [pasteDraft, setPasteDraft] = useState('');
  const [saveName, setSaveName] = useState('');
  const [customSize, setCustomSize] = useState(String(tournament.size));
  const seeds = seedSlots(tournament);
  const champion = slotName(tournament, 'champion');
  const liveMatchId = linkedBracketMatchId(match.bracketMatchId);
  const kidsCelebration = kidsWinState(kidsOn, tournament);
  const kidsWin = kidsCelebration.show;
  const kidsChampion = kidsCelebration.name;
  const kidsScore = kidsCelebration.scoreLine;
  const sheetOpen = useSyncExternalStore(subscribeSheetLayer, isSheetLayerOpen, () => false);
  const skinChromeHidden = kidsSkinChromeHidden({
    fullscreen: fs.active,
    sheetOpen,
    scoring: kidsBracketScoring(liveMatchId, liveMatchId ? Boolean(tournament.results[liveMatchId]) : true),
  });
  const showMascot = kidsShowMascot(kidsOn, kids.mascot, kidsChampion, skinChromeHidden);
  const champLabel = kidsWin ? kidsChampion : champion;
  const kidsLive =
    kidsOn && liveMatchId && !kidsWin && !tournament.results[liveMatchId]
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
    setSizeOpen(false);
  };

  const requestSize = (size: number) => {
    if (size === tournament.size) {
      setSizeOpen(false);
      return;
    }
    setPendingPlacement(null);
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
      className={`tournament tournament--${shownTheme}${kidsOn ? ` tournament--kids tournament--kids-${kids.skin}` : ''}${fs.className ? ` ${fs.className}` : ''}`}
    >
      <BeltRail kind="tournament" />
      <PlayExitMark to={exitPath} onExit={exitBoard} />
      <header className="tournament__bar">
        <div className="tournament__brand">
          <p className="tournament__eyebrow">{plainCoach ? 'Advantage Coach' : parent.eyebrow}</p>
          <h1>{plainCoach ? MOCK_TOURNAMENT_NAME : tournamentToolLabel(proUnlocked)}</h1>
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
          {fromSuite ? <KidsScoreboardSwitcher prefs={kids} suppressed={skinChromeHidden} /> : null}
          {plainCoach ? null : (
            <div className="tournament__theme" role="radiogroup" aria-label="Bracket theme">
              <button
                type="button"
                role="radio"
                aria-checked={theme === 'bright'}
                className={`chip${theme === 'bright' ? ' chip--on' : ''}`}
                onClick={() => setBracketTheme('bright')}
              >
                Bright
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={theme === 'dark'}
                className={`chip${theme === 'dark' ? ' chip--on' : ''}`}
                onClick={() => setBracketTheme('dark')}
              >
                Dark
              </button>
            </div>
          )}
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setCustomSize(String(tournament.size));
              setPendingPlacement(null);
              setSizeOpen(true);
            }}
          >
            {placement === 'lineup' ? `Lineup ${tournament.size}` : tournament.size}
          </button>
          <button type="button" className="btn btn--ghost tournament__save-btn" onClick={openSaved}>
            {named ? savedLabel : 'Save'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setPasteDraft('');
              setNamesOpen(true);
            }}
          >
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
        {kidsOn ? (
          <>
            {KIDS_BRACKETS_SKINS_LABEL} paints this bracket. Skin in the toolbar opens the backgrounds.
            Grand Master Carlos stays in the corner after a champion, with "Bom trabalho!" Turn him off from Skin.
          </>
        ) : (
          <>
            Tap <strong>Score</strong> to open the match board. <strong>Win</strong> or <strong>DQ</strong>{' '}
            flash the winner. <strong>Undo last result</strong> backs out a mistaken tap and clears later
            rounds that came from it. Save a named bracket on this device, then switch without losing
            progress. Reset asks first so a demo cannot wipe the bracket by accident.
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
        {kidsOn ? (
          <KidsBracketChrome
            skin={kids.skin}
            win={kidsWin}
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
                  paired={kidsOn}
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
              <input
                value={champion}
                onChange={(event) => setSlotName('champion', event.target.value)}
                placeholder="Winner"
                aria-label="Champion"
                autoComplete="off"
                autoCapitalize="words"
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
                  paired={kidsOn}
                />
              ))}
            </div>
          ) : null}
          </div>
        </div>
      </div>

      {showMascot ? <KidsMascotDock lines={kidsWinLines(kidsChampion, kidsScore)} /> : null}

      <Sheet
        open={namesOpen}
        title={plainCoach ? 'Student names' : 'Competitor names'}
        onClose={() => setNamesOpen(false)}
      >
        <p className="tournament__sheet-copy">
          {tournament.size} {plainCoach ? 'student' : 'competitor'}
          {tournament.size === 1 ? '' : 's'}, one bracket
          {byeCountHint(tournament)}.
          {threePerson
            ? ' Semifinal is 2nd seed vs 3rd seed. The loser faces the 1st seed. Winners of those two matches meet in the final.'
            : ''}
        </p>
        <label className="tournament__paste">
          <span>Paste a list</span>
          <textarea
            value={pasteDraft}
            rows={4}
            placeholder="One name per line, or commas: Ana, Ben, Cam"
            aria-label={plainCoach ? 'Paste student names' : 'Paste competitor names'}
            onChange={(event) => setPasteDraft(event.target.value)}
            onPaste={(event) => {
              const names = parseNameList(event.clipboardData.getData('text'));
              if (names.length < 2) return;
              event.preventDefault();
              setPasteDraft(event.clipboardData.getData('text'));
              fillSeedNames(names, 0);
            }}
          />
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const names = parseNameList(pasteDraft);
            if (!names.length) return;
            fillSeedNames(names, 0);
          }}
        >
          Fill bracket
        </button>
        <ol className="tournament__seeds">
          {seeds.map((id, index) => (
            <li key={id}>
              <label>
                <span>{index + 1}</span>
                <SeedNameInput
                  value={slotName(tournament, id)}
                  onChange={(value) => setSlotName(id, value)}
                  placeholder={plainCoach ? 'Student name' : seedPlaceholder(index)}
                  ariaLabel={plainCoach ? `Student name ${index + 1}` : `Competitor ${index + 1}`}
                  seedIndex={index}
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
          setPendingPlacement(null);
        }}
      >
        <p className="tournament__sheet-copy">
          Any count from 2 to {sizeMax}. Seeded is the default. A field of 3 plays 2nd vs 3rd, the
          loser faces the 1st seed, and those winners meet in the final. A field of 5 opens with 4th
          vs 5th, and 1st, 2nd, and 3rd receive byes. A field of 7 gives the bye to the 1st seed.
          Eight and up, and every other custom count, fill to the next power of two with those same
          seeded byes. Tap a size to apply it. Names that fit stay. Results on this board clear.
          {proUnlocked && !plainCoach
            ? ' Pro boards save up to 64 competitors on this device.'
            : ' Mock Tournament stays at 16.'}
        </p>
        <p className="tournament__sheet-copy">Placement</p>
        <div className="tournament__size-presets" role="radiogroup" aria-label="Placement rules">
          <button
            type="button"
            role="radio"
            aria-checked={placement === 'ibjjf'}
            className={`chip${placement === 'ibjjf' ? ' chip--on' : ''}`}
            onClick={() => requestPlacement('ibjjf')}
          >
            {placementLabel('ibjjf')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={placement === 'lineup'}
            className={`chip${placement === 'lineup' ? ' chip--on' : ''}`}
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
              className={`chip${tournament.size === preset ? ' chip--on' : ''}`}
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
  paired,
}: {
  ids: readonly BracketMatchId[];
  label: string;
  detail?: string;
  liveMatchId: BracketMatchId | null;
  paired: boolean;
}) {
  if (!ids.length) return null;
  const pairs = paired && ids.length >= 2 ? pairMatchIds(ids) : null;
  return (
    <div className={`bracket__round bracket__round--${ids.length}`}>
      <h2>{label}</h2>
      {detail ? <p className="bracket__path">{detail}</p> : null}
      <div className="bracket__matches">
        {pairs
          ? pairs.map((pair) => (
              <div key={pair[0]} className="bracket__pair">
                {pair.map((id) => (
                  <MatchCard key={id} matchId={id} liveMatchId={liveMatchId} />
                ))}
              </div>
            ))
          : ids.map((id) => <MatchCard key={id} matchId={id} liveMatchId={liveMatchId} />)}
      </div>
    </div>
  );
}

/** Two matches feed one card in the next round. A last odd card stays in its own pair. */
function pairMatchIds(ids: readonly BracketMatchId[]): BracketMatchId[][] {
  const pairs: BracketMatchId[][] = [];
  for (let index = 0; index < ids.length; index += 2) {
    pairs.push(ids.slice(index, index + 2));
  }
  return pairs;
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
  const [searchParams] = useSearchParams();
  const fromSuite = searchParams.get('from') === SUITE_FROM;
  const plainCoach = usePlainCoachBoard();
  const kids = useKidsScoreboard();
  const kidsOn = kidsBracketChromeOn(fromSuite, kids.enabled);
  const hasResult = Boolean(tournament.results[matchId]);
  const live = liveMatchId === matchId;
  const bye = matchHasBye(tournament, matchId);

  const openScore = () => {
    openBracketBout(matchId);
    navigate(
      withKidsSkin(
        withMatchOrigin(scoreboardPath(matchId), {
          fromSuite,
          whiteBoard: coachLinkedWhiteBoard(fromSuite, true, plainCoach, false),
        }),
        kidsOn ? kids.skin : null,
      ),
    );
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

function SeedNameInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  seedIndex,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  seedIndex: number;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoComplete="off"
      autoCapitalize="words"
      enterKeyHint="next"
      onChange={(event) => onChange(event.target.value)}
      onPaste={(event) => {
        if (seedIndex < 0) return;
        const names = parseNameList(event.clipboardData.getData('text'));
        if (names.length < 2) return;
        event.preventDefault();
        fillSeedNames(names, seedIndex);
      }}
    />
  );
}

function usePlainCoachBoard(): boolean {
  const [searchParams] = useSearchParams();
  return isPlainCoachTournament(searchParams.get('from'), isBasicCoach(useProUnlocked(), useCoachUnlocked()));
}

function SlotRow({ matchId, side }: { matchId: BracketMatchId; side: MatchSide }) {
  const tournament = useTournamentState();
  const plainCoach = usePlainCoachBoard();
  const id = slotId(matchId, side);
  const bye = isByeSlot(tournament, id);
  const roster = useRosterState();
  const name = slotName(tournament, id);
  const gym = rosterGymForName(
    name,
    plainCoach ? studentRosterCards(roster.students) : competitorCards(roster.students),
  );
  const mark = slotMark(tournament.results[matchId], side);
  const seeds = seedSlots(tournament);
  const seedIndex = seeds.indexOf(id);
  const placeholder =
    isThreePersonBracket(tournament) && id === THREE_PERSON_LOSER_SLOT
      ? 'Loser'
      : seedIndex >= 0
        ? plainCoach
          ? 'Student name'
          : seedPlaceholder(seedIndex)
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
          <SeedNameInput
            value={name}
            onChange={(value) => setSlotName(id, value)}
            placeholder={placeholder}
            ariaLabel={
              plainCoach
                ? `${roundLabel(matchId)}, ${side === 'a' ? 'top' : 'bottom'} student${
                    seedIndex >= 0 ? ` ${seedIndex + 1}` : ''
                  }`
                : `${roundLabel(matchId)}, ${side === 'a' ? 'top' : 'bottom'} competitor`
            }
            seedIndex={seedIndex}
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
        portal
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
