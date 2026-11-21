/**
 * Live instructor D12. Same stage, auto-turn, drag, pinch/wheel zoom, and
 * chrome as LiveD8 / TopoStage, with the twelve-faced dodecahedron instead of
 * the student octahedron. Instructors can add and rate cards on a face.
 * Face scores roll up from those cards. The daily check-in is not written here.
 *
 * Path to Mastery connections between cards and faces show as branches
 * through the inside of the D12, with X-ray and Follow the chain, the same
 * controls the student D8 uses for its Technique Tree.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { activateTopoFace, TopoStage } from '../preview/crystallineSweeps/TopoStage';
import type { D8Branch } from '../preview/crystallineSweeps/branches';
import {
  applyD12ShapeMetric,
  buildD12Topo,
  d12FaceGridSize,
  d12FaceSlots,
  showOnD12Face,
} from '../lib/instructorD12Topo';
import { INSTRUCTOR_D12_FACES, type InstructorD12Scores } from '../lib/instructorD12';
import {
  D12_DEFAULT_SHAPE_METRIC,
  D12_SHAPE_METRICS,
  d12CardFaceScoreExact,
  d12CardFaceScoreLine,
  d12CardsInPlaceOrder,
  d12CardsOnFace,
  loadInstructorD12Cards,
  saveInstructorD12Cards,
  shownD12CardRating,
  type D12ShapeMetric,
  type InstructorD12Card,
} from '../lib/instructorD12Cards';
import {
  PATH_TO_MASTERY,
  cleanD12Links,
  d12ChainForCard,
  d12MasteryState,
  loadInstructorD12Links,
  saveInstructorD12Links,
  type D12Link,
} from '../lib/instructorD12Mastery';
import { instructorFaceDefinition } from '../lib/instructorGlossary';
import { formatJournalDate } from '../lib/journalCopy';
import {
  EMPTY_INSTRUCTOR_JOURNAL,
  instructorJournalMentionsForFace,
  loadInstructorGoals,
  loadInstructorJournal,
  subscribeInstructorJournal,
  type InstructorGoal,
  type InstructorJournalEntry,
} from '../lib/instructorJournal';
import { D12CardSheet, type D12SheetOpen } from './D12CardSheet';
import type { InstructorD12FaceId } from '../lib/instructorD12';
import '../preview/crystallineSweeps/crystallineSweeps.css';
import '../preview/d8Subfactors/d8Subfactors.css';
import './liveD12.css';

const NO_BRANCHES: readonly D8Branch[] = [];

type Props = {
  scores?: InstructorD12Scores | null;
  /** Cards to show instead of the saved file. Read-only unless `sandbox` is set. */
  cards?: InstructorD12Card[];
  /** Path to Mastery connections to show instead of the saved file. */
  links?: readonly D12Link[];
  /** Journal entries to read for Your journal mentions instead of the saved file. */
  journalEntries?: readonly InstructorJournalEntry[];
  /** Teaching goals to read for Your journal mentions instead of the saved file. */
  goals?: readonly InstructorGoal[];
  seatKey?: string;
  readOnly?: boolean;
  /** Preview mode: cards and links can be changed on the page, but nothing is saved anywhere. */
  sandbox?: boolean;
};

