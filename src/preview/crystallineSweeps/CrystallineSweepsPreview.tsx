/**
 * Owner's D8 topography, wired to the current factor map.
 * Demo pyramid heights are illustrative. Sweeps can also read this device.
 * Nothing here writes a record. Other faces do not open a tree.
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
  const [selected, setSelected] = useState(-1);
  const model = useMemo(
    () =>
      buildTopo((id) => {
        if (mode === 'demo') return demoLevel(id);
        return id in saved ? saved[id] : null;
      }),
    [mode, saved],
  );
  const face = focus >= 0 ? model.faces[focus] : null;
  const tile = selected >= 0 ? model.tiles[selected] : null;
  const sweepMove = tile?.move && tile.move.faceId === 'sweeps' ? proof.moves.find((move) => move.id === tile.move?.id) ?? null : null;

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
          </div>
          <p className="crystal-style-note">
            {style === 'pyramid'
              ? 'Pointed pyramids, the original drawing. 1 is deep inward, 3 is flat, 5 is tall outward.'
              : 'Same octahedron and the same apex heights. Edges bow inward so the point is less sharp.'}
          </p>
          <TopoStage
            model={model}
            style={style}
            focus={focus}
            selected={sweepMove ? selected : selected}
            onFocus={(index) => {
              setFocus(index);
              setSelected(-1);
            }}
            onSelect={setSelected}
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
          {sweepMove ? (
            <MoveDetail move={sweepMove} mode={mode} onBack={() => setSelected(-1)} />
          ) : face ? (
            <FaceCopy face={face} tile={tile?.move ?? null} mode={mode} proof={proof} />
          ) : (
            <section aria-label="Eight faces">
              <h2>Eight factors</h2>
              <p>Drag to rotate. Scroll, pinch, or the plus and minus buttons to zoom. Tap a face, or use the row of factor buttons. Sweeps is the only face that opens a saved note or a technique-tree link.</p>
            </section>
          )}
          {face ? (
            <section aria-label={`${face.name} moves`}>
              <h2>Moves</h2>
              {face.moves.length ? (
                <ul className="crystal-list">
                  {face.moves.map((move) => {
                    const level = mode === 'demo' ? demoLevel(move.id) : move.id in saved ? saved[move.id] : null;
                    return (
                      <li key={move.id}>
                        <button
                          type="button"
                          onClick={() => {
                            const index = model.tiles.findIndex((item) => item.move?.id === move.id);
                            setFocus(faceIndex(model, face.id));
                            setSelected(index);
                          }}
                        >
                          <span>{move.name}</span>
                          <span className={level == null ? 'crystal-unrated' : undefined}>{scoreLabel(level)}</span>
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

function faceIndex(model: ReturnType<typeof buildTopo>, id: string): number {
  return model.faces.findIndex((face) => face.id === id);
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
          {face.id === 'sweeps' ? '' : 'This proof does not open a tree or a card from this factor.'}
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
