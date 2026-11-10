/**
 * Draft preview. Eight D8 faces, sample lines, and in-memory index cards.
 * Variant A caps the diamond at nine. Variant B also drills in when you zoom.
 * Nothing here is written to a record.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PREVIEW_BANNER } from '../crystallineSweeps/adapter.ts';
import { TopoStage } from '../crystallineSweeps/TopoStage.tsx';
import '../crystallineSweeps/crystallineSweeps.css';
import type { AssessmentScore } from '../../lib/studentAssessment.ts';
import type { AxisId } from '../assessmentRadar/model.ts';
import { FaceIndexCard } from './FaceIndexCard.tsx';
import {
  EMPTY_BRANCHES,
  ZOOM_LIST,
  averageRating,
  branchesEmpty,
  moreLabel,
  sampleCards,
  strongestCards,
  variantFromSearch,
  variantLabel,
  type FaceCard,
  type PreviewVariant,
} from './cards.ts';
import {
  BRANCH_LINKS,
  D8_SUBFACTORS_PATH,
  DUPLICATE_NAME,
  FACES,
  PROPOSED_NOTE,
  SAMPLE_CHAINS,
  SAMPLE_CHIP,
  SCISSOR_CHAIN_ID,
  SUBFACTOR_DISCLAIMER,
  chainById,
  chainFaceIds,
  faceById,
  linksFrom,
  reviewAddedName,
  subfactorById,
  type SampleChain,
} from './model.ts';
import { buildSubfactorTopo, faceSlots, showOnDiamond } from './topoModel.ts';
import './d8Subfactors.css';

export { D8_SUBFACTORS_PATH };

const SCORES = [1, 2, 3, 4, 5] as const;

type DraftCard = {
  faceId: AxisId;
  name: string;
  rating: AssessmentScore;
  error: string | null;
  journal: FaceCard['journal'];
  video: FaceCard['video'];
};

type Drill =
  | { level: 'diamond' }
  | { level: 'face'; faceId: AxisId }
  | { level: 'card'; faceId: AxisId; cardId: string }
  | { level: 'branches'; faceId: AxisId; cardId: string };

export function D8SubfactorsPreview() {
  const { search } = useLocation();
  const variant = variantFromSearch(search);
  const modelRef = useRef<ReturnType<typeof buildSubfactorTopo> | null>(null);
  if (!modelRef.current) modelRef.current = buildSubfactorTopo(FACES, (id) => sampleCards().find((card) => card.id === id)?.rating ?? null);
  const model = modelRef.current;
  const [cards, setCards] = useState(sampleCards);
  const meshKey = useRef('');
  const stamp = useRef(1000);
  const meshSig = cards.map((card) => `${card.faceId}:${card.id}:${card.rating}:${card.name}`).join('|');
  if (meshKey.current !== meshSig) {
    meshKey.current = meshSig;
    FACES.forEach((face, index) => {
      const mine = strongestCards(cards.filter((card) => card.faceId === face.id));
      showOnDiamond(
        model,
        index,
        mine.map((card) => ({ id: card.id, name: card.name, rating: card.rating })),
      );
    });
  }
  const [focus, setFocus] = useState(-1);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [listFaceId, setListFaceId] = useState<AxisId | null>(null);
  const [draft, setDraft] = useState<DraftCard | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [drill, setDrill] = useState<Drill>({ level: 'diamond' });
  const [holdDiamond, setHoldDiamond] = useState(false);
  const [zoomCommand, setZoomCommand] = useState<{ zoom: number; id: number } | null>(null);
  const pending = useRef<string | null>(null);
  const chain = chainId ? chainById(chainId) : null;
  const marked = useMemo(() => {
    if (!chain) return [];
    return chainFaceIds(chain)
      .map((id) => model.faces.findIndex((face) => face.id === id))
      .filter((index) => index >= 0);
  }, [chain, model]);
  const face = focus >= 0 ? FACES[focus] : null;
  const drilled = variant === 'b' && drill.level !== 'diamond';

  useEffect(() => {
    if (!listFaceId || drilled) return;
    document.querySelector('[data-testid="face-card-list"]')?.scrollIntoView?.({ block: 'start' });
  }, [listFaceId, drilled]);

  useEffect(() => {
    if (variant !== 'b') return;
    if (zoom < ZOOM_LIST) {
      if (holdDiamond) setHoldDiamond(false);
      return;
    }
    if (holdDiamond || focus < 0) return;
    const faceId = FACES[focus]?.id;
    if (!faceId) return;
    setDrill((current) => {
      if (current.level === 'diamond') return { level: 'face', faceId };
      if (current.level === 'face' && current.faceId !== faceId) return { level: 'face', faceId };
      return current;
    });
  }, [variant, zoom, focus, holdDiamond]);

  const cardsOn = (faceId: AxisId) => cards.filter((card) => card.faceId === faceId);

  const rate = (id: string, score: AssessmentScore) => {
    setCards((current) => current.map((card) => (card.id === id ? { ...card, rating: score } : card)));
  };

  const startDraft = (faceId: AxisId) => {
    setSheetId(null);
    setDraft({ faceId, name: '', rating: 3, error: null, journal: [], video: null });
  };

  const openList = (faceId: AxisId) => {
    const index = FACES.findIndex((item) => item.id === faceId);
    if (index >= 0) setFocus(index);
    setListFaceId(faceId);
    if (variant === 'b' && zoom >= ZOOM_LIST && !holdDiamond) setDrill({ level: 'face', faceId });
  };

  const openCard = (id: string) => {
    const card = cards.find((item) => item.id === id);
    if (!card) return;
    if (variant === 'b' && !holdDiamond && (drill.level !== 'diamond' || zoom >= ZOOM_LIST)) {
      setSheetId(null);
      setDrill({ level: 'card', faceId: card.faceId, cardId: card.id });
      return;
    }
    setSheetId(card.id);
  };

  const goDiamond = () => {
    setHoldDiamond(true);
    setZoomCommand((command) => ({ zoom: 1, id: (command?.id ?? 0) + 1 }));
    setDrill({ level: 'diamond' });
  };

  const back = () => {
    if (drill.level === 'branches') {
      setDrill({ level: 'card', faceId: drill.faceId, cardId: drill.cardId });
      return;
    }
    if (drill.level === 'card') {
      setDrill({ level: 'face', faceId: drill.faceId });
      return;
    }
    if (drill.level === 'face') goDiamond();
  };

  const openBranches = (faceId: AxisId, cardId: string) => {
    if (variant !== 'b') return;
    setSheetId(null);
    setDraft(null);
    setDrill({ level: 'branches', faceId, cardId });
  };

  const commitDraft = () => {
    if (!draft) return;
    const review = reviewAddedName(
      cardsOn(draft.faceId).map((card) => card.name),
      draft.name,
    );
    if ('error' in review) {
      setDraft({ ...draft, error: review.error === 'duplicate' ? DUPLICATE_NAME : null });
      return;
    }
    stamp.current += 1;
    const addedAt = stamp.current;
    const card: FaceCard = {
      id: `added.${draft.faceId}.${addedAt}`,
      faceId: draft.faceId,
      name: review.label,
      rating: draft.rating,
      addedAt,
      journal: draft.journal,
      video: draft.video,
      tree: null,
    };
    setCards((current) => [...current, card]);
    setDraft(null);
    setListFaceId(draft.faceId);
  };

  const addNote = (text: string, cardId: string | null) => {
    const note = text.trim().replace(/\s+/g, ' ');
    if (!note) return;
    stamp.current += 1;
    const row = { id: `note-${stamp.current}`, text: note };
    if (draft && cardId == null) {
      setDraft({ ...draft, journal: [...draft.journal, row] });
      return;
    }
    if (!cardId) return;
    setCards((current) => current.map((card) => (card.id === cardId ? { ...card, journal: [...card.journal, row] } : card)));
  };

  const addVideo = (title: string, href: string, cardId: string | null) => {
    const link = href.trim();
    if (!link) return;
    const video = { title: title.trim().replace(/\s+/g, ' '), href: link };
    if (draft && cardId == null) {
      setDraft({ ...draft, video });
      return;
    }
    if (!cardId) return;
    setCards((current) => current.map((card) => (card.id === cardId ? { ...card, video } : card)));
  };

  const openSubfactor = (id: string) => {
    const line = subfactorById(id);
    if (!line) return;
    pending.current = id;
    const button = document.querySelector<HTMLButtonElement>(`[data-face-button="${line.faceId}"]`);
    if (button) {
      button.click();
      return;
    }
    pending.current = null;
    setFocus(model.faces.findIndex((item) => item.id === line.faceId));
    setActiveId(id);
  };

  const showChain = (id: string) => {
    const next = chainById(id);
    if (!next) return;
    setChainId(id);
    openSubfactor(next.steps[0]);
  };

  const sheet = sheetId ? cards.find((card) => card.id === sheetId) ?? null : null;

  return (
    <>
      <main className="crystal d8sf" data-variant={variant}>
        <header className="d8sf-top">
          <p className="d8sf-variant" data-variant-label={variant}>
            {variantLabel(variant)}
          </p>
          <p className="d8sf-sample">{SAMPLE_CHIP}</p>
          <p className="crystal-banner" role="note" data-testid="preview-banner">
            {PREVIEW_BANNER} {SUBFACTOR_DISCLAIMER}
          </p>
          <h1>Assessment D8</h1>
          <p className="d8sf-proposed">{PROPOSED_NOTE}</p>
          <button type="button" data-chain-open={SCISSOR_CHAIN_ID} aria-pressed={chainId === SCISSOR_CHAIN_ID} onClick={() => showChain(SCISSOR_CHAIN_ID)}>
            {chainById(SCISSOR_CHAIN_ID)?.title}
          </button>
        </header>
        {chain ? <ChainTrail chain={chain} activeId={activeId} onOpen={openSubfactor} onClear={() => setChainId(null)} /> : null}
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
          marked={marked}
          meshHidden={drilled}
          zoomCommand={zoomCommand}
          onZoom={setZoom}
          onEmptyTile={(tileIndex) => {
            const tile = model.tiles[tileIndex];
            if (tile) openList(tile.faceId);
          }}
          onFocus={(index) => {
            if (index < 0) {
              pending.current = null;
              setFocus(-1);
              setActiveId(null);
              setChainId(null);
              setListFaceId(null);
              setSheetId(null);
              setDraft(null);
              setDrill({ level: 'diamond' });
              setHoldDiamond(false);
              return;
            }
            setFocus(index);
            setListFaceId((current) => (current && FACES[index]?.id !== current ? null : current));
            const id = pending.current;
            pending.current = null;
            const line = id ? subfactorById(id) : null;
            setActiveId(line && model.faces[index]?.id === line.faceId ? line.id : null);
          }}
          onSelect={(index) => {
            const tile = model.tiles[index];
            if (!tile?.move) return;
            openCard(tile.move.id);
          }}
          onDrill={() => {}}
        />
        {drilled ? (
          <DrillView
            drill={drill}
            cards={cards}
            variant={variant}
            onBack={back}
            onDiamond={goDiamond}
            onFace={(faceId) => setDrill({ level: 'face', faceId })}
            onCard={(faceId, cardId) => setDrill({ level: 'card', faceId, cardId })}
            onOpen={openCard}
            onAdd={startDraft}
            onRate={rate}
            onCloseCard={back}
            onNote={(text, cardId) => addNote(text, cardId)}
            onVideo={(title, href, cardId) => addVideo(title, href, cardId)}
            onBranches={openBranches}
          />
        ) : (
          <div className="crystal-readout">
            {face ? (
              <FacePanel
                face={face}
                cards={cardsOn(face.id)}
                slots={faceSlots(model, focus)}
                activeId={activeId}
                listOpen={listFaceId === face.id}
                onOpenCard={openCard}
                onOpenList={() => openList(face.id)}
                onAdd={() => startDraft(face.id)}
                onRate={rate}
                onFollow={(id) => {
                  const link = linksFrom(activeId ?? '').find((item) => item.toId === id);
                  if (link) setChainId(link.chainId);
                  openSubfactor(id);
                }}
              />
            ) : (
              <section aria-label="Eight faces">
                <h2>Eight faces</h2>
                <p>Tap a face, or use the factor buttons. Each score is the rounded average of its lines. Sample ratings can change here. They are not saved.</p>
                <ul className="d8sf-face-scores">
                  {FACES.map((item) => {
                    const mine = cardsOn(item.id);
                    const score = averageRating(mine);
                    const extra = moreLabel(mine.length);
                    return (
                      <li key={item.id}>
                        <button type="button" onClick={() => document.querySelector<HTMLButtonElement>(`[data-face-button="${item.id}"]`)?.click()}>
                          <span>{item.label}</span>
                          <span>{score == null ? 'Not rated' : `${score} / 5`}</span>
                        </button>
                        {extra ? (
                          <button type="button" data-more={item.id} onClick={() => openList(item.id)}>
                            {extra}
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            <details className="d8sf-more">
              <summary>Other sample branches</summary>
              <ul className="d8sf-chain-list">
                {SAMPLE_CHAINS.filter((item) => item.id !== SCISSOR_CHAIN_ID).map((item) => (
                  <li key={item.id}>
                    <button type="button" aria-pressed={chainId === item.id} onClick={() => showChain(item.id)}>
                      {item.title}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
            <p className="crystal-source">{BRANCH_LINKS.length} sample hops. Each hop leaves its face. Nothing is written to this device.</p>
          </div>
        )}
      </main>
      {draft ? (
        <FaceIndexCard
          faceId={draft.faceId}
          faceLabel={faceById(draft.faceId).label}
          name={draft.name}
          rating={draft.rating}
          journal={draft.journal}
          video={draft.video}
          draft
          error={draft.error}
          showBranches={false}
          layout="sheet"
          onName={(value) => setDraft({ ...draft, name: value, error: null })}
          onSave={commitDraft}
          onClose={() => setDraft(null)}
          onRate={(value) => setDraft({ ...draft, rating: value })}
          onAddNote={(text) => addNote(text, null)}
          onAddVideo={(title, href) => addVideo(title, href, null)}
        />
      ) : null}
      {sheet ? (
        <FaceIndexCard
          faceId={sheet.faceId}
          faceLabel={faceById(sheet.faceId).label}
          name={sheet.name}
          rating={sheet.rating}
          journal={sheet.journal}
          video={sheet.video}
          draft={false}
          error={null}
          showBranches={variant === 'b'}
          layout="sheet"
          onName={() => {}}
          onSave={() => {}}
          onClose={() => setSheetId(null)}
          onRate={(value) => rate(sheet.id, value)}
          onAddNote={(text) => addNote(text, sheet.id)}
          onAddVideo={(title, href) => addVideo(title, href, sheet.id)}
          onBranches={() => openBranches(sheet.faceId, sheet.id)}
        />
      ) : null}
    </>
  );
}

function DrillView({
  drill,
  cards,
  variant,
  onBack,
  onDiamond,
  onFace,
  onCard,
  onOpen,
  onAdd,
  onRate,
  onCloseCard,
  onNote,
  onVideo,
  onBranches,
}: {
  drill: Exclude<Drill, { level: 'diamond' }>;
  cards: readonly FaceCard[];
  variant: PreviewVariant;
  onBack: () => void;
  onDiamond: () => void;
  onFace: (faceId: AxisId) => void;
  onCard: (faceId: AxisId, cardId: string) => void;
  onOpen: (id: string) => void;
  onAdd: (faceId: AxisId) => void;
  onRate: (id: string, score: AssessmentScore) => void;
  onCloseCard: () => void;
  onNote: (text: string, cardId: string) => void;
  onVideo: (title: string, href: string, cardId: string) => void;
  onBranches: (faceId: AxisId, cardId: string) => void;
}) {
  const face = faceById(drill.faceId);
  const card = drill.level === 'card' || drill.level === 'branches' ? cards.find((item) => item.id === drill.cardId) ?? null : null;
  return (
    <div className="crystal-readout" data-testid="drill-view">
      <nav className="d8sf-crumb" data-testid="drill-crumb" aria-label="Drill">
        <button type="button" onClick={onDiamond}>
          Diamond
        </button>
        <button type="button" onClick={() => onFace(drill.faceId)}>
          {face.label}
        </button>
        {card ? (
          <button type="button" onClick={() => onCard(drill.faceId, card.id)}>
            {card.name}
          </button>
        ) : null}
        {drill.level === 'branches' ? <span>Branches</span> : null}
      </nav>
      <button type="button" data-testid="drill-back" onClick={onBack}>
        Back
      </button>
      {drill.level === 'face' ? <CardList faceId={drill.faceId} cards={cards} onOpen={onOpen} onAdd={onAdd} /> : null}
      {drill.level === 'card' && card ? (
        <FaceIndexCard
          faceId={card.faceId}
          faceLabel={face.label}
          name={card.name}
          rating={card.rating}
          journal={card.journal}
          video={card.video}
          draft={false}
          error={null}
          showBranches={variant === 'b'}
          layout="flow"
          onName={() => {}}
          onSave={() => {}}
          onClose={onCloseCard}
          onRate={(value) => onRate(card.id, value)}
          onAddNote={(text) => onNote(text, card.id)}
          onAddVideo={(title, href) => onVideo(title, href, card.id)}
          onBranches={() => onBranches(card.faceId, card.id)}
        />
      ) : null}
      {drill.level === 'branches' ? (
        <section data-testid="branch-level" aria-label="Branches">
          <h2>Branches</h2>
          <p>{card && !branchesEmpty(card.tree) ? card.tree?.name : EMPTY_BRANCHES}</p>
        </section>
      ) : null}
    </div>
  );
}

function CardList({
  faceId,
  cards,
  onOpen,
  onAdd,
}: {
  faceId: AxisId;
  cards: readonly FaceCard[];
  onOpen: (id: string) => void;
  onAdd: (faceId: AxisId) => void;
}) {
  const rows = cards.filter((card) => card.faceId === faceId);
  const face = faceById(faceId);
  const extra = moreLabel(rows.length);
  const score = averageRating(rows);
  return (
    <section data-testid="face-card-list" aria-label={`${face.label} cards`}>
      <h2>{face.label}</h2>
      <p data-testid="face-score">Face score {score == null ? 'not rated' : `${score} / 5`}</p>
      {extra ? (
        <p>
          <button type="button" data-more={faceId}>
            {extra}
          </button>
        </p>
      ) : null}
      <ul className="d8sf-card-list">
        {rows.map((card) => (
          <li key={card.id} data-list-card={card.id}>
            <a
              className="d8sf-term"
              href={`#${card.id}`}
              data-term-link={card.id}
              onClick={(event) => {
                event.preventDefault();
                onOpen(card.id);
              }}
            >
              {card.name}
            </a>
            <span>{card.rating} / 5</span>
          </li>
        ))}
      </ul>
      <button type="button" data-add-card={faceId} onClick={() => onAdd(faceId)}>
        Add
      </button>
    </section>
  );
}

function ChainTrail({
  chain,
  activeId,
  onOpen,
  onClear,
}: {
  chain: SampleChain;
  activeId: string | null;
  onOpen: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <nav className="d8sf-trail" aria-label="Branch trail" data-chain={chain.id}>
      <p className="d8sf-kicker">{chain.id === SCISSOR_CHAIN_ID ? 'Sweep side to submission side' : 'Sample branch'}</p>
      <ol>
        {chain.steps.map((id, index) => {
          const line = subfactorById(id);
          const trailFace = line ? faceById(line.faceId) : null;
          return (
            <li key={id}>
              {index > 0 ? <span className="d8sf-arrow" aria-hidden="true">→</span> : null}
              <button type="button" aria-current={activeId === id ? 'step' : undefined} onClick={() => onOpen(id)}>
                <span className="d8sf-kicker">{trailFace?.label}</span>
                <span>{line?.label}</span>
              </button>
            </li>
          );
        })}
        {chain.fan.length ? (
          <li className="d8sf-fan">
            <span className="d8sf-arrow" aria-hidden="true">→</span>
            <div>
              <p className="d8sf-kicker">Submissions</p>
              <ul>
                {chain.fan.map((id) => {
                  const line = subfactorById(id);
                  return (
                    <li key={id}>
                      <button type="button" aria-current={activeId === id ? 'step' : undefined} onClick={() => onOpen(id)}>
                        {line?.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </li>
        ) : null}
      </ol>
      <button type="button" onClick={onClear}>
        Clear branch
      </button>
    </nav>
  );
}

function FacePanel({
  face,
  cards,
  slots,
  activeId,
  listOpen,
  onOpenCard,
  onOpenList,
  onAdd,
  onRate,
  onFollow,
}: {
  face: (typeof FACES)[number];
  cards: readonly FaceCard[];
  slots: ReturnType<typeof faceSlots>;
  activeId: string | null;
  listOpen: boolean;
  onOpenCard: (id: string) => void;
  onOpenList: () => void;
  onAdd: () => void;
  onRate: (id: string, score: AssessmentScore) => void;
  onFollow: (id: string) => void;
}) {
  const score = averageRating(cards);
  const active = activeId ? subfactorById(activeId) : null;
  const outgoing = active && active.faceId === face.id ? linksFrom(active.id) : [];
  const extra = moreLabel(cards.length);
  const byId = new Map(cards.map((card) => [card.id, card]));
  return (
    <section aria-label={`${face.label} sub-factors`}>
      <h2>{face.label}</h2>
      <p data-testid="face-score" aria-live="polite">
        Face score {score == null ? 'not rated' : `${score} / 5`}
      </p>
      <p>Rounded average of every line on this face.</p>
      {extra ? (
        <button type="button" className="d8sf-badge" data-more={face.id} onClick={onOpenList}>
          {extra}
        </button>
      ) : null}
      {listOpen ? <CardList faceId={face.id} cards={cards} onOpen={onOpenCard} onAdd={() => onAdd()} /> : null}
      <div
        className="d8sf-pyramid"
        data-testid="face-pyramid"
        role="group"
        aria-label={`${face.label} slots`}
        onClick={(event) => {
          if (event.target === event.currentTarget) onOpenList();
        }}
      >
        {slots.map((slot) => {
          const card = slot.moveId ? byId.get(slot.moveId) : null;
          return (
            <div key={slot.tileIndex} className="d8sf-slot" data-slot={slot.tileIndex} style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>
              {card ? (
                <a
                  className="d8sf-term"
                  href={`#${card.id}`}
                  data-term-link={card.id}
                  onClick={(event) => {
                    event.preventDefault();
                    onOpenCard(card.id);
                  }}
                >
                  {card.name}
                </a>
              ) : (
                <button type="button" className="d8sf-empty" data-empty-slot={slot.tileIndex} aria-label="Empty slot" onClick={onOpenList}>
                  Empty
                </button>
              )}
            </div>
          );
        })}
      </div>
      {face.proposed ? <p className="d8sf-proposed">{PROPOSED_NOTE}</p> : <p>Check-in labels. This preview does not save them.</p>}
      <ul className="d8sf-lines">
        {cards.map((card) => (
          <li key={card.id} data-subfactor={card.id}>
            <div className="d8sf-line">
              <a
                className="d8sf-term"
                href={`#${card.id}`}
                data-term-link={card.id}
                onClick={(event) => {
                  event.preventDefault();
                  onOpenCard(card.id);
                }}
              >
                {card.name}
              </a>
              <span>{card.rating} / 5</span>
            </div>
            <div className="d8sf-rates" role="group" aria-label={`Rate ${card.name}`}>
              {SCORES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="d8sf-rate"
                  aria-pressed={card.rating === value}
                  aria-label={`${card.name} ${value}`}
                  onClick={() => onRate(card.id, value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {active && active.faceId === face.id ? (
        <section aria-label={`${active.label} branches`}>
          <h3>Branches</h3>
          {active.definition ? <p>{active.definition}</p> : null}
          {active.glossary && active.glossary !== active.label ? <p>Glossary term: {active.glossary}.</p> : null}
          {outgoing.length ? (
            <ul className="d8sf-chain-list">
              {outgoing.map((link) => {
                const next = subfactorById(link.toId);
                const nextFace = next ? faceById(next.faceId) : null;
                return (
                  <li key={link.id}>
                    <button type="button" onClick={() => onFollow(link.toId)}>
                      {next?.label}
                      <span className="d8sf-kicker">{nextFace?.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>No sample branch from this line.</p>
          )}
        </section>
      ) : null}
    </section>
  );
}
