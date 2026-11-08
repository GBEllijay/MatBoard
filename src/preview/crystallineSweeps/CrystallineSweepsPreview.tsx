/**
 * Isolated Sweeps face. Pointed pyramids are the primary drawing.
 * Curved relief is the same mesh with bowed apex edges.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  CRYSTAL_PREVIEW_PATH,
  EXAMPLE_NOTE,
  PREVIEW_BANNER,
  readSweepsProof,
  reliefWord,
  tileRelief,
  type MoveRecord,
  type SweepsProof,
} from './adapter.ts';
import {
  buildSweepLayout,
  buildTileMesh,
  facetCurve,
  type SweepLayout,
  type TileMesh,
} from './geometry.ts';
import {
  VIEW_SIZE,
  clampZoom,
  defaultCamera,
  labelTier,
  pointInTriangle,
  projectLayout,
  shortName,
  type Camera,
} from './project.ts';
import './crystallineSweeps.css';

export { CRYSTAL_PREVIEW_PATH };

type ReliefStyle = 'pyramid' | 'curved';
type ReliefMode = 'example' | 'saved';

const TAP_SLOP = 8;
const SCORE_FILL: Record<1 | 2 | 3 | 4 | 5, [string, string, string]> = {
  1: ['#0c3a4e', '#071e2c', '#14506a'],
  2: ['#14586e', '#0c3344', '#1c6c84'],
  3: ['#1b738c', '#145e74', '#248ea4'],
  4: ['#27a3b6', '#1c8498', '#42c6d2'],
  5: ['#67e4ec', '#2ec4d0', '#b8fbff'],
};

export function CrystallineSweepsPreview() {
  const location = useLocation();
  const proof = useMemo(() => readSweepsProof(storage(), location.search), [location.search]);
  const [mode, setMode] = useState<ReliefMode>('example');
  const [style, setStyle] = useState<ReliefStyle>('pyramid');
  const [selected, setSelected] = useState<string | null>(null);
  const [camera, setCamera] = useState<Camera>(defaultCamera);
  const layout = useMemo(() => buildSweepLayout(proof.moves.map((move) => move.id)), [proof]);
  const meshes = useMemo(
    () =>
      proof.moves.map((move) => ({
        move,
        mesh: buildTileMesh(layout, move.id, tileRelief(mode, move)),
      })),
    [proof, layout, mode],
  );
  const selectedMove = proof.moves.find((move) => move.id === selected) ?? null;

  return (
    <main className="crystal">
      <p className="crystal-banner" role="note">
        {PREVIEW_BANNER}
      </p>
      <div className="crystal-layout">
        <section className="crystal-stage-wrap" aria-label="Sweeps crystal">
          <div className="crystal-toolbar">
            <div className="crystal-toggle" role="group" aria-label="Relief drawing">
              <button type="button" aria-pressed={style === 'pyramid'} onClick={() => setStyle('pyramid')}>
                Pointed pyramids
              </button>
              <button type="button" aria-pressed={style === 'curved'} onClick={() => setStyle('curved')}>
                Curved relief
              </button>
            </div>
            <div className="crystal-toggle" role="group" aria-label="Zoom">
              <button type="button" onClick={() => setCamera((current) => ({ ...current, zoom: clampZoom(current.zoom / 1.15) }))}>
                Zoom out
              </button>
              <button type="button" onClick={() => setCamera(defaultCamera())}>
                Fit face
              </button>
              <button type="button" onClick={() => setCamera((current) => ({ ...current, zoom: clampZoom(current.zoom * 1.15) }))}>
                Zoom in
              </button>
            </div>
          </div>
          <p className="crystal-style-note">
            {style === 'pyramid'
              ? 'Pointed pyramids. 1 sinks deep, 2 sinks a little, 3 is flat, 4 rises, 5 is the tall point.'
              : 'Same tiles and the same apex heights. Faces bow inward so the point is less sharp. Order and sign stay the same.'}
          </p>
          <CrystalStage
            layout={layout}
            meshes={meshes}
            camera={camera}
            style={style}
            selected={selected}
            onSelect={setSelected}
            onCamera={setCamera}
          />
        </section>
        <div className="crystal-readout">
          <header>
            <h1>Sweeps</h1>
            <p className="crystal-source">
              Fundamentals catalog {proof.catalogItemCount} names. This face uses the {proof.sweepsMapped} Sweeps moves
              from the factor map. Layout {proof.layoutRevision}. One branch only.
            </p>
          </header>
          <FactorBlock proof={proof} />
          <nav className="crystal-crumb" aria-label="Location">
            <button type="button" onClick={() => setSelected(null)} aria-current={selectedMove ? undefined : 'page'}>
              Sweeps
            </button>
            {selectedMove ? (
              <>
                <span aria-hidden="true">/</span>
                <span aria-current="page">{selectedMove.name}</span>
              </>
            ) : null}
          </nav>
          {selectedMove ? (
            <MoveDetail move={selectedMove} mode={mode} onBack={() => setSelected(null)} />
          ) : (
            <AboutSweeps proof={proof} />
          )}
          <ModeSwitch mode={mode} onChange={setMode} />
          <MoveList moves={proof.moves} mode={mode} selected={selected} onSelect={setSelected} />
        </div>
      </div>
    </main>
  );
}

function FactorBlock({ proof }: { proof: SweepsProof }) {
  const score = proof.factor.value;
  return (
    <section className="crystal-factor" aria-label="Sweeps factor">
      <h2>Sweeps factor</h2>
      <p className={score == null ? 'crystal-unrated' : 'crystal-score'}>{score == null ? 'Not rated' : `${score} / 5`}</p>
      <p>{proof.factor.detail}</p>
    </section>
  );
}

function AboutSweeps({ proof }: { proof: SweepsProof }) {
  return (
    <section aria-label="About Sweeps">
      <h2>About Sweeps</h2>
      <p>{proof.about}</p>
      <p>The catalog lists these moves side by side. It does not store a deeper variation under any of them.</p>
      <h3>Notes</h3>
      {proof.categoryNodes.some((node) => node.notes) ? (
        <ul>
          {proof.categoryNodes
            .filter((node) => node.notes)
            .map((node) => (
              <li key={node.nodeId}>Technique tree note: {node.notes}</li>
            ))}
        </ul>
      ) : (
        <p>No saved note.</p>
      )}
      <p>
        <Link to={proof.fundamentalsHref}>Open Fundamentals</Link>
        <span> Sweeps is one category on that list.</span>
      </p>
      <TreeContext
        empty="No saved technique-tree node is titled Sweeps."
        nodes={proof.categoryNodes}
        truncated={proof.treeTruncated}
      />
    </section>
  );
}

function MoveDetail({ move, mode, onBack }: { move: MoveRecord; mode: ReliefMode; onBack: () => void }) {
  const shown = tileRelief(mode, move);
  const notes = noteLines(move);
  return (
    <section aria-label={`${move.name} detail`}>
      <h2>{move.name}</h2>
      <p className="crystal-kicker">Move detail</p>
      <button type="button" className="crystal-back" onClick={onBack}>
        Back
      </button>
      <p>
        Crystal relief: {shown == null ? 'Not rated' : `${shown} / 5, ${reliefWord(shown)}`}.{' '}
        {mode === 'example' ? EXAMPLE_NOTE : 'This height is the saved checklist score for this move.'}
      </p>
      <p>{savedScoreLine(move)}</p>
      <p>{move.variations.length ? `Catalog variations: ${move.variations.join(', ')}.` : 'No catalog variations.'}</p>
      <h3>Notes</h3>
      {notes.length ? (
        <ul>
          {notes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p>No saved note.</p>
      )}
      <h3>Technique tree and cards</h3>
      {move.coachNodes.length || move.workingNodes.length || move.cards.length ? (
        <>
          <TreeContext empty="" nodes={move.coachNodes} truncated={false} />
          {move.workingNodes.map((node) => (
            <p key={node.nodeId}>
              <Link to={node.href}>Working tree: {node.title}</Link>
              {node.links.length
                ? ` Steps: ${node.links.map((link) => `${link.relation} ${link.otherTitle}`).join(', ')}.`
                : ' No saved step from this technique.'}
            </p>
          ))}
          {move.cards.map((card) => (
            <p key={card.cardId}>
              <Link to={card.href}>Journal card {card.date}</Link>
            </p>
          ))}
        </>
      ) : (
        <p>No saved technique-tree node and no journal card for this move.</p>
      )}
    </section>
  );
}

function TreeContext({
  nodes,
  empty,
  truncated,
}: {
  nodes: MoveRecord['coachNodes'];
  empty: string;
  truncated: boolean;
}) {
  if (!nodes.length) return empty ? <p>{empty}</p> : null;
  return (
    <>
      {nodes.map((node) => (
        <p key={`${node.treeId}:${node.nodeId}`}>
          <Link to={node.href}>
            Technique Tree: {node.treeName} — {node.title || 'Untitled'}
          </Link>
          {node.ancestors.length ? ` Branch: ${[...node.ancestors, node.title].filter(Boolean).join(' → ')}.` : ' This node is the root.'}
          {node.children.length ? ` Steps under it: ${node.children.join(', ')}.` : ' No saved steps under it.'}
          {node.links.length ? ` Links: ${node.links.join(', ')}.` : ''}
        </p>
      ))}
      {truncated ? <p>Part of a saved tree was past the tree limit and was left out.</p> : null}
    </>
  );
}

function noteLines(move: MoveRecord): string[] {
  const lines: string[] = [];
  if (move.checklistNote) lines.push(`Fundamentals note: ${move.checklistNote}`);
  for (const node of move.coachNodes) if (node.notes) lines.push(`Technique tree note: ${node.notes}`);
  for (const node of move.workingNodes) if (node.notes) lines.push(`Working note: ${node.notes}`);
  for (const card of move.cards) if (card.note) lines.push(`Journal note: ${card.note}`);
  return lines;
}

function savedScoreLine(move: MoveRecord): string {
  if (move.score == null && move.scoreSource === 'absent') return 'Saved checklist: no row for this move. Not rated.';
  if (move.score == null) return 'Saved checklist: not started. Not rated.';
  return `Saved checklist: ${move.score} / 5, ${reliefWord(move.score)}.`;
}

function ModeSwitch({ mode, onChange }: { mode: ReliefMode; onChange: (mode: ReliefMode) => void }) {
  return (
    <fieldset className="crystal-mode">
      <legend>Tile scores</legend>
      <label>
        <input
          type="radio"
          name="crystal-scores"
          checked={mode === 'example'}
          onChange={() => onChange('example')}
        />
        Temporary example
      </label>
      <label>
        <input type="radio" name="crystal-scores" checked={mode === 'saved'} onChange={() => onChange('saved')} />
        Saved on this device
      </label>
      <p>{mode === 'example' ? EXAMPLE_NOTE : 'Heights follow the checklist. A missing move stays not rated.'}</p>
    </fieldset>
  );
}

function MoveList({
  moves,
  mode,
  selected,
  onSelect,
}: {
  moves: readonly MoveRecord[];
  mode: ReliefMode;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section aria-label="Sweeps moves">
      <h2>Moves</h2>
      <ul className="crystal-list">
        {moves.map((move) => {
          const shown = tileRelief(mode, move);
          const current = selected === move.id;
          return (
            <li key={move.id}>
              <button type="button" aria-current={current ? 'true' : undefined} onClick={() => onSelect(move.id)}>
                <span>{move.name}</span>
                <span className={shown == null ? 'crystal-unrated' : undefined}>
                  {shown == null ? 'Not rated' : `${shown} ${reliefWord(shown)}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CrystalStage({
  layout,
  meshes,
  camera,
  style,
  selected,
  onSelect,
  onCamera,
}: {
  layout: SweepLayout;
  meshes: { move: MoveRecord; mesh: TileMesh | null }[];
  camera: Camera;
  style: ReliefStyle;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onCamera: (next: Camera | ((current: Camera) => Camera)) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef({ x: 0, y: 0, yaw: 0, pitch: 0, moved: false, pointers: new Map<number, { x: number; y: number }>(), pinch: 0, zoom: 1 });
  const { place } = projectLayout(layout, camera);
  const tier = labelTier(camera.zoom);

  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 1 / 1.08 : 1.08;
      onCamera((current) => ({ ...current, zoom: clampZoom(current.zoom * factor) }));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [onCamera]);

  const hits = meshes
    .map(({ move, mesh }) => {
      if (!mesh) return null;
      const [a, b, c] = mesh.boundary.map(place);
      return { id: move.id, a, b, c };
    })
    .filter((hit): hit is { id: string; a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number }; c: { x: number; y: number; z: number } } => hit != null);

  const facets = meshes.flatMap(({ mesh }) => {
    if (!mesh?.facets || !mesh.apex || mesh.score == null) return [];
    return mesh.facets.map((facet) => {
      const drawn = facet.corners.map(place);
      const z = drawn.reduce((sum, point) => sum + point.z, 0) / drawn.length;
      const curve = facetCurve(facet);
      const controls = curve.toApex.map((edge) => place(edge.control));
      return { facet, drawn, z, score: mesh.score as 1 | 2 | 3 | 4 | 5, controls, index: facet.index };
    });
  });
  facets.sort((a, b) => a.z - b.z);

  const pick = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const point = {
      x: ((clientX - rect.left) / rect.width) * VIEW_SIZE,
      y: ((clientY - rect.top) / rect.height) * VIEW_SIZE,
    };
    const hit = [...hits].reverse().find((row) => pointInTriangle(point, row.a, row.b, row.c));
    if (hit) onSelect(hit.id);
  };

  const onKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'ArrowLeft') onCamera((current) => ({ ...current, yaw: current.yaw - 0.12 }));
    else if (event.key === 'ArrowRight') onCamera((current) => ({ ...current, yaw: current.yaw + 0.12 }));
    else if (event.key === 'ArrowUp') onCamera((current) => ({ ...current, pitch: Math.max(-1.2, current.pitch - 0.08) }));
    else if (event.key === 'ArrowDown') onCamera((current) => ({ ...current, pitch: Math.min(1.35, current.pitch + 0.08) }));
    else if (event.key === '+' || event.key === '=') onCamera((current) => ({ ...current, zoom: clampZoom(current.zoom * 1.15) }));
    else if (event.key === '-' || event.key === '_') onCamera((current) => ({ ...current, zoom: clampZoom(current.zoom / 1.15) }));
    else if (event.key === 'Home') onCamera(defaultCamera());
    else if (event.key === 'Escape') onSelect(null);
    else return;
    event.preventDefault();
  };

  return (
    <svg
      ref={svgRef}
      className="crystal-svg"
      viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
      role="application"
      tabIndex={0}
      data-style={style}
      data-layout={layout.revision}
      data-zoom={camera.zoom.toFixed(2)}
      aria-label="Sweeps crystal. Drag to turn. A tap selects a move. Arrow keys turn it. Plus and minus zoom. Escape clears the selection. The move list beside this shape is the same selection."
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        const state = drag.current;
        state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        state.x = event.clientX;
        state.y = event.clientY;
        state.yaw = camera.yaw;
        state.pitch = camera.pitch;
        state.zoom = camera.zoom;
        state.moved = false;
        if (state.pointers.size === 2) {
          const [first, second] = [...state.pointers.values()];
          state.pinch = Math.hypot(first.x - second.x, first.y - second.y);
        }
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        const state = drag.current;
        if (!state.pointers.has(event.pointerId)) return;
        state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (state.pointers.size >= 2) {
          const [first, second] = [...state.pointers.values()];
          const distance = Math.hypot(first.x - second.x, first.y - second.y);
          if (state.pinch > 0) {
            onCamera((current) => ({ ...current, zoom: clampZoom(state.zoom * (distance / state.pinch)) }));
          }
          state.moved = true;
          return;
        }
        const dx = event.clientX - state.x;
        const dy = event.clientY - state.y;
        if (Math.hypot(dx, dy) > TAP_SLOP) state.moved = true;
        if (!state.moved) return;
        onCamera({
          yaw: state.yaw + dx * 0.008,
          pitch: Math.max(-1.2, Math.min(1.35, state.pitch + dy * 0.006)),
          zoom: camera.zoom,
        });
      }}
      onPointerUp={(event) => {
        const state = drag.current;
        const start = state.pointers.get(event.pointerId);
        state.pointers.delete(event.pointerId);
        if (start && !state.moved && state.pointers.size === 0) pick(event.clientX, event.clientY);
      }}
      onPointerCancel={(event) => {
        drag.current.pointers.delete(event.pointerId);
      }}
    >
      {meshes.map(({ mesh }) => {
        if (!mesh) return null;
        const [a, b, c] = mesh.boundary.map(place);
        return (
          <polygon
            key={`${mesh.id}-base`}
            points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}`}
            className="crystal-base"
          />
        );
      })}
      {facets.map(({ facet, drawn, score, controls, index }) => (
        <FacetShape
          key={`${facet.tileId}-${facet.index}`}
          drawn={drawn}
          controls={controls}
          score={score}
          index={index}
          style={style}
          selected={selected === facet.tileId}
        />
      ))}
      {meshes.map(({ move, mesh }) => {
        if (!mesh) return null;
        const [a, b, c] = mesh.boundary.map(place);
        const unrated = mesh.apex == null;
        const label = tier === 'full' ? move.name : tier === 'short' ? shortName(move.name) : '';
        const center = place(mesh.centroid);
        const onFace = center.x >= 10 && center.y >= 10 && center.x <= VIEW_SIZE - 10 && center.y <= VIEW_SIZE - 10;
        return (
          <g key={move.id} data-tile={move.id} data-score={mesh.score == null ? 'unrated' : String(mesh.score)}>
            {unrated ? (
              <polygon
                points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}`}
                className={selected === move.id ? 'crystal-open crystal-open-selected' : 'crystal-open'}
              />
            ) : null}
            {onFace && label ? (
              <text x={center.x} y={center.y} className="crystal-label">
                {label}
              </text>
            ) : null}
            {onFace && !label ? (
              <text x={center.x} y={center.y} className="crystal-numeral">
                {mesh.score == null ? '–' : mesh.score}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function FacetShape({
  drawn,
  controls,
  score,
  index,
  style,
  selected,
}: {
  drawn: { x: number; y: number }[];
  controls: { x: number; y: number }[];
  score: 1 | 2 | 3 | 4 | 5;
  index: 0 | 1 | 2;
  style: ReliefStyle;
  selected: boolean;
}) {
  const fill = SCORE_FILL[score][index];
  const [a, b, c] = drawn;
  const face = selected ? 'crystal-face crystal-face-selected' : 'crystal-face';
  if (style === 'pyramid') {
    return <polygon points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}`} fill={fill} className={face} />;
  }
  const [cb, ca] = controls;
  const d = `M ${a.x} ${a.y} L ${b.x} ${b.y} Q ${cb.x} ${cb.y} ${c.x} ${c.y} Q ${ca.x} ${ca.y} ${a.x} ${a.y} Z`;
  return <path d={d} fill={fill} className={face} />;
}

function storage(): Pick<Storage, 'getItem'> {
  if (typeof localStorage === 'undefined') return { getItem: () => null };
  return localStorage;
}
