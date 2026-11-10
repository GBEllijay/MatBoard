/**
 * The student sheet's D8. Tapping a term opens the shared index card.
 * Tapping a blank tile, or an empty pyramid slot, starts a new card on that face.
 * Zoom, pause, reset, and the factor buttons stay the stage's own controls.
 */
import { useEffect, useRef, useState } from 'react';
import { TopoStage } from '../preview/crystallineSweeps/TopoStage.tsx';
import { ZOOM_LIST } from '../preview/d8Subfactors/cards.ts';
import { FACES } from '../preview/d8Subfactors/model.ts';
import { buildSubfactorTopo, faceSlots, showOnDiamond } from '../preview/d8Subfactors/topoModel.ts';
import { faceScore, type IndexFaceId, type LiveCard } from '../lib/indexCards.ts';
import { IndexTermLink } from './IndexTermLink.tsx';
import { openTerm, startDraft, useLiveCards } from './store.ts';
import '../preview/crystallineSweeps/crystallineSweeps.css';
import '../preview/d8Subfactors/d8Subfactors.css';

const DIAMOND_CAP = 9;

export function SheetD8Thumb({ onExpand }: { onExpand: () => void }) {
  const cards = useLiveCards();
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

export function LiveD8() {
  const cards = useLiveCards();
  const model = useMesh(cards);
  const [focus, setFocus] = useState(-1);
  const [zoom, setZoom] = useState(1);
  const [holdDiamond, setHoldDiamond] = useState(false);
  const [zoomCommand, setZoomCommand] = useState<{ zoom: number; id: number } | null>(null);
  const face = focus >= 0 ? FACES[focus] : null;
  const faceId = face && isLiveFace(face.id) ? face.id : null;
  const drilled = Boolean(faceId && zoom >= ZOOM_LIST && !holdDiamond);

  useEffect(() => {
    if (zoom < ZOOM_LIST && holdDiamond) setHoldDiamond(false);
  }, [zoom, holdDiamond]);

  const goDiamond = () => {
    setHoldDiamond(true);
    setZoomCommand((command) => ({ zoom: 1, id: (command?.id ?? 0) + 1 }));
  };

  return (
    <div className="crystal d8sf" data-testid="live-d8">
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
        meshHidden={drilled}
        zoomCommand={zoomCommand}
        onZoom={setZoom}
        onEmptyTile={(tileIndex) => {
          const tile = model.tiles[tileIndex];
          if (tile && isLiveFace(tile.faceId)) startDraft(tile.faceId);
        }}
        onFocus={(index) => {
          if (index < 0) {
            setFocus(-1);
            setHoldDiamond(false);
            return;
          }
          setFocus(index);
        }}
        onSelect={(index) => {
          const id = model.tiles[index]?.move?.id;
          if (id) openTerm(id);
        }}
        onDrill={() => undefined}
      />
      {drilled && faceId ? (
        <FaceList faceId={faceId} cards={cards} onBack={goDiamond} />
      ) : face && faceId ? (
        <FaceReadout faceId={faceId} label={face.label} cards={cards.filter((card) => card.faceId === faceId)} slots={faceSlots(model, focus)} />
      ) : (
        <FaceScores cards={cards} />
      )}
    </div>
  );
}

function isLiveFace(id: string): id is IndexFaceId {
  return FACES.some((face) => face.id === id);
}

function useMesh(cards: readonly LiveCard[]) {
  const modelRef = useRef<ReturnType<typeof buildSubfactorTopo> | null>(null);
  if (!modelRef.current) modelRef.current = buildSubfactorTopo(FACES, () => null);
  const model = modelRef.current;
  const meshKey = useRef('');
  const signature = cards.map((card) => `${card.faceId}:${card.id}:${card.rating}:${card.tile}`).join('|');
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
    .slice(0, DIAMOND_CAP);
}

function moreLabel(count: number): string | null {
  const extra = count - DIAMOND_CAP;
  return extra > 0 ? `+${extra} more` : null;
}

function FaceScores({ cards }: { cards: readonly LiveCard[] }) {
  return (
    <div className="crystal-readout">
      <section aria-label="Eight faces">
        <h2>Eight faces</h2>
        <p>Tap a face, or use the factor buttons. Each score is the rounded average of every line. A line you have not rated stays at 3.</p>
        <ul className="d8sf-face-scores">
          {FACES.map((face) => {
            if (!isLiveFace(face.id)) return null;
            const score = faceScore(cards, face.id);
            const extra = moreLabel(cards.filter((card) => card.faceId === face.id).length);
            return (
              <li key={face.id}>
                <button type="button" onClick={() => document.querySelector<HTMLButtonElement>(`[data-face-button="${face.id}"]`)?.click()}>
                  <span>{face.label}</span>
                  <span>{score} / 5</span>
                </button>
                {extra ? <span>{extra}</span> : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function FaceReadout({
  faceId,
  label,
  cards,
  slots,
}: {
  faceId: IndexFaceId;
  label: string;
  cards: readonly LiveCard[];
  slots: ReturnType<typeof faceSlots>;
}) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const extra = moreLabel(cards.length);
  return (
    <div className="crystal-readout">
      <section aria-label={`${label} sub-factors`}>
        <h2>{label}</h2>
        <p data-testid="face-score" aria-live="polite">
          Face score {faceScore(cards, faceId)} / 5
        </p>
        <p>Rounded average of every line on this face.</p>
        {extra ? (
          <p>
            <span className="d8sf-badge" data-more={faceId}>
              {extra}
            </span>
          </p>
        ) : null}
        <div
          className="d8sf-pyramid"
          data-testid="face-pyramid"
          role="group"
          aria-label={`${label} slots`}
          onClick={(event) => {
            if (event.target === event.currentTarget) startDraft(faceId);
          }}
        >
          {slots.map((slot) => {
            const card = slot.moveId ? byId.get(slot.moveId) : null;
            return (
              <div key={slot.tileIndex} className="d8sf-slot" data-slot={slot.tileIndex} style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>
                {card ? (
                  <IndexTermLink name={card.name} className="d8sf-term" />
                ) : (
                  <button
                    type="button"
                    className="d8sf-empty"
                    data-empty-slot={slot.tileIndex}
                    aria-label="Empty slot"
                    onClick={(event) => {
                      event.stopPropagation();
                      startDraft(faceId);
                    }}
                  >
                    Empty
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <CardList faceId={faceId} cards={cards} />
      </section>
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
      <p data-testid="face-score">Face score {faceScore(cards, faceId)} / 5</p>
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
