/**
 * Flat D8 Shape on the Technique Tree page.
 * Face taps open glossary base cards. A toggle draws catalog links between
 * faces. Pinch, wheel, and pan zoom the diamond; Reset view restores it.
 * Assessment scores are not read or written.
 */
import { useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import {
  cardsForFace,
  glossaryBaseFaceLabel,
  isGlossaryBaseFace,
  type GlossaryBaseCatalog,
  type GlossaryBaseFaceId,
} from '../lib/glossaryBaseCards.ts';
import {
  panTreeD8View,
  pinchTreeD8View,
  resetTreeD8View,
  TREE_D8_VIEW_HEIGHT,
  TREE_D8_VIEW_WIDTH,
  treeD8FaceAnchors,
  treeD8LabelLines,
  treeD8LabelPoint,
  visibleCatalogLinkSegments,
  wheelTreeD8View,
  type TreeD8View,
} from '../lib/glossaryTreeLinks.ts';
import './techniqueTreeDiamond.css';

const MOVE_THRESHOLD = 8;

export function TechniqueTreeDiamond({
  catalog,
  activeFaceId,
  openCardId,
  onOpenFace,
  onOpenCard,
}: {
  catalog: GlossaryBaseCatalog;
  activeFaceId: string | null;
  openCardId: string | null;
  onOpenFace: (faceId: GlossaryBaseFaceId) => void;
  onOpenCard: (cardId: string) => void;
}) {
  const [linksOn, setLinksOn] = useState(false);
  const [view, setView] = useState<TreeD8View>(resetTreeD8View);
  const [status, setStatus] = useState('');
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const faces = treeD8FaceAnchors();
  const lines = visibleCatalogLinkSegments(catalog, linksOn);
  const openCard = openCardId ? catalog.cards.find((card) => card.id === openCardId) : null;

  const pointInStage = (clientX: number, clientY: number) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: clientX - box.left, y: clientY - box.top };
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const point = pointInStage(event.clientX, event.clientY);
    setView((current) => wheelTreeD8View(current, event.deltaY, point.x, point.y));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y),
        scale: view.scale,
      };
      drag.current = null;
      return;
    }
    if (pointers.current.size === 1) {
      drag.current = { x: event.clientX, y: event.clientY, moved: false };
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const pts = [...pointers.current.values()];
      const distance = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const mid = { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2 };
      const focus = pointInStage(mid.x, mid.y);
      setView((current) =>
        pinchTreeD8View(current, pinch.current!.scale, pinch.current!.distance, distance, focus.x, focus.y),
      );
      return;
    }
    if (drag.current) {
      const dx = event.clientX - drag.current.x;
      const dy = event.clientY - drag.current.y;
      if (Math.hypot(dx, dy) > MOVE_THRESHOLD) drag.current.moved = true;
      if (drag.current.moved) {
        setView((current) => panTreeD8View(current, dx, dy));
        drag.current.x = event.clientX;
        drag.current.y = event.clientY;
      }
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };

  const tapFace = (faceId: string) => {
    if (drag.current?.moved) return;
    if (!isGlossaryBaseFace(faceId)) return;
    setStatus('');
    onOpenFace(faceId);
  };

  const faceCards = activeFaceId && isGlossaryBaseFace(activeFaceId) ? cardsForFace(catalog.cards, activeFaceId) : [];
  const linkedOnFace = faceCards.filter((card) =>
    catalog.links.some(
      (link) =>
        link.toCardId === card.id || (link.from.type === 'card' && link.from.cardId === card.id),
    ),
  );
  const previewCards = (linkedOnFace.length ? linkedOnFace : faceCards).slice(0, 8);

  return (
    <section className="tree-d8" id="tree-d8" aria-label="D8 Shape">
      <div className="tree-d8__head">
        <h2>D8 Shape</h2>
        <p className="tree-d8__lead">
          Tap a face to open its glossary cards below. Turn on technique links to draw your
          connections between faces. Pinch or use the wheel to zoom, then drag to pan.
        </p>
      </div>
      <div className="tree-d8__tools">
        <button
          type="button"
          className={linksOn ? 'tree-d8__toggle is-on' : 'tree-d8__toggle'}
          data-testid="tree-d8-toggle"
          aria-pressed={linksOn}
          onClick={() => setLinksOn((on) => !on)}
        >
          {linksOn ? 'Technique links on' : 'Show technique links'}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          data-testid="tree-d8-reset"
          onClick={() => setView(resetTreeD8View())}
        >
          Reset view
        </button>
      </div>
      <div
        ref={stage}
        className="tree-d8__stage"
        data-testid="tree-d8-stage"
        style={{ touchAction: 'none' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg
          className="tree-d8__svg"
          viewBox={`0 0 ${TREE_D8_VIEW_WIDTH} ${TREE_D8_VIEW_HEIGHT}`}
          role="img"
          aria-label="Front and back of the D8 diamond"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          <text x={FRONT_LABEL_X} y={16} textAnchor="middle" className="tree-d8__caption">
            Front
          </text>
          <text x={BACK_LABEL_X} y={16} textAnchor="middle" className="tree-d8__caption">
            Back (turned over)
          </text>
          {linksOn
            ? lines.map((line) => (
                <line
                  key={line.id}
                  data-testid="tree-d8-link"
                  data-link-id={line.id}
                  className={
                    openCardId && (line.fromCardId === openCardId || line.toCardId === openCardId)
                      ? 'tree-d8__link is-hot'
                      : 'tree-d8__link'
                  }
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                />
              ))
            : null}
          {faces.map((face) => {
            const on = face.id === activeFaceId || face.id === openCard?.faceId;
            const points = face.triangle.map((point) => `${point.x},${point.y}`).join(' ');
            return (
              <g key={face.id} data-area={face.id}>
                <polygon
                  className={on ? 'tree-d8__face is-on' : 'tree-d8__face'}
                  points={points}
                  data-testid={`tree-d8-face-${face.id}`}
                  role="button"
                  tabIndex={0}
                  aria-label={face.label}
                  aria-pressed={on}
                  onClick={() => tapFace(face.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      tapFace(face.id);
                    }
                  }}
                />
                <text
                  x={treeD8LabelPoint(face).x}
                  y={treeD8LabelPoint(face).y}
                  textAnchor={treeD8LabelPoint(face).anchor}
                  className="tree-d8__label"
                  style={{ pointerEvents: 'none' }}
                >
                  {treeD8LabelLines(face.label).map((line, index, lines) => (
                    <tspan
                      key={line}
                      x={treeD8LabelPoint(face).x}
                      dy={index === 0 ? (lines.length > 1 ? '-0.4em' : '0.35em') : '1.1em'}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {status ? (
        <p className="tree-d8__status" role="status">
          {status}
        </p>
      ) : null}
      {activeFaceId && isGlossaryBaseFace(activeFaceId) ? (
        <div className="tree-d8__cards" data-testid="tree-d8-face-list">
          <p>
            {glossaryBaseFaceLabel(activeFaceId)} · {faceCards.length} cards. Tap a name to open it.
          </p>
          <ul>
            {previewCards.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  className={card.id === openCardId ? 'tree-d8__term is-on' : 'tree-d8__term'}
                  data-testid="tree-d8-term"
                  onClick={() => onOpenCard(card.id)}
                >
                  {card.title}
                </button>
              </li>
            ))}
          </ul>
          {faceCards.length > previewCards.length ? (
            <p className="tree-d8__more">The rest are in the glossary list below.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const FRONT_LABEL_X = 100;
const BACK_LABEL_X = 300;

