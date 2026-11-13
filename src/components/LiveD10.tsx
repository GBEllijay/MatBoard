/**
 * Live instructor D10. Same stage, auto-turn, drag, pinch/wheel zoom, and
 * chrome as LiveD8 / TopoStage, with the ten-faced trapezohedron instead of
 * the student octahedron. Does not write storage or open student-card drafts.
 */
import { useMemo, useState } from 'react';
import { buildD10Topo } from '../lib/instructorD10Topo';
import type { InstructorD10Scores } from '../lib/instructorD10';
import { TopoStage } from '../preview/crystallineSweeps/TopoStage';
import '../preview/crystallineSweeps/crystallineSweeps.css';

type Props = {
  scores: InstructorD10Scores | null;
};

export function LiveD10({ scores }: Props) {
  const model = useMemo(() => buildD10Topo(scores), [scores]);
  const [focus, setFocus] = useState(-1);
  return (
    <div className="ip-d10-live" data-testid="instructor-d10-visual">
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
