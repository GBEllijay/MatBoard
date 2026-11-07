import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CLOUD_CATEGORIES,
  PERSONAL_GRAPH_PREVIEW_BANNER,
  PREVIEW_RELATION_LABEL,
  RESET_POSE,
  categoryColor,
  categoryLabel,
  exampleEdges,
  exampleNode,
  exampleNodes,
  gestureIntent,
  goalCaption,
  poseFacing,
  practiceCaption,
  projectNodes,
  rotatePose,
  zoomPose,
  type CloudPose,
  type PreviewNode,
} from '../lib/personalGraphPreview';
import './personalGraphPreview.css';

const nodes = exampleNodes();
const edges = exampleEdges();

function nodeById(id: string): PreviewNode | null {
  return exampleNode(id);
}

export function PersonalGraphPreviewPage() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const poseRef = useRef<CloudPose>(RESET_POSE);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number; moved: boolean; nodeId: string | null } | null>(null);
  const suppressClick = useRef(false);
  const [pose, setPose] = useState<CloudPose>(RESET_POSE);
  const [size, setSize] = useState({ width: 360, height: 420 });
  const [selected, setSelected] = useState('p-closed');
  const [showSnap, setShowSnap] = useState(true);
  const [showBody, setShowBody] = useState(true);
  const [status, setStatus] = useState('');

  const apply = (next: CloudPose) => {
    poseRef.current = next;
    setPose(next);
  };

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      apply(zoomPose(poseRef.current, event.deltaY < 0 ? 1.08 : 0.92));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  const placed = useMemo(() => projectNodes(size, pose, 32), [size, pose]);
  const placeById = useMemo(() => new Map(placed.map((item) => [item.id, item])), [placed]);

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
        zoom: poseRef.current.zoom,
      };
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      apply({ ...poseRef.current, zoom: zoomPose({ ...poseRef.current, zoom: pinch.current.zoom }, dist / pinch.current.dist).zoom });
      return;
    }
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    if (gestureIntent(Math.hypot(event.clientX - active.ox, event.clientY - active.oy)) === 'rotate') active.moved = true;
    if (active.moved) apply(rotatePose(poseRef.current, dx, dy));
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
    const current = poseRef.current;
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      apply(zoomPose(current, 1.12));
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      apply(zoomPose(current, 1 / 1.12));
    } else if (event.key === '0') {
      event.preventDefault();
      apply(RESET_POSE);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      apply(rotatePose(current, -28, 0));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      apply(rotatePose(current, 28, 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      apply(rotatePose(current, 0, -22));
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      apply(rotatePose(current, 0, 22));
    }
  };

  const focus = (id: string) => {
    const node = nodeById(id);
    if (!node) return;
    setSelected(id);
    apply(poseFacing(node, { ...poseRef.current, zoom: Math.max(poseRef.current.zoom, 1.15) }));
    viewportRef.current?.focus();
  };

  const current = nodeById(selected);
  const incoming = edges.filter((edge) => edge.toId === selected);
  const outgoing = edges.filter((edge) => edge.fromId === selected);

  return (
    <main className="pgp">
      <p className="pgp__banner" role="note">
        {PERSONAL_GRAPH_PREVIEW_BANNER}
      </p>
      <h1 className="pgp__title">Example personal technique cloud</h1>
      <p className="pgp__lead">
        Fifteen example moves in one cluster. Drag the cloud to turn it. A short tap still selects a move. Two starting
        positions, Closed guard and Sprawl, stay one bubble each when a path comes back. Nothing on this page is saved.
      </p>
      <p className="pgp__note">
        <Link to="/">Advantage home</Link>
        {' · '}
        <Link to="/preview/technique-tree">Other technique preview</Link>
      </p>

      <section className="pgp__card" aria-label="Profile snapshot concept">
        <h2>Profile snapshot concept</h2>
        <p className="pgp__quiet">
          Optional picture of this cloud for a profile. The switches are not saved and are not added to the live profile.
          The student home body scan stays on its own switch.
        </p>
        <div className="pgp__toggles">
          <button type="button" className="pgp__btn" aria-pressed={showSnap} onClick={() => setShowSnap((on) => !on)}>
            {showSnap ? 'Hide cloud snapshot' : 'Show cloud snapshot'}
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
                apply(RESET_POSE);
                setStatus('Opened the example cloud. Your profile was not changed.');
              }}
            >
              <CloudPicture pose={RESET_POSE} width={200} height={120} />
              <span>Open the full example cloud</span>
            </button>
          ) : (
            <p className="pgp__quiet">Cloud snapshot hidden on this preview only.</p>
          )}
          {showBody ? (
            <figure className="pgp__body">
              <BodySketch />
              <figcaption className="pgp__quiet">A drawing of the existing injury idea. It does not record an injury.</figcaption>
            </figure>
          ) : (
            <p className="pgp__quiet">Body drawing hidden on this preview only.</p>
          )}
        </div>
      </section>

      <section className="pgp__card" id="example-map" aria-label="Example cloud">
        <h2>Full cloud</h2>
        <p className="pgp__quiet">
          Drag to rotate. The cloud does not spin by itself. Pinch, or the zoom buttons, changes size. The rest of this
          page still scrolls. Names that would pile up stay in the list below.
        </p>
        <ul className="pgp__legend" aria-label="Example categories">
          {CLOUD_CATEGORIES.map((item) => (
            <li key={item.id}>
              <span className="pgp__swatch" style={{ background: item.color }} />
              {item.label}
            </li>
          ))}
        </ul>
        <div className="pgp__tools">
          <button type="button" className="pgp__btn" onClick={() => apply(RESET_POSE)}>
            Fit all
          </button>
          <button type="button" className="pgp__btn" aria-pressed={pose.flat} onClick={() => apply({ yaw: 0, pitch: 0, zoom: pose.zoom, flat: !pose.flat })}>
            {pose.flat ? 'Show depth' : 'Flat view'}
          </button>
          <button type="button" className="pgp__btn" onClick={() => apply(zoomPose(poseRef.current, 1.2))}>
            Zoom in
          </button>
          <button type="button" className="pgp__btn" onClick={() => apply(zoomPose(poseRef.current, 1 / 1.2))}>
            Zoom out
          </button>
          <button
            type="button"
            className="pgp__btn"
            onClick={() => {
              apply(RESET_POSE);
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
          aria-label="Example technique cloud. Drag to rotate. A short tap selects a move. Arrow keys rotate. Plus and minus zoom."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          <svg className="pgp__edges" viewBox={`0 0 ${size.width} ${size.height}`} width={size.width} height={size.height} aria-hidden="true">
            {edges.map((edge) => {
              const from = placeById.get(edge.fromId);
              const to = placeById.get(edge.toId);
              if (!from || !to) return null;
              const hot = edge.fromId === selected || edge.toId === selected;
              const color = edge.relation === 'defense' ? '#f0b429' : edge.relation === 'transition' ? '#d6c2ff' : '#7ec8e3';
              return (
                <line
                  key={edge.id}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={hot ? color : 'rgba(143, 211, 255, 0.35)'}
                  strokeWidth={hot ? 2.4 : 1}
                  strokeDasharray={edge.relation === 'transition' ? '5 4' : undefined}
                />
              );
            })}
          </svg>
          {placed.map((item) => {
            const node = nodeById(item.id);
            if (!node) return null;
            const on = item.id === selected;
            return (
              <button
                key={item.id}
                type="button"
                data-node={item.id}
                className={`pgp__dot${on ? ' is-on' : ''}`}
                style={{
                  left: item.x,
                  top: item.y,
                  width: item.r * 2,
                  height: item.r * 2,
                  background: categoryColor(node.category),
                  zIndex: Math.round(item.depth * 10) + 20,
                }}
                aria-pressed={on}
                aria-label={`${node.kind === 'position' ? 'Position' : 'Technique'}: ${node.title}`}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  setSelected(item.id);
                }}
              >
                {on ? <span className="pgp__name">{node.title}</span> : null}
              </button>
            );
          })}
        </div>
      </section>

      {current ? (
        <section className="pgp__detail" aria-live="polite" aria-label="Selected example">
          <h2>{current.title}</h2>
          <p className="pgp__quiet">
            {current.kind === 'position' ? 'Position' : 'Technique'}
            {current.base ? ' · Starting position' : ''}
            {` · ${categoryLabel(current.category)}`}
            {` · same id ${current.id}`}
          </p>
          <p className="pgp__quiet">{goalCaption(current.goal)}</p>
          <p className="pgp__quiet">{practiceCaption(current.practiceMinutes)}</p>
          <p className="pgp__quiet">Direct steps only. Other lines on the cloud stay faint.</p>
          <div className="pgp__tools">
            {outgoing.map((edge) => (
              <button key={edge.id} type="button" className="pgp__btn" onClick={() => focus(edge.toId)}>
                {`${PREVIEW_RELATION_LABEL[edge.relation]} to ${nodeById(edge.toId)?.title ?? 'a missing step'}${edge.label ? ` · ${edge.label}` : ''}`}
              </button>
            ))}
            {incoming.map((edge) => (
              <button key={edge.id} type="button" className="pgp__btn" onClick={() => focus(edge.fromId)}>
                {`${PREVIEW_RELATION_LABEL[edge.relation]} from ${nodeById(edge.fromId)?.title ?? 'a missing step'}${edge.label ? ` · ${edge.label}` : ''}`}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="pgp__compare" aria-label="What exists and what this preview adds">
        <h2>What the app does today</h2>
        <ul>
          <li>Techniques I'm working on is a list and a nested text tree of the same nodes. It does not rotate or zoom.</li>
          <li>A step points at a technique that already exists. The same title is one node. A return says it comes back and stops, so the tree does not repeat forever.</li>
          <li>Live steps are Branch, Defense, and Follow-up. Fundamentals membership is a separate checklist line at Not started until someone sets a level.</li>
          <li>Logging mat time is separate. It does not mark a technique learned.</li>
          <li>A coach tree stays nested on the coach phone. A cycle or a second parent becomes a link there, not a second copy. A position that is not the base can come back as a technique if that coach tree is exported again.</li>
          <li>Sharing is still a file the person exports and the other person accepts. Private notes stay off that file.</li>
        </ul>
        <h2>What this preview adds</h2>
        <ul>
          <li>A cloud with depth. Drag turns it. Fit all, zoom, and a flat view are buttons. It does not spin on its own.</li>
          <li>Colors match six example categories. They are a legend for this picture, not a new curriculum index.</li>
          <li>Mount, Side control, Closed guard, and Sprawl are each one dot even when several steps arrive. Tapping one brightens only its direct lines.</li>
          <li>The profile snapshot is this cloud, on this page only. Hiding it does not change a profile setting.</li>
          <li>A blue → purple line on two example moves is an interval idea, not stripes and not a finished requirement. Minutes are practice in the story, not mastery.</li>
        </ul>
      </section>

      <h2 className="pgp__index-title">Example index</h2>
      <p className="pgp__quiet">The names sit here at reading size. Choosing one turns that same dot toward you. This is not a searchable curriculum index yet.</p>
      <ul className="pgp__index">
        {nodes.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              className="pgp__btn"
              aria-pressed={node.id === selected}
              onClick={() => {
                document.getElementById('example-map')?.scrollIntoView({ block: 'nearest' });
                focus(node.id);
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

function CloudPicture({ pose, width, height }: { pose: CloudPose; width: number; height: number }) {
  const placed = projectNodes({ width, height }, pose, 10);
  const byId = new Map(placed.map((item) => [item.id, item]));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-hidden="true">
      {edges.map((edge) => {
        const from = byId.get(edge.fromId);
        const to = byId.get(edge.toId);
        if (!from || !to) return null;
        return <line key={edge.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="rgba(143, 211, 255, 0.7)" strokeWidth="1.2" />;
      })}
      {placed.map((item) => {
        const node = nodeById(item.id);
        if (!node) return null;
        return <circle key={item.id} cx={item.x} cy={item.y} r={Math.max(3, item.r * 0.28)} fill={categoryColor(node.category)} />;
      })}
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
