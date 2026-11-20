/**
 * The student sheet's D8. Tapping a term opens the shared index card.
 * Tapping a blank tile, or an empty pyramid slot, starts a new card on that face.
 * Zoom, pause, reset, and the face menu stay the stage's own controls.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { D8Branch } from '../preview/crystallineSweeps/branches.ts';
import { branchState } from '../lib/d8TreeLinks.ts';
import { coachDoorOpen } from '../lib/productNames.ts';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useCurrentSeat } from '../components/SeatSessionBar';
import { useTreeEdges } from './treeLinks.ts';
import { activateTopoFace, TopoStage } from '../preview/crystallineSweeps/TopoStage.tsx';
import { LIVE_ZOOM_MAX } from '../preview/crystallineSweeps/labels.ts';
import { FACES } from '../preview/d8Subfactors/model.ts';
import { buildSubfactorTopo, faceGridSize, faceSlots, faceTileCap, showOnDiamond } from '../preview/d8Subfactors/topoModel.ts';
import {
  INDEX_FACE_IDS,
  faceScoreExact,
  hasFaceBaseline,
  unsortedCards,
  withCardEdit,
  withFaceBaseline,
  type FaceBaseline,
  type IndexFaceId,
  type LiveCard,
} from '../lib/indexCards.ts';
import { GLOSSARY_FACE_LABELS } from '../lib/glossary.ts';
import { additionsCsv, additionsForReview } from '../lib/glossaryAdditions.ts';
import { IndexTermLink } from './IndexTermLink.tsx';
import {
  catalogLines,
  commitIndexCards,
  getIndexCardFile,
  getOpenState,
  noteAddition,
  openTerm,
  startDraft,
  useAdditions,
  useIndexCardFile,
  useLiveCards,
} from './store.ts';
import './glossary.css';
import '../preview/crystallineSweeps/crystallineSweeps.css';
import '../preview/d8Subfactors/d8Subfactors.css';
import './liveD8.css';

/**
 * The face list only replaces the face readout past this zoom. It sits above the
 * live zoom ceiling, so a deeper zoom keeps the readout, as it has since the clamp landed.
 */
const LIVE_LIST_ZOOM = LIVE_ZOOM_MAX + 1;
export const D8_STAGE_HEIGHT_KEY = 'matboard.student.d8StageHeight.v1';
/** Branches on or off on the live D8, remembered on this device. Off until the student turns them on. */
export const D8_BRANCHES_KEY = 'matboard.student.d8Branches.v1';

function readFlag(key: string): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* private mode */
  }
}

const NO_BRANCHES: readonly D8Branch[] = [];
/** About 1.5× the old 420px stage. */
export const D8_STAGE_DEFAULT = 630;
export const D8_STAGE_MIN = 260;

export function d8StageMax(viewport?: number): number {
  const view = viewport ?? (typeof window === 'undefined' ? 900 : window.innerHeight);
  const safe = view >= 320 ? view : 900;
  return Math.max(D8_STAGE_MIN, Math.round(safe * 0.92));
}

export function clampD8StageHeight(value: number, viewport?: number): number {
  if (!Number.isFinite(value)) return Math.min(d8StageMax(viewport), D8_STAGE_DEFAULT);
  return Math.min(d8StageMax(viewport), Math.max(D8_STAGE_MIN, Math.round(value)));
}

export function readD8StageHeight(storage: Pick<Storage, 'getItem'>, viewport?: number): number {
  const raw = Number(storage.getItem(D8_STAGE_HEIGHT_KEY));
  if (!Number.isFinite(raw) || raw <= 0) return Math.min(d8StageMax(viewport), D8_STAGE_DEFAULT);
  return clampD8StageHeight(raw, viewport);
}

function writeD8StageHeight(height: number) {
  try {
    localStorage.setItem(D8_STAGE_HEIGHT_KEY, String(height));
  } catch {
    /* private mode */
  }
}

function faceScoreLine(cards: readonly LiveCard[], faceId: IndexFaceId): string {
  return `Face score ${faceScoreExact(cards, faceId).toFixed(1)} / 5`;
}

/** Unrated-line copy. With a check-in baseline, an unrated line takes that face's check-in score. */
export function unratedLineNote(baseline?: FaceBaseline | null): string {
  return hasFaceBaseline(baseline)
    ? 'A line you have not rated takes your check-in score for that face, or 3.'
    : 'A line you have not rated stays at 3.';
}

/** Index cards with the optional check-in baseline applied. Display only. */
function useShownCards(baseline?: FaceBaseline | null): LiveCard[] {
  return withFaceBaseline(useLiveCards(), baseline);
}

