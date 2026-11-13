/**
 * Live instructor D12. Same stage, auto-turn, drag, pinch/wheel zoom, and
 * chrome as LiveD8 / TopoStage, with the twelve-faced dodecahedron instead of
 * the student octahedron. Does not write storage or open student-card drafts.
 */
import { useMemo, useState } from 'react';
import { buildD12Topo } from '../lib/instructorD12Topo';
import type { InstructorD12Scores } from '../lib/instructorD12';
import { TopoStage } from '../preview/crystallineSweeps/TopoStage';
import '../preview/crystallineSweeps/crystallineSweeps.css';

type Props = {
  scores: InstructorD12Scores | null;
};

export function LiveD12({ scores }: Props) {
  const model = useMemo(() => buildD12Topo(scores), [scores]);
  const [focus, setFocus] = useState(-1);
  return (
    <div className="ip-d12-live" data-testid="instructor-d12-visual">
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
        onFocus={setFocus}
        onSelect={() => undefined}
        onDrill={() => undefined}
      />
    </div>
  );
}
