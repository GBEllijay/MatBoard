import { useRef, useState } from 'react';
import {
  ASSESSMENT_AREAS,
  SPHERE_NOTE,
  SPHERE_PATH,
  areaById,
  pointerIntent,
  projectArea,
  type AssessmentArea,
} from './model';
import './assessmentSphere.css';

const SIZE = 340;

export function AssessmentSpherePreview() {
  const [yaw, setYaw] = useState(0.4);
  const [pitch, setPitch] = useState(0.15);
  const [openId, setOpenId] = useState<string | null>(null);
  const drag = useRef({ x: 0, y: 0, yaw: 0, pitch: 0, moved: false, active: false });
  const open = openId ? areaById(openId) : null;

  const orbit = (dx: number, dy: number) => {
    setYaw((current) => current + dx * 0.008);
    setPitch((current) => Math.max(-1.15, Math.min(1.15, current + dy * 0.008)));
  };

  if (open) return <AreaPanel area={open} onBack={() => setOpenId(null)} />;

  return (
    <main className="sphere">
      <div className="sphere-shell">
        <p className="sphere-banner" role="note">
          {SPHERE_NOTE}
        </p>
        <h1>Assessment sphere</h1>
        <p className="sphere-note">{SPHERE_PATH}</p>
        <p className="sphere-note">Drag to turn. A small tap opens the side facing you. Arrow keys turn it. Enter opens the focused area.</p>
        <div
          className="sphere-stage"
          data-testid="assessment-sphere"
          onPointerDown={(event) => {
            drag.current = { x: event.clientX, y: event.clientY, yaw, pitch, moved: false, active: true };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current.active) return;
            const dx = event.clientX - drag.current.x;
            const dy = event.clientY - drag.current.y;
            if (pointerIntent(dx, dy) === 'orbit') drag.current.moved = true;
            if (!drag.current.moved) return;
            setYaw(drag.current.yaw + dx * 0.008);
            setPitch(Math.max(-1.15, Math.min(1.15, drag.current.pitch + dy * 0.008)));
          }}
          onPointerUp={() => {
            drag.current.active = false;
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') orbit(-28, 0);
            else if (event.key === 'ArrowRight') orbit(28, 0);
            else if (event.key === 'ArrowUp') orbit(0, -28);
            else if (event.key === 'ArrowDown') orbit(0, 28);
            else return;
            event.preventDefault();
          }}
          tabIndex={0}
          role="application"
          aria-label="Assessment sphere. Drag or use arrow keys to turn."
        >
          {ASSESSMENT_AREAS.map((area, index) => {
            const spot = projectArea(index, yaw, pitch, SIZE);
            return (
              <button
                key={area.id}
                type="button"
                className="sphere-node"
                data-testid={`area-${area.id}`}
                data-occluded={spot.occluded ? 'true' : 'false'}
                data-front={spot.depth > 0.45 ? 'true' : 'false'}
                style={{ left: spot.x, top: spot.y, zIndex: Math.round((spot.depth + 1) * 10) }}
                onClick={() => {
                  if (drag.current.moved || spot.occluded) return;
                  setOpenId(area.id);
                }}
              >
                {area.title}
                <span className="sphere-score">Example {area.exampleScore} / 5</span>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function AreaPanel({ area, onBack }: { area: AssessmentArea; onBack: () => void }) {
  return (
    <main className="sphere">
      <div className="sphere-shell">
        <p className="sphere-banner" role="note">
          {SPHERE_NOTE}
        </p>
        <button type="button" className="sphere-btn" onClick={onBack}>
          Back to sphere
        </button>
        <h1>{area.title}</h1>
        <p className="sphere-note">Fictional example {area.exampleScore} / 5. Not your progress.</p>
        {area.benchmark ? (
          <section className="sphere-bench" aria-label={area.benchmark.title} data-testid="benchmark-panel">
            <h2>{area.benchmark.title}</h2>
            <p>{area.benchmark.detail}</p>
          </section>
        ) : null}
        {area.tree ? (
          <section className="sphere-tree" aria-label={`${area.tree.base.title} demonstration`} data-testid="demo-tree">
            <h2>{area.tree.base.title}</h2>
            <p>Demonstration only. Not a requirement and not a curriculum.</p>
            <ul>
              {area.tree.children.map((child) => (
                <li key={child.id} data-testid={`demo-${child.id}`}>
                  {area.tree?.base.title} → {child.title}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
