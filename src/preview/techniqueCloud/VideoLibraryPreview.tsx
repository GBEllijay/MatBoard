import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  EMPTY_MARKUP,
  MARKUP_TOOL_LABELS,
  addStroke,
  extendStroke,
  normPoint,
  undoMarkup,
  type MarkupStroke,
  type MarkupTool,
} from '../../lib/replayAnalysis';
import { CLOUD_PATH, LIBRARY_PATH, addMemoryClip, type MemoryClip } from './model';
import './techniqueCloud.css';

const DURATION = 30;

export function VideoLibraryPreview() {
  const [clips, setClips] = useState<MemoryClip[]>([]);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [tool, setTool] = useState<MarkupTool>('arrow');
  const [markup, setMarkup] = useState(EMPTY_MARKUP);
  const stroke = useRef<MarkupStroke | null>(null);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setTime((current) => (current + 0.5 >= DURATION ? 0 : current + 0.5));
    }, 500);
    return () => window.clearInterval(timer);
  }, [playing]);

  const point = (event: PointerEvent<HTMLDivElement>): [number, number] => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return [0, 0];
    return normPoint(event.clientX - box.left, event.clientY - box.top, box.width, box.height);
  };

  return (
    <main className="tcloud">
      <div className="tcloud-shell">
        <p className="tcloud-banner" role="note">
          Preview only. Film a move does not open the camera. A gallery file stays on this screen and is not uploaded.
        </p>
        <p className="tcloud-kicker">Student preview</p>
        <h1>Video review desk</h1>
        <p className="tcloud-quiet">{LIBRARY_PATH}</p>
        <div className="tcloud-actions">
          <button type="button" className="tcloud-btn" onClick={() => setClips((current) => addMemoryClip(current, 'film', 'Filmed move. Camera stayed closed.'))}>
            Film a move
          </button>
          <label className="tcloud-btn">
            Pick from gallery
            <input
              className="tcloud-file"
              type="file"
              accept="video/*"
              aria-label="Pick from gallery"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                setClips((current) => addMemoryClip(current, 'gallery', file.name));
              }}
            />
          </label>
          <button type="button" className="tcloud-btn" aria-pressed={playing} onClick={() => setPlaying((value) => !value)}>
            {playing ? 'Pause' : 'Play'}
          </button>
        </div>
        <div className="tcloud-ruler" aria-hidden="true">
          <i style={{ left: `${(time / DURATION) * 100}%` }} />
        </div>
        <div className="tcloud-lane" aria-label="Clips on this screen">
          {clips.length === 0 ? <p>No clips on this screen.</p> : null}
          {clips.map((clip) => (
            <p key={clip.id}>
              {clip.source === 'film' ? 'Film' : 'Gallery'} · {clip.title}
            </p>
          ))}
        </div>
        <div className="tcloud-actions" role="group" aria-label="Draw on the frame">
          {(Object.keys(MARKUP_TOOL_LABELS) as MarkupTool[]).map((item) => (
            <button key={item} type="button" className="tcloud-btn" aria-pressed={tool === item} onClick={() => setTool(item)}>
              {MARKUP_TOOL_LABELS[item]}
            </button>
          ))}
          <button type="button" className="tcloud-btn" onClick={() => setMarkup((current) => undoMarkup(current))}>
            Undo
          </button>
        </div>
        <div
          className="tcloud-frame"
          ref={frame}
          data-testid="review-frame"
          onPointerDown={(event) => {
            const start = point(event);
            stroke.current = { tool, color: '#6ea8ff', points: [start] };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!stroke.current) return;
            stroke.current = extendStroke(stroke.current, point(event));
          }}
          onPointerUp={() => {
            if (!stroke.current) return;
            const done = stroke.current;
            stroke.current = null;
            setMarkup((current) => addStroke(current, done));
          }}
        >
          <p>{time.toFixed(1)}s</p>
          <svg viewBox="0 0 1 1" preserveAspectRatio="none">
            {markup.strokes.map((item, index) =>
              item.tool === 'arrow' && item.points.length >= 2 ? (
                <line key={index} x1={item.points[0][0]} y1={item.points[0][1]} x2={item.points[1][0]} y2={item.points[1][1]} />
              ) : null,
            )}
          </svg>
        </div>
        <p className="tcloud-note">
          <Link to={CLOUD_PATH}>Technique cloud</Link>
        </p>
      </div>
    </main>
  );
}
