/**
 * Live instructor D12. Same stage, auto-turn, drag, pinch/wheel zoom, and
 * chrome as LiveD8 / TopoStage, with the twelve-faced dodecahedron instead of
 * the student octahedron. Instructors can add and rate cards on a face.
 * Face scores roll up from those cards. The daily check-in is not written here.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { activateTopoFace, TopoStage } from '../preview/crystallineSweeps/TopoStage';
import {
  buildD12Topo,
  d12FaceGridSize,
  d12FaceSlots,
  showOnD12Face,
} from '../lib/instructorD12Topo';
import { INSTRUCTOR_D12_FACES, type InstructorD12FaceId, type InstructorD12Scores } from '../lib/instructorD12';
import {
  DUPLICATE_NAME,
  addInstructorD12Card,
  d12CardFaceScoreExact,
  d12CardFaceScoreLine,
  d12CardRatingNote,
  d12CardsInPlaceOrder,
  d12CardsOnFace,
  loadInstructorD12Cards,
  rateInstructorD12Card,
  saveInstructorD12Cards,
  shownD12CardRating,
  type InstructorD12Card,
} from '../lib/instructorD12Cards';
import type { AssessmentScore } from '../lib/studentAssessment';
import '../preview/crystallineSweeps/crystallineSweeps.css';
import '../preview/d8Subfactors/d8Subfactors.css';
import './liveD12.css';

const SCALE = [1, 2, 3, 4, 5] as const;

type Props = {
  scores?: InstructorD12Scores | null;
  /** When set, these cards are shown and nothing is written. */
  cards?: InstructorD12Card[];
  seatKey?: string;
  readOnly?: boolean;
};

type OpenState =
  | null
  | { kind: 'draft'; faceId: InstructorD12FaceId | null }
  | { kind: 'card'; id: string };

export function LiveD12({ scores = null, cards: cardsProp, seatKey = 'owner', readOnly = false }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const controlled = cardsProp != null || readOnly;
  const [stored, setStored] = useState<InstructorD12Card[]>(() =>
    cardsProp != null ? cardsProp.map((card) => ({ ...card })) : loadInstructorD12Cards(localStorage, seatKey),
  );
  const cards = cardsProp != null ? cardsProp : stored;
  const [focus, setFocus] = useState(-1);
  const [open, setOpen] = useState<OpenState>(null);

  const commit = (next: InstructorD12Card[]) => {
    if (controlled) return;
    const saved = saveInstructorD12Cards(next, localStorage, seatKey);
    setStored(saved);
  };

  const model = useMesh(cards, scores);
  const face = focus >= 0 ? INSTRUCTOR_D12_FACES[focus] : null;
  const faceId = face?.id ?? null;

  const collapseFace = () => setFocus(-1);

  return (
    <div ref={rootRef} className="ip-d12-live" data-testid="instructor-d12-visual">
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
          if (controlled) return;
          const tile = model.tiles[tileIndex];
          const id = tile?.faceId as string | undefined;
          if (id && INSTRUCTOR_D12_FACES.some((item) => item.id === id)) {
            setOpen({ kind: 'draft', faceId: id as InstructorD12FaceId });
          }
        }}
        onDrill={() => undefined}
      />
      {face && faceId ? (
        <FaceReadout
          faceId={faceId}
          label={face.label}
          cards={d12CardsOnFace(cards, faceId)}
          slots={d12FaceSlots(model, focus)}
          readOnly={controlled}
          onCollapse={collapseFace}
          onOpen={(id) => setOpen({ kind: 'card', id })}
          onAdd={() => setOpen({ kind: 'draft', faceId })}
        />
      ) : (
        <FaceScores
          cards={cards}
          readOnly={controlled}
          onPickFace={(id) => {
            if (rootRef.current) activateTopoFace(rootRef.current, id);
          }}
          onAdd={() => setOpen({ kind: 'draft', faceId: null })}
        />
      )}
      {open ? (
        <CardDialog
          open={open}
          cards={cards}
          readOnly={controlled}
          onClose={() => setOpen(null)}
          onCommit={commit}
        />
      ) : null}
    </div>
  );
}

function d12FaceGrids(cards: readonly InstructorD12Card[]): number[] {
  return INSTRUCTOR_D12_FACES.map((face) => d12FaceGridSize(d12CardsOnFace(cards, face.id).length));
}

