/**
 * Owner's D8 topography, wired to the current factor map.
 * Demo pyramid heights are illustrative. Sweeps can also read this device.
 * Example connections are a labeled preview walk. Nothing here writes a record.
 */
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  CRYSTAL_PREVIEW_PATH,
  EXAMPLE_NOTE,
  PREVIEW_BANNER,
  readChecklistLevels,
  readSweepsProof,
  reliefWord,
  type MoveRecord,
  type SweepsProof,
} from './adapter.ts';
import { scoreLabel, TopoStage, type TopoStyle } from './TopoStage.tsx';
import { buildTopo, demoLevel, TOPO_CITED_COMMIT, type TopoFace, type TopoMove } from './topo.ts';
import {
  EXAMPLE_OPPONENT_SWEEPS,
  EXAMPLE_SELF_SWEEPS,
  exampleCompare,
  factorComparisons,
} from './overlay.ts';
import { AXES } from '../assessmentRadar/model.ts';
import { DEMO_CONNECTION_NOTE, DRILL_LIMIT, catalogNameFor, connectionLayout, demoCard } from './demoLinks.ts';
import './crystallineSweeps.css';

export { CRYSTAL_PREVIEW_PATH };

type HeightMode = 'demo' | 'saved';

export function CrystallineSweepsPreview() {
  const location = useLocation();
  const proof = useMemo(() => readSweepsProof(storage(), location.search), [location.search]);
  const saved = useMemo(() => readChecklistLevels(storage()), [location.search]);
  const [mode, setMode] = useState<HeightMode>('demo');
  const [style, setStyle] = useState<TopoStyle>('pyramid');
  const [focus, setFocus] = useState(-1);
  const [compare, setCompare] = useState(false);
  const [pair, setPair] = useState(false);
  const [fill, setFill] = useState<'center' | 'edges'>('center');
  const [selected, setSelected] = useState(-1);
  const [drillPath, setDrillPath] = useState<string[]>([]);
  const [detail, setDetail] = useState(false);
  const model = useMemo(
    () =>
      buildTopo((id) => {
        if (mode === 'demo') return demoLevel(id);
        return id in saved ? saved[id] : null;
      }, fill),
    [mode, saved, fill],
  );
  const face = focus >= 0 ? model.faces[focus] : null;
  const tile = selected >= 0 ? model.tiles[selected] : null;
  const sweepMove = tile?.move && tile.move.faceId === 'sweeps' ? proof.moves.find((move) => move.id === tile.move?.id) ?? null : null;
  const hop = sweepMove ? oneHop(sweepMove) : { shown: [] as string[], extra: 0 };

  return (
    <main className="crystal topo">
      <p className="crystal-banner" role="note">
        {PREVIEW_BANNER} Each face is one official factor. The raised and inverted pyramids in Demo are illustrative, not student data.
        Move lists follow the current catalog and factor map, checked against the topography file from {TOPO_CITED_COMMIT}.
      </p>
      <div className="crystal-layout">
        <section aria-label="Assessment solid">
          <div className="crystal-toggle" role="group" aria-label="Relief drawing">
            <button type="button" aria-pressed={style === 'pyramid'} onClick={() => setStyle('pyramid')}>
              Pointed pyramids
            </button>
            <button type="button" aria-pressed={style === 'curved'} onClick={() => setStyle('curved')}>
              Curved relief
            </button>
            <button type="button" aria-pressed={compare} onClick={() => setCompare((current) => !current)}>
              Example comparison
            </button>
          </div>
          <div className="crystal-toggle" role="group" aria-label="Tile fill">
            <button type="button" aria-pressed={fill === 'center'} onClick={() => setFill('center')}>
              Center first
            </button>
            <button type="button" aria-pressed={fill === 'edges'} onClick={() => setFill('edges')}>
              Edges first
            </button>
          </div>
          <div className="crystal-toggle" role="group" aria-label="Comparison layout">
            <button
              type="button"
              aria-pressed={!pair}
              onClick={() => setPair(false)}
            >
              On the solid
            </button>
            <button
              type="button"
              aria-pressed={pair}
              onClick={() => {
                setPair(true);
                setCompare(true);
              }}
            >
              Side by side
            </button>
          </div>
          <p className="crystal-style-note">
            {compare
              ? 'Example self is cyan and solid. Example opponent is amber and dashed. Same faces, same spin. A higher number is not a prediction.'
              : style === 'pyramid'
                ? 'Pointed pyramids, the original drawing. 1 is deep inward, 3 is flat, 5 is tall outward.'
                : 'Same octahedron and the same apex heights. Edges bow inward so the point is less sharp.'}
          </p>
          <TopoStage
            model={model}
            style={style}
            focus={focus}
            selected={selected}
            comparison={compare}
            pair={pair}
            links={compare ? hop.shown : []}
            drillPath={drillPath}
            onFocus={(index) => {
              setFocus(index);
              setSelected(-1);
              setDrillPath([]);
              setDetail(false);
            }}
            onSelect={(index) => {
              setSelected(index);
              const name = index >= 0 ? model.tiles[index]?.move?.name ?? '' : '';
              setDrillPath(name ? [name] : []);
              setDetail(false);
            }}
            onDrill={(path, open) => {
              setDrillPath(path.slice(0, DRILL_LIMIT));
              if (open) setDetail(true);
            }}
          />
          <p className="crystal-source">
            Unmapped built-in moves, not on any face:{' '}
            {model.unmapped.map((item) => item.name).join(', ') || 'none'}.
          </p>
        </section>
        <div className="crystal-readout">
          <header>
            <h1>Assessment D8</h1>
            <p className="crystal-source">
              Fundamentals catalog {proof.catalogItemCount} names. {proof.sweepsMapped} Sweeps moves. Eight faces.{' '}
              {model.matchesCitedLists ? `The live map still matches the lists cited from ${TOPO_CITED_COMMIT}.` : 'The live map differs from the cited lists. This page follows the live map.'}
            </p>
          </header>
          <section className="crystal-factor" aria-label="Sweeps factor">
            <h2>Sweeps factor</h2>
            <p className={proof.factor.value == null ? 'crystal-unrated' : 'crystal-score'}>
              {proof.factor.value == null ? 'Not rated' : `${proof.factor.value} / 5`}
            </p>
            <p>{proof.factor.detail}</p>
          </section>
          <fieldset className="crystal-mode">
            <legend>Pyramid heights</legend>
            <label>
              <input type="radio" name="topo-heights" checked={mode === 'demo'} onChange={() => setMode('demo')} />
              Demo, illustrative
            </label>
            <label>
              <input type="radio" name="topo-heights" checked={mode === 'saved'} onChange={() => setMode('saved')} />
              Saved on this device
            </label>
            <p>
              {mode === 'demo'
                ? 'Demo proficiency is a fixed hash of the catalog id. It is not a saved score and it is not the Sweeps factor.'
                : 'Heights follow a saved checklist level for that move. No row stays not rated. The Sweeps factor is not copied onto a move.'}
            </p>
          </fieldset>
          {compare ? <Comparison faceId={face?.id ?? null} hop={hop} moveOpen={Boolean(sweepMove)} /> : null}
          {face ? (
            <button
              type="button"
              className="crystal-back"
              onClick={() => {
                setFocus(-1);
                setSelected(-1);
                setDrillPath([]);
                setDetail(false);
              }}
            >
              Whole solid
            </button>
          ) : null}
          {drillPath.length > 1 ? (
            <button type="button" className="crystal-back" onClick={() => setDrillPath((path) => path.slice(0, -1))}>
              Back
            </button>
          ) : null}
          {drillPath.length ? (
            <nav className="drill-path" aria-label="Drill path">
              {drillPath.map((name, index) => (
                <button
                  key={`${name}-${index}`}
                  type="button"
                  data-crumb={index}
                  onClick={() => {
                    setDrillPath(drillPath.slice(0, index + 1));
                    setDetail(true);
                  }}
                >
                  {name}
                </button>
              ))}
            </nav>
          ) : null}
          {sweepMove && drillPath.length <= 1 ? (
            <MoveDetail
              move={sweepMove}
              mode={mode}
              onBack={() => {
                setSelected(-1);
                setDrillPath([]);
                setDetail(false);
              }}
            />
          ) : null}
          {detail && drillPath.length ? (
            <ConnectionCard
              name={drillPath[drillPath.length - 1]}
              parent={drillPath.length > 1 ? drillPath[drillPath.length - 2] : null}
              capped={drillPath.length >= DRILL_LIMIT}
              onStep={(name) => {
                setDrillPath((path) => (path.length >= DRILL_LIMIT ? path : [...path, name]));
                setDetail(true);
              }}
            />
          ) : null}
          {detail ? null : face && !(sweepMove && drillPath.length <= 1) ? (
            <FaceCopy face={face} tile={tile?.move ?? null} mode={mode} proof={proof} />
          ) : !face ? (
            <section aria-label="Eight faces">
              <h2>Eight factors</h2>
              <p>Drag to rotate. Scroll, pinch, or the plus and minus buttons to zoom. Tap a face, or use the row of factor buttons. Sweeps is the only face that opens a saved note or a technique-tree link. Double-tap a highlighted tile for example connections.</p>
            </section>
          ) : null}
          {face ? (
            <section aria-label={`${face.name} moves`}>
              <h2>Moves</h2>
              {face.moves.length ? (
                <ul className="crystal-list">
                  {face.moves.map((move) => {
                    const level = compare
                      ? null
                      : mode === 'demo'
                        ? demoLevel(move.id)
                        : move.id in saved
                          ? saved[move.id]
                          : null;
                    const self = EXAMPLE_SELF_SWEEPS[move.id as keyof typeof EXAMPLE_SELF_SWEEPS];
                    const opponent = EXAMPLE_OPPONENT_SWEEPS[move.id as keyof typeof EXAMPLE_OPPONENT_SWEEPS];
                    return (
                      <li key={move.id}>
                        <button
                          type="button"
                          aria-current={tile?.move?.id === move.id ? 'true' : undefined}
                          onClick={() => {
                            const index = model.tiles.findIndex((item) => item.move?.id === move.id);
                            setFocus(faceIndex(model, face.id));
                            setSelected(index);
                            setDrillPath([move.name]);
                            setDetail(false);
                          }}
                          onDoubleClick={() => {
                            const index = model.tiles.findIndex((item) => item.move?.id === move.id);
                            setFocus(faceIndex(model, face.id));
                            setSelected(index);
                            setDrillPath([move.name]);
                            setDetail(true);
                          }}
                        >
                          <span>{move.name}</span>
                          <span className={level == null && !compare ? 'crystal-unrated' : undefined}>
                            {compare && self && opponent ? `Self ${self} · Opponent ${opponent}` : scoreLabel(level)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>No built-in moves mapped.</p>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function oneHop(move: MoveRecord): { shown: string[]; extra: number } {
  const names: string[] = [];
  for (const node of move.coachNodes) {
    const parent = node.ancestors[node.ancestors.length - 1];
    if (parent) names.push(parent);
    names.push(...node.children);
  }
  for (const node of move.workingNodes) names.push(...node.links.map((link) => link.otherTitle));
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  return { shown: unique.slice(0, 3), extra: Math.max(0, unique.length - 3) };
}

function Comparison({
  faceId,
  hop,
  moveOpen,
}: {
  faceId: string | null;
  hop: { shown: string[]; extra: number };
  moveOpen: boolean;
}) {
  return (
    <section aria-label="Example comparison">
      <h2>Example self and opponent</h2>
      <p>Fictional scores on the same eight factors. A higher number is only a higher example. This is not a prediction and it is not saved.</p>
      <ul className="overlay-legend">
        <li className="overlay-self">Self, cyan, solid line</li>
        <li className="overlay-opponent">Opponent, amber, dashed line</li>
      </ul>
      <table className="overlay-table">
        <caption>Eight factors</caption>
        <thead>
          <tr>
            <th>Factor</th>
            <th>Self</th>
            <th>Opponent</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          {factorComparisons().map((row) => (
            <tr key={row.id}>
              <th>{AXES.find((axis) => axis.id === row.id)?.label}</th>
              <td>{row.self}</td>
              <td>{row.opponent}</td>
              <td>{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {faceId === 'sweeps' ? (
        <>
          <p>Zoomed Sweeps detail uses the six catalog moves only. It is not a new requirement list.</p>
          <table className="overlay-table">
            <caption>Sweeps moves</caption>
            <thead>
              <tr>
                <th>Move</th>
                <th>Self</th>
                <th>Opponent</th>
                <th>Example</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(EXAMPLE_SELF_SWEEPS).map((id) => {
                const self = EXAMPLE_SELF_SWEEPS[id as keyof typeof EXAMPLE_SELF_SWEEPS];
                const opponent = EXAMPLE_OPPONENT_SWEEPS[id as keyof typeof EXAMPLE_OPPONENT_SWEEPS];
                return (
                  <tr key={id}>
                    <th>{id}</th>
                    <td>{self}</td>
                    <td>{opponent}</td>
                    <td>{exampleCompare(self, opponent)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h3>Saved links from the selected move</h3>
          {!moveOpen ? (
            <p>Choose a Sweeps move to see only its saved one-step links. The deepest step in this sample is that one saved hop.</p>
          ) : hop.shown.length ? (
            <p>
              {hop.shown.join(', ')}. One saved step, inside this move only.
              {hop.extra ? ` ${hop.extra} more saved names stay off this view.` : ''}
            </p>
          ) : (
            <p>No saved technique-tree link from this move. The catalog does not connect one Sweeps move to another.</p>
          )}
        </>
      ) : null}
    </section>
  );
}

function faceIndex(model: ReturnType<typeof buildTopo>, id: string): number {
  return model.faces.findIndex((face) => face.id === id);
}

function ConnectionCard({
  name,
  parent,
  capped,
  onStep,
}: {
  name: string;
  parent: string | null;
  capped: boolean;
  onStep: (name: string) => void;
}) {
  const card = demoCard(name);
  const layout = connectionLayout(name, parent);
  const catalog = catalogNameFor(name);
  const specified = card.sides;
  return (
    <section aria-label={`${name} connections`} data-drill-mode={layout.mode} data-drill-n={layout.mode === 'grid' ? layout.n * layout.n : 3}>
      <h2>{name}</h2>
      <p className="crystal-kicker">{DEMO_CONNECTION_NOTE}</p>
      {catalog ? <p>Catalog name: {catalog}.</p> : null}
      {layout.mode === 'grid' ? (
        <>
          <h3>{layout.n * layout.n} tiles</h3>
          <p>
            {layout.names.length} local connections, split into {layout.n * layout.n} tiles.
            {layout.blanks ? ` ${layout.blanks} empty.` : ''} Labels stay hidden until a tile is large enough to read.
          </p>
          {specified.left || specified.base || specified.right ? (
            <p>
              Example side order:{' '}
              {[
                specified.left ? `Left ${specified.left}` : '',
                specified.base ? `Base ${specified.base}` : '',
                specified.right ? `Right ${specified.right}` : '',
              ]
                .filter(Boolean)
                .join(', ')}
              .
            </p>
          ) : null}
          <ul className="drill-sides">
            {layout.names.map((tile) => (
              <li key={tile}>
                <button type="button" data-tile={tile} disabled={capped} onClick={() => onStep(tile)}>
                  {tile}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <h3>Three sides</h3>
          <p>Three or fewer connections stay on the sides of this triangle.</p>
          <ul className="drill-sides">
            {([
              ['left', 'Left'],
              ['base', 'Base'],
              ['right', 'Right'],
            ] as const).map(([role, label]) => {
              const target = layout.sides[role];
              return (
                <li key={role}>
                  <span>{label}</span>
                  <button type="button" data-side={role} disabled={!target || capped} onClick={() => target && onStep(target)}>
                    {target ?? 'Empty'}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <h3>Incoming</h3>
      <p>{card.incoming.length ? card.incoming.join(', ') : 'None in this example.'}</p>
      <h3>Outgoing</h3>
      <p>{card.outgoing.length ? card.outgoing.join(', ') : 'None in this example.'}</p>
      {capped ? <p>This example stops after eight steps.</p> : null}
    </section>
  );
}

function FaceCopy({
  face,
  tile,
  mode,
  proof,
}: {
  face: TopoFace;
  tile: TopoMove | null;
  mode: HeightMode;
  proof: SweepsProof;
}) {
  const savedFace = proof.faces.find((item) => item.id === face.id);
  return (
    <section aria-label={face.id === 'sweeps' ? 'About Sweeps' : `${face.name} face`}>
      <h2>{face.name}</h2>
      <p>{face.meaning}</p>
      <p>{savedFace?.saved == null ? 'Saved check-in: not rated.' : `Saved check-in: ${savedFace.saved} / 5.`}</p>
      {tile ? (
        <p>
          {tile.name}. Catalog id {tile.id}.{' '}
          {mode === 'demo'
            ? `Demo proficiency ${scoreLabel(demoLevel(tile.id))}. Illustrative, not student data.`
            : 'Saved checklist is used only when this move has a row.'}{' '}
          {face.id === 'sweeps' ? '' : 'Single tap highlights this tile. Double-tap it to open example connections. More than three local connections split that tile into a grid. Nothing is saved.'}
        </p>
      ) : face.moves.length ? (
        <p>{face.moves.length} built-in moves mapped. Choosing one names it. Only Sweeps opens notes and links.</p>
      ) : (
        <p>No built-in moves mapped. This factor stays on the check-in. No techniques feed it.</p>
      )}
      {face.id === 'sweeps' ? (
        <>
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
          {proof.categoryNodes.length ? (
            proof.categoryNodes.map((node) => (
              <p key={node.nodeId}>
                <Link to={node.href}>
                  Technique Tree: {node.treeName} — {node.title || 'Untitled'}
                </Link>
                {node.ancestors.length ? ` Branch: ${[...node.ancestors, node.title].filter(Boolean).join(' → ')}.` : ' This node is the root.'}
                {node.children.length ? ` Steps under it: ${node.children.join(', ')}.` : ' No saved steps under it.'}
              </p>
            ))
          ) : (
            <p>No saved technique-tree node is titled Sweeps.</p>
          )}
        </>
      ) : null}
    </section>
  );
}

function MoveDetail({ move, mode, onBack }: { move: MoveRecord; mode: HeightMode; onBack: () => void }) {
  const shown = mode === 'demo' ? demoLevel(move.id) : move.score;
  const notes = noteLines(move);
  return (
    <section aria-label={`${move.name} detail`}>
      <h2>{move.name}</h2>
      <p className="crystal-kicker">Move detail</p>
      <button type="button" className="crystal-back" onClick={onBack}>
        Back
      </button>
      <p>
        Pyramid: {shown == null ? 'Not rated' : `${shown} / 5, ${reliefWord(shown)}`}.{' '}
        {mode === 'demo' ? EXAMPLE_NOTE : 'This height is the saved checklist score for this move.'}
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
          {move.coachNodes.map((node) => (
            <p key={node.nodeId}>
              <Link to={node.href}>
                Technique Tree: {node.treeName} — {node.title || 'Untitled'}
              </Link>
              {node.ancestors.length ? ` Branch: ${[...node.ancestors, node.title].filter(Boolean).join(' → ')}.` : ' This node is the root.'}
              {node.children.length ? ` Steps under it: ${node.children.join(', ')}.` : ' No saved steps under it.'}
            </p>
          ))}
          {move.workingNodes.map((node) => (
            <p key={node.nodeId}>
              <Link to={node.href}>Working tree: {node.title}</Link>
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

function storage(): Pick<Storage, 'getItem'> {
  if (typeof localStorage === 'undefined') return { getItem: () => null };
  return localStorage;
}