export function SheetD8Thumb({ onExpand, baseline }: { onExpand: () => void; baseline?: FaceBaseline | null }) {
  const cards = useShownCards(baseline);
  const model = useMesh(cards);
  return (
    <TopoStage
      chrome="bare"
      model={model}
      style="pyramid"
      focus={-1}
      selected={-1}
      comparison={false}
      pair={false}
      links={[]}
      drillPath={[]}
      relief={1}
      hue={1}
      onExpand={onExpand}
      onFocus={() => undefined}
      onSelect={() => undefined}
      onDrill={() => undefined}
    />
  );
}

export function LiveD8({ baseline }: { baseline?: FaceBaseline | null } = {}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cards = useShownCards(baseline);
  const model = useMesh(cards);
  const [focus, setFocus] = useState(-1);
  const [zoom, setZoom] = useState(1);
  const [holdDiamond, setHoldDiamond] = useState(false);
  const [zoomCommand, setZoomCommand] = useState<{ zoom: number; id: number } | null>(null);
  const [stageHeight, setStageHeight] = useState(() =>
    readD8StageHeight(typeof localStorage === 'undefined' ? { getItem: () => null } : localStorage),
  );
  const face = focus >= 0 ? FACES[focus] : null;
  const faceId = face && isLiveFace(face.id) ? face.id : null;
  const drilled = Boolean(faceId && zoom >= LIVE_LIST_ZOOM && !holdDiamond);
  const expanded = stageHeight >= d8StageMax() - 8;
  const { edges } = useTreeEdges(cards);
  const cardsKey = cards.map((card) => `${card.faceId}:${card.id}:${card.rating}:${card.tile}:${card.name}`).join('|');
  const state = useMemo(() => branchState(model, cards, edges), [model, cardsKey, edges]);
  const [showBranches, setShowBranches] = useState(() => readFlag(D8_BRANCHES_KEY));
  const [xrayOnly, setXrayOnly] = useState(false);
  const [chainPick, setChainPick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const chains = state.kind === 'ready' ? state.chains : [];
  const xrayMode = showBranches || xrayOnly;
  const picked = chains[chainPick] ?? chains[0] ?? null;
  const chain = playing && xrayMode && picked ? picked : null;
  const branches = showBranches && state.kind === 'ready' ? state.branches : NO_BRANCHES;
  const coachOpen = coachDoorOpen(useProUnlocked(), useCoachUnlocked(), useCurrentSeat() !== null);

  useEffect(() => {
    if (chainPick >= chains.length && chainPick !== 0) setChainPick(0);
    if (!chains.length && playing) setPlaying(false);
  }, [chains.length, chainPick, playing]);

  const toggleBranches = () => {
    setShowBranches((on) => {
      writeFlag(D8_BRANCHES_KEY, !on);
      if (on) setPlaying(false);
      return !on;
    });
  };

  const rememberHeight = (next: number) => {
    const height = clampD8StageHeight(next);
    setStageHeight(height);
    writeD8StageHeight(height);
  };

  const resizeFrom = (startY: number, startHeight: number) => (event: PointerEvent) => {
    rememberHeight(startHeight + (event.clientY - startY));
  };

  useEffect(() => {
    if (zoom < LIVE_LIST_ZOOM && holdDiamond) setHoldDiamond(false);
  }, [zoom, holdDiamond]);

  const goDiamond = () => {
    setHoldDiamond(true);
    setZoomCommand((command) => ({ zoom: 1, id: (command?.id ?? 0) + 1 }));
  };

  const collapseFace = () => {
    setFocus(-1);
    setHoldDiamond(false);
    setZoomCommand((command) => ({ zoom: 1, id: (command?.id ?? 0) + 1 }));
  };

  useEffect(() => {
    if (!faceId) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || getOpenState()) return;
      event.preventDefault();
      collapseFace();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [faceId]);

  return (
    <div
      ref={rootRef}
      className="d8-live d8sf"
      data-testid="live-d8"
      data-stage-height={stageHeight}
      style={{ ['--d8-stage-h' as string]: `${stageHeight}px` }}
    >
      <div className="d8-live-diamond">
      <TopoStage
        model={model}
        style="pyramid"
        focus={focus}
        selected={-1}
        comparison={false}
        pair={false}
        links={[]}
        drillPath={[]}
        relief={1}
        hue={1}
        fitZoom
        separateLabels
        legend="select"
        zoomCommand={zoomCommand}
        onZoom={setZoom}
        onEmptyTile={(tileIndex) => {
          const tile = model.tiles[tileIndex];
          if (tile && isLiveFace(tile.faceId)) startDraft(tile.faceId);
        }}
        onFocus={(index) => {
          if (index < 0 || index === focus) {
            collapseFace();
            return;
          }
          setFocus(index);
        }}
        onSelect={(index) => {
          const id = model.tiles[index]?.move?.id;
          if (id) openTerm(id);
        }}
        onDrill={() => undefined}
        branches={branches}
        xray={xrayMode}
        chain={chain}
        onChainStop={() => setPlaying(false)}
      />
      <button
        type="button"
        className="d8-live-grip"
        data-testid="d8-resize"
        aria-label="Resize diamond"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const startY = event.clientY;
          const startHeight = stageHeight;
          const move = resizeFrom(startY, startHeight);
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
      />
      </div>
      <div className="d8-live-tools">
        <button type="button" data-testid="d8-fit" onClick={() => rememberHeight(expanded ? D8_STAGE_DEFAULT : d8StageMax())}>
          {expanded ? 'Fit' : 'Expand'}
        </button>
        <button type="button" data-testid="d8-branches" aria-pressed={showBranches} onClick={toggleBranches}>
          {showBranches ? 'Branches on' : 'Branches'}
        </button>
        <button
          type="button"
          data-testid="d8-xray"
          aria-pressed={xrayMode}
          disabled={showBranches}
          title={showBranches ? 'X-ray stays on while branches show' : undefined}
          onClick={() => setXrayOnly((on) => !on)}
        >
          {xrayMode ? 'X-ray on' : 'X-ray'}
        </button>
        {xrayMode && chains.length ? (
          <button type="button" data-testid="d8-chain" aria-pressed={playing} onClick={() => setPlaying((on) => !on)}>
            {playing ? 'Stop chain' : 'Follow the chain'}
          </button>
        ) : null}
      </div>
      {xrayMode && chains.length ? (
        <label className="d8-live-chain-pick">
          <span className="d8sf-kicker">Chain</span>
          <select
            aria-label="Chain"
            data-testid="d8-chain-pick"
            value={String(Math.min(chainPick, chains.length - 1))}
            onChange={(event) => {
              setChainPick(Number(event.target.value));
              setPlaying(true);
            }}
          >
            {chains.map((row, index) => (
              <option key={row.id} value={String(index)}>
                {row.names.join(' → ')}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {showBranches && state.kind !== 'ready' ? (
        <div className="d8-live-branch-hint" data-testid="d8-branches-empty" role="status">
          <p>{state.hint}</p>
          <p className="gl-note">
            {coachOpen ? (
              <>
                <Link to="/technique-tree" data-testid="d8-open-tree">
                  Open Technique Tree
                </Link>
                {' or open a card and tap Add a connection.'}
              </>
            ) : (
              'Open any card on your D8 and tap Add a connection.'
            )}
          </p>
        </div>
      ) : null}
      {showBranches && state.kind === 'ready' ? (
        <p className="gl-note d8-live-branch-note" data-testid="d8-branches-note">
          {`${state.branches.length} ${state.branches.length === 1 ? 'branch' : 'branches'} from your Technique Tree and card connections. Tap a line to see which moves it joins.`}
        </p>
      ) : null}
      {drilled && faceId ? (
        <FaceList faceId={faceId} cards={cards} onBack={goDiamond} />
      ) : face && faceId ? (
        <FaceReadout faceId={faceId} label={face.label} cards={cards.filter((card) => card.faceId === faceId)} slots={faceSlots(model, focus)} unrated={unratedLineNote(baseline)} onCollapse={collapseFace} />
      ) : (
        <FaceScores
          cards={cards}
          unrated={unratedLineNote(baseline)}
          onPickFace={(id) => {
            if (rootRef.current) activateTopoFace(rootRef.current, id);
          }}
        />
      )}
    </div>
  );
}

function isLiveFace(id: string): id is IndexFaceId {
  return FACES.some((face) => face.id === id);
}

/**
 * Rows on each face, in FACES order, from how many cards that face has.
 * Up to 9 cards is 3×3, 10–16 is 4×4, 17–25 is 5×5, then the face keeps
 * subdividing (26–36 is 6×6, and so on). Every card is drawn as a triangle.
 */
export function d8FaceGrids(cards: readonly LiveCard[]): number[] {
  return FACES.map((face) => (isLiveFace(face.id) ? faceGridSize(cards.filter((card) => card.faceId === face.id).length) : faceGridSize(0)));
}

function useMesh(cards: readonly LiveCard[]) {
  const modelRef = useRef<ReturnType<typeof buildSubfactorTopo> | null>(null);
  const gridKey = useRef('');
  const grids = d8FaceGrids(cards);
  const nextGridKey = grids.join(',');
  // A face that crosses a square (9, 16, 25, 36, …) gets a finer split. The mesh is rebuilt only then.
  if (!modelRef.current || gridKey.current !== nextGridKey) {
    modelRef.current = buildSubfactorTopo(FACES, () => null, (faceIndex) => grids[faceIndex] ?? faceGridSize(0));
    gridKey.current = nextGridKey;
  }
  const model = modelRef.current;
  const meshKey = useRef('');
  const signature = `${nextGridKey}#${cards.map((card) => `${card.faceId}:${card.id}:${card.rating}:${card.tile}`).join('|')}`;
  if (meshKey.current !== signature) {
    meshKey.current = signature;
    FACES.forEach((face, index) => {
      if (!isLiveFace(face.id)) return;
      const mine = strongest(cards.filter((card) => card.faceId === face.id));
      showOnDiamond(
        model,
        index,
        mine.map((card) => ({ id: card.id, name: card.tile, rating: card.rating })),
      );
    });
  }
  return model;
}

function strongest(cards: readonly LiveCard[]): LiveCard[] {
  return [...cards]
    .sort((left, right) => right.rating - left.rating || right.addedAt - left.addedAt || left.name.localeCompare(right.name))
    .slice(0, faceTileCap(cards.length));
}

function FaceScores({
  cards,
  unrated,
  onPickFace,
}: {
  cards: readonly LiveCard[];
  unrated: string;
  onPickFace: (faceId: IndexFaceId) => void;
}) {
  return (
    <div className="crystal-readout">
      <section aria-label="Eight faces">
        <h2>Eight faces</h2>
        <p>Tap a face, or pick one from the menu. {`Each score is the average of every line. ${unrated}`}</p>
        <ul className="d8sf-face-scores">
          {FACES.map((face) => {
            if (!isLiveFace(face.id)) return null;
            const score = faceScoreExact(cards, face.id).toFixed(1);
            return (
              <li key={face.id}>
                <button type="button" onClick={() => onPickFace(face.id)}>
                  <span>{face.label}</span>
                  <span>{score} / 5</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" data-testid="add-any-move" onClick={() => startDraft(null)}>
          Add a move
        </button>
        <UnsortedMoves />
        <AdditionsReview />
      </section>
    </div>
  );
}

/** Old or imported moves with no face. They stay off the diamond, with no glossary tag, until placed. */
function UnsortedMoves() {
  const file = useIndexCardFile();
  const rows = unsortedCards(file);
  if (!rows.length) return null;
  return (
    <section className="gl-unsorted" data-testid="unsorted-moves" aria-label="Moves that need a face">
      <h3>Needs a face</h3>
      <p className="gl-note">These moves came in without a D8 face. Pick one to put each on your D8.</p>
      <ul>
        {rows.map((row) => (
          <li key={row.id} data-unsorted={row.id}>
            <span>{row.name}</span>
            <select
              aria-label={`Face for ${row.name}`}
              value=""
              onChange={(event) => {
                const faceId = event.target.value as IndexFaceId;
                const result = withCardEdit(catalogLines(), getIndexCardFile(), row.id, { name: row.name, faceId });
                if ('error' in result) return;
                commitIndexCards(result.file);
                noteAddition({ name: row.name, faceId });
              }}
            >
              <option value="" disabled>
                Pick a face
              </option>
              {INDEX_FACE_IDS.map((id) => (
                <option key={id} value={id}>
                  {GLOSSARY_FACE_LABELS[id]}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
}

const KIND_LABEL = { new: 'New move', renamed: 'Your name', recategorized: 'Your face' } as const;

/** The student's additions pool, for a later glossary review. The core glossary is not changed here. */
function AdditionsReview() {
  const pool = useAdditions();
  const rows = additionsForReview(pool);
  if (!rows.length) return null;
  const download = () => {
    const csv = additionsCsv(pool, (id) => GLOSSARY_FACE_LABELS[id]);
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'advantage-glossary-additions.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <details className="gl-additions" data-testid="glossary-additions">
      <summary>{`Your additions (${rows.length})`}</summary>
      <p className="gl-note">Moves you added, renamed, or moved. They stay yours and are kept for the glossary review.</p>
      <ul>
        {rows.map((row) => (
          <li key={row.id} data-addition={row.id}>
            <span>{row.name}</span>
            <span className="gl-note">
              {`${KIND_LABEL[row.kind]} · ${GLOSSARY_FACE_LABELS[row.faceId]}${row.glossaryTerm && row.glossaryTerm !== row.name ? ` · was ${row.glossaryTerm}` : ''}${row.count > 1 ? ` · ×${row.count}` : ''}`}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" data-testid="additions-csv" onClick={download}>
        Download CSV
      </button>
    </details>
  );
}

function FaceReadout({
  faceId,
  label,
  cards,
  slots,
  unrated,
  onCollapse,
}: {
  faceId: IndexFaceId;
  label: string;
  cards: readonly LiveCard[];
  slots: ReturnType<typeof faceSlots>;
  unrated: string;
  onCollapse: () => void;
}) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return (
    <div className="crystal-readout" data-testid="face-readout">
      <section aria-label={`${label} sub-factors`}>
        <div className="d8-live-face-head">
          <h2>
            <button type="button" className="d8-live-face-title" data-testid="face-heading" aria-expanded="true" onClick={onCollapse}>
              {label}
            </button>
          </h2>
          <button type="button" data-testid="face-close" onClick={onCollapse}>
            Close
          </button>
        </div>
        <p data-testid="face-score" aria-live="polite">
          {faceScoreLine(cards, faceId)}
        </p>
        <p>{`Average of every line on this face. ${unrated}`}</p>
        <FacePyramid label={label} slots={slots} byId={byId} />
        <CardList faceId={faceId} cards={cards} />
      </section>
    </div>
  );
}

function FacePyramid({
  label,
  slots,
  byId,
}: {
  label: string;
  slots: ReturnType<typeof faceSlots>;
  byId: ReadonlyMap<string, LiveCard>;
}) {
  const grid = slots[0]?.grid ?? 3;
  const slotNode = (slot: (typeof slots)[number], style?: { left: string; top: string }) => {
    const card = slot.moveId ? byId.get(slot.moveId) : null;
    return (
      <div key={slot.tileIndex} className="d8sf-slot" data-slot={slot.tileIndex} style={style}>
        {card ? (
          <IndexTermLink name={card.name} className="d8sf-term" />
        ) : (
          <span className="d8sf-empty d8sf-empty--blank" data-empty-slot={slot.tileIndex} />
        )}
      </div>
    );
  };
  if (grid <= 3) {
    return (
      <div className="d8sf-pyramid" data-testid="face-pyramid" data-grid={grid} role="group" aria-label={`${label} slots`}>
        {slots.map((slot) => slotNode(slot, { left: `${slot.x}%`, top: `${slot.y}%` }))}
      </div>
    );
  }
  // 4×4 and finer: one centered row per mesh row so names wrap instead of piling up.
  const rows = Array.from({ length: grid }, (_, row) =>
    slots.filter((slot) => slot.row === row).sort((left, right) => left.x - right.x || left.tileIndex - right.tileIndex),
  );
  return (
    <div
      className="d8sf-pyramid d8-live-pyramid-rows"
      data-testid="face-pyramid"
      data-grid={grid}
      role="group"
      aria-label={`${label} slots`}
    >
      {rows.map((row, index) => (
        <div key={index} className="d8-live-pyramid-row" data-row={index}>
          {row.map((slot) => slotNode(slot))}
        </div>
      ))}
    </div>
  );
}

function FaceList({ faceId, cards, onBack }: { faceId: IndexFaceId; cards: readonly LiveCard[]; onBack: () => void }) {
  const face = FACES.find((item) => item.id === faceId);
  return (
    <div className="crystal-readout" data-testid="drill-view">
      <button type="button" data-testid="drill-back" onClick={onBack}>
        Back
      </button>
      <p data-testid="face-score">{faceScoreLine(cards, faceId)}</p>
      <CardList faceId={faceId} cards={cards.filter((card) => card.faceId === faceId)} heading={face?.label ?? faceId} />
    </div>
  );
}

function CardList({ faceId, cards, heading }: { faceId: IndexFaceId; cards: readonly LiveCard[]; heading?: string }) {
  const rows = cards.filter((card) => card.faceId === faceId);
  const label = heading ?? FACES.find((face) => face.id === faceId)?.label ?? faceId;
  return (
    <section data-testid="face-card-list" aria-label={`${label} cards`}>
      {heading ? <h2>{heading}</h2> : null}
      <ul className="d8sf-card-list">
        {rows.map((card) => (
          <li key={card.id} data-list-card={card.id}>
            <IndexTermLink name={card.name} className="d8sf-term" />
            <span>{card.rating} / 5</span>
          </li>
        ))}
      </ul>
      <button type="button" data-add-card={faceId} onClick={() => startDraft(faceId)}>
        Add
      </button>
    </section>
  );
}
