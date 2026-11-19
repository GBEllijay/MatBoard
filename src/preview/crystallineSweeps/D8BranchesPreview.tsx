/**
 * Internal technique-tree branches through the D8. Direct link only.
 * Demo pyramid heights and the example branches stay in memory. Nothing here writes a record.
 */
import { useMemo, useState } from 'react';
import { PREVIEW_BANNER } from './adapter.ts';
import { TopoStage } from './TopoStage.tsx';
import { buildTopo, demoLevel } from './topo.ts';
import { BRANCH_SAMPLE_NOTE, branchesFromTree, type D8Branch } from './branches.ts';
import './crystallineSweeps.css';

export const D8_BRANCHES_PATH = '/preview/d8-branches';

const NONE: readonly D8Branch[] = [];

export function D8BranchesPreview() {
  const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
  const model = useMemo(() => buildTopo((id) => demoLevel(id)), []);
  const all = useMemo(() => branchesFromTree(model), [model]);
  const [show, setShow] = useState(params.get('branches') !== '0');
  const [xray, setXray] = useState(params.get('xray') === '1');
  const [focus, setFocus] = useState(-1);
  const [tapped, setTapped] = useState<D8Branch | null>(null);
  const branches = show ? all : NONE;
  const faceName = (tile: number) => model.faces[model.tiles[tile]?.faceIndex ?? -1]?.name ?? '';
  return (
    <main className="crystal topo" data-testid="d8-branches-preview">
      <p className="crystal-banner" role="note">
        {PREVIEW_BANNER} {BRANCH_SAMPLE_NOTE} Pyramid heights are the demo heights.
      </p>
      <div className="crystal-layout">
        <section aria-label="D8 with inside branches">
          <div className="crystal-toggle" role="group" aria-label="Branches">
            <button type="button" aria-pressed={show} data-branch-toggle="" onClick={() => setShow((value) => !value)}>
              {show ? 'Hide branches' : 'Show branches'}
            </button>
            <button
              type="button"
              aria-pressed={xray || show}
              data-xray-toggle=""
              disabled={show}
              onClick={() => setXray((value) => !value)}
            >
              {show ? 'X-ray on while branches show' : xray ? 'X-ray on' : 'X-ray off'}
            </button>
          </div>
          <p className="crystal-style-note">
            {show
              ? 'Each line runs from one pyramid tip, through the middle of the diamond, to a technique on another face. Nearer lines are brighter and thicker. Tap a line to see its two techniques. Tap it again, or empty space, to clear.'
              : 'Branches are off. The diamond draws exactly as Live D8 does.'}
          </p>
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
            fitZoom
            separateLabels
            branches={branches}
            xray={xray}
            onBranchTap={setTapped}
            onFocus={setFocus}
            onSelect={() => undefined}
            onDrill={() => undefined}
          />
        </section>
        <section aria-label="Branch list">
          <h2>Example branches ({all.length})</h2>
          <ul className="d8-branch-list">
            {all.map((branch) => (
              <li key={branch.id} data-branch-row={branch.id} aria-current={tapped?.id === branch.id ? 'true' : undefined}>
                {branch.fromName} <small>({faceName(branch.from)})</small> → {branch.toName} <small>({faceName(branch.to)})</small>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