export function LiveD12({
  scores = null,
  cards: cardsProp,
  links: linksProp,
  journalEntries: journalProp,
  goals: goalsProp,
  seatKey = 'owner',
  readOnly = false,
  sandbox = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const writable = !readOnly && (cardsProp == null || sandbox);
  const persist = writable && !sandbox && cardsProp == null;
  const [stored, setStored] = useState<InstructorD12Card[]>(() =>
    cardsProp != null ? cardsProp.map((card) => ({ ...card })) : loadInstructorD12Cards(localStorage, seatKey),
  );
  const [storedLinks, setStoredLinks] = useState<D12Link[]>(() =>
    linksProp != null ? cleanD12Links(linksProp) : cardsProp != null || readOnly ? [] : loadInstructorD12Links(localStorage, seatKey),
  );
  const [liveJournal, setLiveJournal] = useState<InstructorJournalEntry[]>(() =>
    journalProp != null || sandbox || readOnly ? [] : loadInstructorJournal(localStorage, seatKey),
  );
  const [liveGoals, setLiveGoals] = useState<InstructorGoal[]>(() =>
    goalsProp != null || sandbox || readOnly ? [] : loadInstructorGoals(localStorage, seatKey),
  );
  useEffect(() => {
    if (journalProp != null || sandbox || readOnly) return;
    const reload = () => {
      setLiveJournal(loadInstructorJournal(localStorage, seatKey));
      setLiveGoals(loadInstructorGoals(localStorage, seatKey));
    };
    reload();
    return subscribeInstructorJournal(reload);
  }, [journalProp, sandbox, readOnly, seatKey]);
  const cards = cardsProp != null && !sandbox ? cardsProp : stored;
  const links = storedLinks;
  const journalEntries = journalProp ?? liveJournal;
  const goals = goalsProp ?? liveGoals;
  const [focus, setFocus] = useState(-1);
  const [open, setOpen] = useState<D12SheetOpen | null>(null);
  const [metric, setMetric] = useState<D12ShapeMetric>(D12_DEFAULT_SHAPE_METRIC);
  const [showBranches, setShowBranches] = useState(false);
  const [xrayOnly, setXrayOnly] = useState(false);
  const [chainPick, setChainPick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pathNote, setPathNote] = useState('');

  const commitCards = (next: InstructorD12Card[]) => {
    if (!writable) return;
    setStored(persist ? saveInstructorD12Cards(next, localStorage, seatKey) : next.map((card) => ({ ...card })));
  };

  const commitLinks = (next: D12Link[]) => {
    if (!writable) return;
    setStoredLinks(persist ? saveInstructorD12Links(next, localStorage, seatKey) : cleanD12Links(next));
  };

  const model = useMesh(cards, scores, metric);
  const cardsKey = cards.map((card) => `${card.faceId}:${card.id}:${card.name}`).join('|');
  const linksKey = links.map((link) => `${link.from}>${link.to}>${link.relation}`).join('|');
  const mastery = useMemo(() => d12MasteryState(model, cards, links), [model, cardsKey, linksKey]);
  const chains = mastery.kind === 'ready' ? mastery.chains : [];
  const xrayMode = showBranches || xrayOnly;
  const picked = chains[chainPick] ?? chains[0] ?? null;
  const chain = playing && xrayMode && picked ? picked : null;
  const branches = showBranches && mastery.kind === 'ready' ? mastery.branches : NO_BRANCHES;
  const face = focus >= 0 ? INSTRUCTOR_D12_FACES[focus] : null;
  const faceId = face?.id ?? null;

  useEffect(() => {
    if (chainPick >= chains.length && chainPick !== 0) setChainPick(0);
    if (!chains.length && playing) setPlaying(false);
  }, [chains.length, chainPick, playing]);

  const collapseFace = () => setFocus(-1);

  const toggleBranches = () => {
    setShowBranches((on) => {
      if (on) setPlaying(false);
      return !on;
    });
    setPathNote('');
  };

  /** From a card: turn on branches and X-ray, then play the chain that runs through it. */
  const viewOnPath = (cardId: string) => {
    const card = cards.find((item) => item.id === cardId);
    setOpen(null);
    setShowBranches(true);
    const hit = d12ChainForCard(model, cardId, chains);
    if (hit) {
      setChainPick(hit.index);
      setPlaying(true);
      setPathNote(`Following ${hit.chain.names.join(' → ')}.`);
    } else {
      setPlaying(false);
      setPathNote(
        card
          ? `No Connects to chain runs through ${card.name} yet. Add a Connects to or Builds on connection on its card.`
          : '',
      );
    }
    rootRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  };

  return (
    <div
      ref={rootRef}
      className="ip-d12-live"
      data-testid="instructor-d12-visual"
      data-metric={metric}
      data-xray={xrayMode ? 'on' : 'off'}
      data-branches={showBranches ? 'on' : 'off'}
      data-chain={chain ? chain.id : ''}
    >
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
        chrome="full"
        spin
        fitZoom
        separateLabels
        legend="select"
        onFocus={(index) => {
          if (index < 0 || index === focus) {
            collapseFace();
            return;
          }
          setFocus(index);
        }}
        onSelect={(index) => {
          const id = model.tiles[index]?.move?.id;
          if (id) setOpen({ kind: 'card', id });
        }}
        onEmptyTile={(tileIndex) => {
          if (!writable) return;
          const tile = model.tiles[tileIndex];
          const id = tile?.faceId as string | undefined;
          if (id && INSTRUCTOR_D12_FACES.some((item) => item.id === id)) {
            setOpen({ kind: 'draft', faceId: id as InstructorD12FaceId });
          }
        }}
        onDrill={() => undefined}
        branches={branches}
        xray={xrayMode}
        chain={chain}
        onChainStop={() => setPlaying(false)}
      />
      <div className="d12-live-tools" role="group" aria-label="Shape metric" data-testid="d12-shape-metric">
        {D12_SHAPE_METRICS.map((choice) => (
          <button
            key={choice.id}
            type="button"
            aria-pressed={metric === choice.id}
            data-testid={`d12-metric-${choice.id}`}
            onClick={() => setMetric(choice.id)}
          >
            {choice.label}
          </button>
        ))}
      </div>
      <div className="d12-live-tools d12-live-path-tools" role="group" aria-label={PATH_TO_MASTERY} data-testid="d12-path-tools">
        <span className="d8sf-kicker d12-live-path-kicker">{PATH_TO_MASTERY}</span>
        <button type="button" data-testid="d12-branches" aria-pressed={showBranches} onClick={toggleBranches}>
          {showBranches ? 'Branches on' : 'Branches'}
        </button>
        <button
          type="button"
          data-testid="d12-xray"
          aria-pressed={xrayMode}
          disabled={showBranches}
          title={showBranches ? 'X-ray stays on while branches show' : undefined}
          onClick={() => setXrayOnly((on) => !on)}
        >
          {xrayMode ? 'X-ray on' : 'X-ray'}
        </button>
        {xrayMode && chains.length ? (
          <button type="button" data-testid="d12-chain" aria-pressed={playing} onClick={() => setPlaying((on) => !on)}>
            {playing ? 'Stop chain' : 'Follow the chain'}
          </button>
        ) : null}
      </div>
      {xrayMode && chains.length ? (
        <label className="d12-live-chain-pick">
          <span className="d8sf-kicker">Chain</span>
          <select
            aria-label="Chain"
            data-testid="d12-chain-pick"
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
      {showBranches && mastery.kind !== 'ready' ? (
        <div className="d12-live-branch-hint" data-testid="d12-branches-empty" role="status">
          <p>{mastery.hint}</p>
        </div>
      ) : null}
      {showBranches && mastery.kind === 'ready' ? (
        <p className="gl-note d12-live-branch-note" data-testid="d12-branches-note">
          {`${mastery.branches.length} ${mastery.branches.length === 1 ? 'branch' : 'branches'} from your ${PATH_TO_MASTERY} connections.`}
        </p>
      ) : null}
      {pathNote ? (
        <p className="gl-note d12-live-branch-note" data-testid="d12-path-note" aria-live="polite">
          {pathNote}
        </p>
      ) : null}
      {face && faceId ? (
        <FaceReadout
          faceId={faceId}
          label={face.label}
          cards={d12CardsOnFace(cards, faceId)}
          allCards={cards}
          slots={d12FaceSlots(model, focus)}
          journalEntries={journalEntries}
          goals={goals}
          readOnly={!writable}
          onCollapse={collapseFace}
          onOpen={(id) => setOpen({ kind: 'card', id })}
          onAdd={() => setOpen({ kind: 'draft', faceId })}
        />
      ) : (
        <FaceScores
          cards={cards}
          readOnly={!writable}
          onPickFace={(id) => {
            if (rootRef.current) activateTopoFace(rootRef.current, id);
          }}
          onAdd={() => setOpen({ kind: 'draft', faceId: null })}
        />
      )}
      {open ? (
        <D12CardSheet
          open={open}
          cards={cards}
          links={links}
          journalEntries={journalEntries}
          goals={goals}
          readOnly={!writable}
          onClose={() => setOpen(null)}
          onCommitCards={commitCards}
          onCommitLinks={commitLinks}
          onViewOnPath={viewOnPath}
        />
      ) : null}
    </div>
  );
}

function d12FaceGrids(cards: readonly InstructorD12Card[]): number[] {
  return INSTRUCTOR_D12_FACES.map((face) => d12FaceGridSize(d12CardsOnFace(cards, face.id).length));
}

function useMesh(cards: readonly InstructorD12Card[], scores: InstructorD12Scores | null, metric: D12ShapeMetric) {
  const modelRef = useRef<ReturnType<typeof buildD12Topo> | null>(null);
  const gridKey = useRef('');
  const grids = d12FaceGrids(cards);
  const nextGridKey = grids.join(',');
  // A face that crosses 5, 20, 45, 80, … gets a finer split. The mesh is rebuilt only then.
  if (!modelRef.current || gridKey.current !== nextGridKey) {
    modelRef.current = buildD12Topo(scores, { cards: [], gridFor: (faceIndex) => grids[faceIndex] ?? d12FaceGridSize(0) });
    gridKey.current = nextGridKey;
  }
  const model = modelRef.current;
  const meshKey = useRef('');
  const scoreKey = INSTRUCTOR_D12_FACES.map((face) => `${face.id}:${scores?.[face.id] ?? 'n'}`).join('|');
  const signature = `${nextGridKey}#${metric}#${scoreKey}#${cards.map((card) => `${card.faceId}:${card.id}:${card.rating ?? 'n'}:${card.name}`).join('|')}`;
  if (meshKey.current !== signature) {
    meshKey.current = signature;
    INSTRUCTOR_D12_FACES.forEach((face, index) => {
      showOnD12Face(model, index, d12CardsInPlaceOrder(d12CardsOnFace(cards, face.id)));
    });
    applyD12ShapeMetric(model, metric, cards, scores);
  }
  return model;
}

function FaceScores({
  cards,
  readOnly,
  onPickFace,
  onAdd,
}: {
  cards: readonly InstructorD12Card[];
  readOnly: boolean;
  onPickFace: (faceId: InstructorD12FaceId) => void;
  onAdd: () => void;
}) {
  return (
    <div className="crystal-readout d12-live-readout">
      <section aria-label="Twelve faces">
        <h2>Twelve faces</h2>
        <p>Tap a face, or pick one from the menu. Each score is the average of every card. A card you have not rated stays at 3.</p>
        <ul className="d8sf-face-scores" data-testid="d12-card-face-scores">
          {INSTRUCTOR_D12_FACES.map((face) => {
            const score = d12CardFaceScoreExact(cards, face.id).toFixed(1);
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
        {readOnly ? null : (
          <button type="button" data-testid="d12-add-card" onClick={onAdd}>
            Add a card
          </button>
        )}
      </section>
    </div>
  );
}

function FaceReadout({
  faceId,
  label,
  cards,
  allCards,
  slots,
  journalEntries,
  goals,
  readOnly,
  onCollapse,
  onOpen,
  onAdd,
}: {
  faceId: InstructorD12FaceId;
  label: string;
  cards: readonly InstructorD12Card[];
  allCards: readonly InstructorD12Card[];
  slots: ReturnType<typeof d12FaceSlots>;
  journalEntries: readonly InstructorJournalEntry[];
  goals: readonly InstructorGoal[];
  readOnly: boolean;
  onCollapse: () => void;
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const filled = slots.filter((slot) => slot.label).length;
  const byId = new Map(cards.map((card) => [card.id, card]));
  const faceJournal = useMemo(
    () => instructorJournalMentionsForFace(journalEntries, goals, faceId, allCards),
    [journalEntries, goals, faceId, allCards],
  );
  return (
    <div className="crystal-readout d12-live-readout" data-testid="d12-face-readout">
      <section aria-label={`${label} face`}>
        <div className="d12-live-face-head">
          <h2>
            <button type="button" className="d12-live-face-title" data-testid="d12-face-heading" aria-expanded="true" onClick={onCollapse}>
              {label}
            </button>
          </h2>
          <button type="button" data-testid="d12-face-close" onClick={onCollapse}>
            Close
          </button>
        </div>
        <p data-testid="face-score" aria-live="polite">
          {d12CardFaceScoreLine(cards, faceId)}
        </p>
        <p className="gl-note" data-testid="d12-face-definition">{instructorFaceDefinition(faceId)}</p>
        <p>{`Average of every card on this face. A card you have not rated stays at 3. ${filled} of ${slots.length} tiles have a card.`}</p>
        <FaceMap label={label} slots={slots} byId={byId} readOnly={readOnly} onOpen={onOpen} onAdd={onAdd} />
        <section data-testid="d12-face-card-list" aria-label={`${label} cards`}>
          <ul className="d8sf-card-list">
            {d12CardsInPlaceOrder(cards).map((item) => (
              <li key={item.id} data-list-card={item.id}>
                <button type="button" className="d12-card-link" onClick={() => onOpen(item.id)}>
                  {item.name}
                </button>
                <span>{shownD12CardRating(item.rating)} / 5</span>
              </li>
            ))}
          </ul>
          {readOnly ? null : (
            <button type="button" data-add-card={faceId} data-testid="d12-add-face-card" onClick={onAdd}>
              Add
            </button>
          )}
        </section>
        <section className="d12-face-journal" data-testid="d12-face-journal" aria-label={`${label} journal`}>
          <h3>Your journal</h3>
          {faceJournal.entries.length === 0 && faceJournal.goals.length === 0 ? (
            <p className="gl-note">{EMPTY_INSTRUCTOR_JOURNAL}</p>
          ) : (
            <ul className="d8sf-notes">
              {faceJournal.entries.map((entry) => (
                <li key={entry.id}>
                  <strong>{formatJournalDate(entry.date)}</strong>
                  {` · ${entry.line}`}
                </li>
              ))}
              {faceJournal.goals.map((goal) => (
                <li key={goal.id}>
                  <strong>{goal.done ? 'Goal done' : 'Goal'}</strong>
                  {` · ${goal.text}`}
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </div>
  );
}

function FaceMap({
  label,
  slots,
  byId,
  readOnly,
  onOpen,
  onAdd,
}: {
  label: string;
  slots: ReturnType<typeof d12FaceSlots>;
  byId: ReadonlyMap<string, InstructorD12Card>;
  readOnly: boolean;
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="d8sf-pyramid d12-face-map" data-testid="face-pyramid" data-grid={slots[0]?.grid ?? 1} role="group" aria-label={`${label} slots`}>
      {slots.map((slot) => {
        const card = slot.moveId ? byId.get(slot.moveId) : null;
        return (
          <div key={slot.tileIndex} className="d8sf-slot" data-slot={slot.tileIndex} style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>
            {card ? (
              <button type="button" className="d12-card-link d8sf-term" onClick={() => onOpen(card.id)}>
                {card.name}
              </button>
            ) : (
              <button
                type="button"
                className="d8sf-empty d8sf-empty--blank"
                data-empty-slot={slot.tileIndex}
                aria-label="Empty slot"
                disabled={readOnly}
                onClick={() => {
                  if (!readOnly) onAdd();
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