function useMesh(cards: readonly InstructorD12Card[], scores: InstructorD12Scores | null) {
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
  const signature = `${nextGridKey}#${cards.map((card) => `${card.faceId}:${card.id}:${card.rating ?? 'n'}:${card.name}`).join('|')}`;
  if (meshKey.current !== signature) {
    meshKey.current = signature;
    INSTRUCTOR_D12_FACES.forEach((face, index) => {
      showOnD12Face(model, index, d12CardsInPlaceOrder(d12CardsOnFace(cards, face.id)));
    });
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
  slots,
  readOnly,
  onCollapse,
  onOpen,
  onAdd,
}: {
  faceId: InstructorD12FaceId;
  label: string;
  cards: readonly InstructorD12Card[];
  slots: ReturnType<typeof d12FaceSlots>;
  readOnly: boolean;
  onCollapse: () => void;
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const filled = slots.filter((slot) => slot.label).length;
  return (
    <div className="crystal-readout d12-live-readout" data-testid="d12-face-readout">
      <section aria-label={`${label} cards`}>
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
        <p>{`Average of every card on this face. A card you have not rated stays at 3. ${filled} of ${slots.length} tiles have a card.`}</p>
        <ul className="d8sf-card-list" data-testid="d12-face-card-list">
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
    </div>
  );
}

function CardDialog({
  open,
  cards,
  readOnly,
  onClose,
  onCommit,
}: {
  open: Exclude<OpenState, null>;
  cards: readonly InstructorD12Card[];
  readOnly: boolean;
  onClose: () => void;
  onCommit: (cards: InstructorD12Card[]) => void;
}) {
  const existing = open.kind === 'card' ? cards.find((item) => item.id === open.id) ?? null : null;
  const [draftName, setDraftName] = useState('');
  const [draftFace, setDraftFace] = useState<InstructorD12FaceId | null>(open.kind === 'draft' ? open.faceId : existing?.faceId ?? null);
  const [draftRating, setDraftRating] = useState<AssessmentScore>(3);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    if (open.kind !== 'draft') return;
    setDraftName('');
    setDraftFace(open.faceId);
    setDraftRating(3);
    setDraftError(null);
  }, [open]);

  useEffect(() => {
    if (!savedAt) return;
    const timer = window.setTimeout(() => setSavedAt(0), 2000);
    return () => window.clearTimeout(timer);
  }, [savedAt]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const faceId = open.kind === 'draft' ? draftFace : existing?.faceId ?? null;
  const faceLabel = faceId ? INSTRUCTOR_D12_FACES.find((face) => face.id === faceId)?.label ?? faceId : 'Pick a face';
  const rating = existing ? shownD12CardRating(existing.rating) : draftRating;

  const saveDraft = (event?: FormEvent) => {
    event?.preventDefault();
    if (readOnly) return;
    if (!faceId) {
      setDraftError('Pick a face.');
      return;
    }
    const added = addInstructorD12Card(cards, faceId, draftName, draftRating);
    if ('error' in added) {
      setDraftError(added.error === 'duplicate' ? DUPLICATE_NAME : 'Enter a name.');
      return;
    }
    onCommit(added.cards);
    onClose();
  };

  return (
    <div
      className="d8sf-sheet d12-live-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={existing ? `${existing.name} card` : `${faceLabel} new card`}
      data-testid="instructor-d12-card-dialog"
    >
      <button type="button" className="d8sf-scrim" aria-label="Close card" onClick={onClose} />
      <article className="d8sf-index" aria-label={existing ? `${existing.name} card` : `${faceLabel} new card`}>
        {existing ? (
          <header className="d8sf-index-head">
            <h2 className="d8sf-index-title">{existing.name}</h2>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </header>
        ) : (
          <form className="d8sf-add" onSubmit={saveDraft}>
            <label className="d8sf-field">
              <span className="d8sf-kicker">Name</span>
              <input
                aria-label="New card name"
                data-testid="d12-new-card-name"
                value={draftName}
                autoFocus
                autoComplete="off"
                placeholder="Name this card"
                onChange={(event) => {
                  setDraftName(event.target.value);
                  setDraftError(null);
                }}
              />
            </label>
            <label className="d8sf-field">
              <span className="d8sf-kicker">Face</span>
              <select
                aria-label="Card face"
                data-testid="d12-new-card-face"
                value={draftFace ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  setDraftFace(INSTRUCTOR_D12_FACES.some((face) => face.id === value) ? (value as InstructorD12FaceId) : null);
                  setDraftError(null);
                }}
              >
                <option value="">Pick a face</option>
                {INSTRUCTOR_D12_FACES.map((face) => (
                  <option key={face.id} value={face.id}>
                    {face.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="d8sf-add-actions">
              <button type="submit" className="d8sf-add-submit" data-testid="d12-new-card-save">
                Add
              </button>
              <button type="button" className="d8sf-add-cancel" onClick={onClose}>
                Cancel
              </button>
            </div>
            {draftError ? (
              <p className="d8sf-add-error" role="alert">
                {draftError}
              </p>
            ) : null}
          </form>
        )}
        <section className="d8sf-index-block" aria-label="Rating">
          <h3>Rate it</h3>
          <div className="d8sf-rates" role="group" aria-label={existing ? `Rate ${existing.name}` : 'Rate new card'}>
            {SCALE.map((value) => (
              <button
                key={value}
                type="button"
                className="d8sf-rate"
                aria-pressed={rating === value}
                aria-label={existing ? `${existing.name} ${value}` : `New card ${value}`}
                data-testid={existing ? `d12-card-rate-${value}` : `d12-new-card-rate-${value}`}
                disabled={readOnly}
                onClick={() => {
                  if (readOnly) return;
                  if (!existing) {
                    setDraftRating(value);
                    return;
                  }
                  onCommit(rateInstructorD12Card(cards, existing.id, value));
                  setSavedAt(Date.now());
                }}
              >
                {value}
              </button>
            ))}
          </div>
          <p className="d8sf-index-hint">{d12CardRatingNote(existing ? existing.rating : draftRating)}</p>
          <p className="d12-rate-saved" data-testid="d12-rating-saved" data-on={savedAt ? 'true' : 'false'} aria-live="polite">
            {savedAt ? 'Saved' : ''}
          </p>
        </section>
      </article>
    </div>
  );
}

