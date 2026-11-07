import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PERSONAL_GRAPH_PREVIEW_BANNER,
  PREVIEW_RELATION_LABEL,
  centerNode,
  exampleEdges,
  exampleNode,
  exampleNodes,
  fitView,
  goalCaption,
  graphBounds,
  practiceCaption,
  zoomAt,
  type GraphView,
  type PreviewEdge,
  type PreviewNode,
} from '../lib/personalGraphPreview';
import './personalGraphPreview.css';

const nodes = exampleNodes();
const edges = exampleEdges();
const bounds = graphBounds(nodes);

function nodeById(id: string): PreviewNode | null {
  return exampleNode(id);
}

function centerOf(node: PreviewNode): { x: number; y: number } {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

function edgeEnds(edge: PreviewEdge): { x1: number; y1: number; x2: number; y2: number; curve: boolean } | null {
  const from = nodeById(edge.fromId);
  const to = nodeById(edge.toId);
  if (!from || !to) return null;
  const a = centerOf(from);
  const b = centerOf(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const padA = Math.min(from.w, from.h) * 0.48;
  const padB = Math.min(to.w, to.h) * 0.48;
  const curve = edge.id === 'e-post-back' || edge.id === 'e-guill-out' || edge.id === 'e-ankle-guard' || edge.id === 'e-stand';
  return {
    x1: a.x + (dx / len) * padA,
    y1: a.y + (dy / len) * padA,
    x2: b.x - (dx / len) * padB,
    y2: b.y - (dy / len) * padB,
    curve,
  };
}

function edgePath(edge: PreviewEdge): string {
  const ends = edgeEnds(edge);
  if (!ends) return '';
  if (!ends.curve) return `M ${ends.x1} ${ends.y1} L ${ends.x2} ${ends.y2}`;
  const mx = (ends.x1 + ends.x2) / 2 + (ends.x1 < ends.x2 ? 70 : -70);
  const my = (ends.y1 + ends.y2) / 2 - 48;
  return `M ${ends.x1} ${ends.y1} Q ${mx} ${my} ${ends.x2} ${ends.y2}`;
}

function labelPoint(edge: PreviewEdge): { x: number; y: number } | null {
  const ends = edgeEnds(edge);
  if (!ends) return null;
  return { x: (ends.x1 + ends.x2) / 2, y: (ends.y1 + ends.y2) / 2 - (ends.curve ? 18 : 8) };
}

export function PersonalGraphPreviewPage() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<GraphView>({ x: 0, y: 0, scale: 1 });
  const dirty = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number; view: GraphView } | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number; moved: boolean; nodeId: string | null } | null>(null);
  const suppressClick = useRef(false);
  const [view, setView] = useState<GraphView>({ x: 0, y: 0, scale: 1 });
  const [selected, setSelected] = useState('p-closed');
  const [showSnap, setShowSnap] = useState(true);
  const [showBody, setShowBody] = useState(true);
  const [status, setStatus] = useState('');

  const apply = (next: GraphView, fromUser: boolean) => {
    if (fromUser) dirty.current = true;
    viewRef.current = next;
    setView(next);
  };

  const fit = () => {
    const el = viewportRef.current;
    if (!el) return;
    const next = fitView({ width: el.clientWidth, height: el.clientHeight }, 16);
    dirty.current = false;
    viewRef.current = next;
    setView(next);
  };

  const closeUp = (id = selected) => {
    const el = viewportRef.current;
    const node = nodeById(id);
    if (!el || !node) return;
    apply(centerNode({ width: el.clientWidth, height: el.clientHeight }, node, 1), true);
    setSelected(id);
    viewportRef.current?.focus();
  };

  useEffect(() => {
    fit();
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (!dirty.current) fit();
    });
    observer.observe(el);
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const current = viewRef.current;
      const factor = event.deltaY < 0 ? 1.08 : 0.92;
      apply(zoomAt(current, event.clientX - rect.left, event.clientY - rect.top, current.scale * factor), true);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const nodeId = (event.target as Element).closest?.('[data-node]')?.getAttribute('data-node') ?? null;
    if (pointers.current.size === 1) {
      drag.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        ox: event.clientX,
        oy: event.clientY,
        moved: false,
        nodeId,
      };
      pinch.current = null;
    } else if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        scale: viewRef.current.scale,
        view: viewRef.current,
      };
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(event.pointerId);
    if (!prev) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const rect = event.currentTarget.getBoundingClientRect();
      const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
      const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
      apply(zoomAt(pinch.current.view, midX, midY, pinch.current.scale * (dist / pinch.current.dist)), true);
      return;
    }
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    if (Math.hypot(event.clientX - active.ox, event.clientY - active.oy) > 8) active.moved = true;
    if (active.moved) {
      const current = viewRef.current;
      apply({ ...current, x: current.x + dx, y: current.y + dy }, true);
    }
    active.x = event.clientX;
    active.y = event.clientY;
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    const active = drag.current;
    if (active && active.id === event.pointerId) {
      if (active.moved) suppressClick.current = true;
      else if (active.nodeId) {
        setSelected(active.nodeId);
        setStatus('');
      }
    }
    if (pointers.current.size < 2) pinch.current = null;
    if (active?.id === event.pointerId) drag.current = null;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const el = viewportRef.current;
    if (!el) return;
    const current = viewRef.current;
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      apply(zoomAt(current, el.clientWidth / 2, el.clientHeight / 2, current.scale * 1.15), true);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      apply(zoomAt(current, el.clientWidth / 2, el.clientHeight / 2, current.scale / 1.15), true);
    } else if (event.key === '0') {
      event.preventDefault();
      fit();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      apply({ ...current, x: current.x + 40 }, true);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      apply({ ...current, x: current.x - 40 }, true);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      apply({ ...current, y: current.y + 40 }, true);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      apply({ ...current, y: current.y - 40 }, true);
    }
  };

  const current = nodeById(selected);
  const incoming = edges.filter((edge) => edge.toId === selected);
  const outgoing = edges.filter((edge) => edge.fromId === selected);

  return (
    <main className="pgp">
      <p className="pgp__banner" role="note">
        {PERSONAL_GRAPH_PREVIEW_BANNER}
      </p>
      <h1 className="pgp__title">Example personal technique map</h1>
      <p className="pgp__lead">
        Fifteen example moves and two starting positions. A path that reaches a position again uses that same bubble.
        Nothing on this page is saved, and it does not change Techniques I'm working on.
      </p>
      <p className="pgp__note">
        <Link to="/">Advantage home</Link>
        {' · '}
        <Link to="/preview/technique-tree">Other technique preview</Link>
      </p>

      <section className="pgp__card" aria-label="Profile snapshot concept">
        <h2>Profile snapshot concept</h2>
        <p className="pgp__quiet">
          Optional picture for a profile, shown here so it can be judged. The switches are not saved and are not added
          to the live profile. The student home body scan stays on its own switch.
        </p>
        <div className="pgp__toggles">
          <button type="button" className="pgp__btn" aria-pressed={showSnap} onClick={() => setShowSnap((on) => !on)}>
            {showSnap ? 'Hide tree snapshot' : 'Show tree snapshot'}
          </button>
          <button type="button" className="pgp__btn" aria-pressed={showBody} onClick={() => setShowBody((on) => !on)}>
            {showBody ? 'Hide body drawing' : 'Show body drawing'}
          </button>
        </div>
        <div className="pgp__pair">
          {showSnap ? (
            <button
              type="button"
              className="pgp__mini"
              onClick={() => {
                document.getElementById('example-map')?.scrollIntoView({ block: 'nearest' });
                fit();
                setStatus('Opened the example map. Your profile was not changed.');
              }}
            >
              <GraphSvg miniature />
              <span>Open the full example map</span>
            </button>
          ) : (
            <p className="pgp__quiet">Tree snapshot hidden on this preview only.</p>
          )}
          {showBody ? (
            <figure className="pgp__body">
              <BodySketch />
              <figcaption className="pgp__quiet">
                A drawing of the existing injury idea. It does not record an injury.
              </figcaption>
            </figure>
          ) : (
            <p className="pgp__quiet">Body drawing hidden on this preview only.</p>
          )}
        </div>
      </section>

      <section className="pgp__card" id="example-map" aria-label="Example map">
        <h2>Full map</h2>
        <p className="pgp__quiet">
          Fit all shows the whole example, the way a bracket shows every match. Close up, the zoom buttons, or a name
          in the list makes one bubble readable. Drag inside the map. The rest of this page still scrolls.
        </p>
        <div className="pgp__tools">
          <button type="button" className="pgp__btn" onClick={fit}>
            Fit all
          </button>
          <button type="button" className="pgp__btn" onClick={() => closeUp()}>
            Close up
          </button>
          <button
            type="button"
            className="pgp__btn"
            onClick={() => {
              const el = viewportRef.current;
              if (!el) return;
              apply(zoomAt(viewRef.current, el.clientWidth / 2, el.clientHeight / 2, viewRef.current.scale * 1.2), true);
            }}
          >
            Zoom in
          </button>
          <button
            type="button"
            className="pgp__btn"
            onClick={() => {
              const el = viewportRef.current;
              if (!el) return;
              apply(zoomAt(viewRef.current, el.clientWidth / 2, el.clientHeight / 2, viewRef.current.scale / 1.2), true);
            }}
          >
            Zoom out
          </button>
          <button
            type="button"
            className="pgp__btn"
            onClick={() => {
              fit();
              setSelected('p-closed');
              setStatus('View reset. The example was not cleared.');
            }}
          >
            Reset view
          </button>
        </div>
        {status ? (
          <p className="pgp__quiet" role="status">
            {status}
          </p>
        ) : null}
        <div
          ref={viewportRef}
          className="pgp__viewport"
          tabIndex={0}
          role="application"
          aria-label="Example technique map. Drag to move. Pinch or use the zoom buttons. Arrow keys move the map."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          <div
            className="pgp__world"
            style={{
              width: bounds.maxX + 24,
              height: bounds.maxY + 24,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            }}
          >
            <GraphSvg />
            {nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                data-node={node.id}
                className={`pgp__node${node.kind === 'position' ? ' pgp__node--position' : ''}${node.id === selected ? ' is-on' : ''}`}
                style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
                aria-pressed={node.id === selected}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  setSelected(node.id);
                }}
              >
                {node.title}
              </button>
            ))}
          </div>
        </div>
      </section>

      {current ? (
        <section className="pgp__detail" aria-live="polite" aria-label="Selected example">
          <h2>{current.title}</h2>
          <p className="pgp__quiet">
            {current.kind === 'position' ? 'Position' : 'Technique'}
            {current.base ? ' · Starting position' : ''}
            {` · ${current.category}`}
            {` · same id ${current.id}`}
          </p>
          <p className="pgp__quiet">{goalCaption(current.goal)}</p>
          <p className="pgp__quiet">{practiceCaption(current.practiceMinutes)}</p>
          <div className="pgp__tools">
            {outgoing.map((edge) => (
              <button key={edge.id} type="button" className="pgp__btn" onClick={() => closeUp(edge.toId)}>
                {`${PREVIEW_RELATION_LABEL[edge.relation]} to ${nodeById(edge.toId)?.title ?? 'a missing step'}${edge.label ? ` · ${edge.label}` : ''}`}
              </button>
            ))}
            {incoming.map((edge) => (
              <button key={edge.id} type="button" className="pgp__btn" onClick={() => closeUp(edge.fromId)}>
                {`${PREVIEW_RELATION_LABEL[edge.relation]} from ${nodeById(edge.fromId)?.title ?? 'a missing step'}${edge.label ? ` · ${edge.label}` : ''}`}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="pgp__compare" aria-label="What exists and what this preview adds">
        <h2>What the app does today</h2>
        <ul>
          <li>Techniques I'm working on is a list and a nested text tree of the same nodes. It does not pan or zoom.</li>
          <li>A step points at a technique that already exists. The same title is one node. A return says it comes back and stops, so the tree does not repeat forever.</li>
          <li>Live steps are Branch, Defense, and Follow-up. Fundamentals membership is a separate checklist line at Not started until someone sets a level.</li>
          <li>Logging mat time is separate. It does not mark a technique learned.</li>
          <li>A coach tree stays nested on the coach phone. A cycle or a second parent becomes a link there, not a second copy. A position that is not the base can come back as a technique if that coach tree is exported again.</li>
          <li>Sharing is still a file the person exports and the other person accepts. Private notes stay off that file.</li>
        </ul>
        <h2>What this preview adds</h2>
        <ul>
          <li>Bubbles for the whole example, with Fit all, zoom, and pan. Transition is a fourth arrow color so a change of position can be told from a branch. It is not in the saved working list yet.</li>
          <li>Mount, Side control, Closed guard, and Sprawl are each one bubble even when several steps arrive.</li>
          <li>The profile snapshot and the body drawing are pictures on this page only. Hiding them does not change a profile setting.</li>
          <li>A blue → purple line on two example moves is an interval idea, not stripes and not a finished requirement. Minutes on a bubble are practice in the story, not mastery.</li>
        </ul>
      </section>

      <h2 className="pgp__title" style={{ fontSize: '1.15rem', marginTop: '1rem' }}>
        Example index
      </h2>
      <p className="pgp__quiet">
        The names sit here at reading size. Choosing one opens that bubble. This is not a searchable curriculum index yet.
      </p>
      <ul className="pgp__index">
        {nodes.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              className="pgp__btn"
              aria-pressed={node.id === selected}
              onClick={() => {
                document.getElementById('example-map')?.scrollIntoView({ block: 'nearest' });
                closeUp(node.id);
              }}
            >
              {`${node.kind === 'position' ? 'Position' : 'Technique'} · ${node.title}`}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

function GraphSvg({ miniature = false }: { miniature?: boolean }) {
  return (
    <svg
      className={miniature ? undefined : 'pgp__edges'}
      viewBox={`0 0 ${bounds.maxX + 24} ${bounds.maxY + 24}`}
      width={miniature ? 200 : bounds.maxX + 24}
      height={miniature ? 120 : bounds.maxY + 24}
      aria-hidden="true"
    >
      <defs>
        <marker id={miniature ? 'pgp-arrow-mini' : 'pgp-arrow'} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" fill="#d5e6f7" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const point = labelPoint(edge);
        const color =
          edge.relation === 'defense' ? '#f0b429' : edge.relation === 'transition' ? '#d6c2ff' : edge.relation === 'follow' ? '#7dd3fc' : '#22d3ee';
        return (
          <g key={edge.id}>
            <path
              d={edgePath(edge)}
              fill="none"
              stroke={color}
              strokeWidth={miniature ? 3 : 2.5}
              strokeDasharray={edge.relation === 'transition' ? '7 5' : undefined}
              markerEnd={`url(#${miniature ? 'pgp-arrow-mini' : 'pgp-arrow'})`}
            />
            {point && !miniature ? (
              <text className="pgp__edge-label" x={point.x} y={point.y} textAnchor="middle">
                {edge.label}
              </text>
            ) : null}
          </g>
        );
      })}
      {miniature
        ? nodes.map((node) => (
            <rect
              key={node.id}
              x={node.x}
              y={node.y}
              width={node.w}
              height={node.h}
              rx={node.kind === 'position' ? 10 : 20}
              fill={node.kind === 'position' ? '#0a3d7a' : '#12304f'}
              stroke="#22d3ee"
            />
          ))
        : null}
    </svg>
  );
}

function BodySketch() {
  return (
    <svg viewBox="0 0 80 140" role="img" aria-label="Outline of a person with the left knee marked, as a picture only">
      <circle cx="40" cy="16" r="10" fill="none" stroke="#8fd3ff" strokeWidth="2" />
      <path d="M40 26 V78 M24 42 H56 M28 130 L40 78 L52 130" fill="none" stroke="#8fd3ff" strokeWidth="2" />
      <circle cx="30" cy="108" r="6" fill="#f0b429" />
    </svg>
  );
}
