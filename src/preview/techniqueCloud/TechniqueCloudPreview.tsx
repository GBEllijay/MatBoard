import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { STUDENT_EDITION_STORAGE_KEY } from '../../lib/studentEdition';
import {
  CLOUD_NOTE,
  CLOUD_PATH,
  LIBRARY_PATH,
  cardsForTechnique,
  emptyCloud,
  previewCopyFromText,
  sampleCloud,
  techniquesForCard,
  type CloudPreview,
  type CloudTechnique,
} from './model';
import { SUGGESTED_HEADING, layoutSuggested, suggestedCloud } from './suggestedRequirements';
import './techniqueCloud.css';

type Point = { x: number; y: number };

function place(index: number): Point {
  return { x: 24 + (index % 2) * 180, y: 24 + Math.floor(index / 2) * 120 };
}

export function TechniqueCloudPreview() {
  const loaded = suggestedCloud();
  const [preview, setPreview] = useState<CloudPreview>(loaded);
  const [points, setPoints] = useState<Record<string, Point>>(() => layoutSuggested());
  const [selected, setSelected] = useState<string | null>('req.kneebar');
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const board = useRef<HTMLDivElement>(null);

  const show = (next: CloudPreview) => {
    setPreview(next);
    setPoints(Object.fromEntries(next.techniques.map((item, index) => [item.id, place(index)])));
    setSelected(next.techniques[0]?.id ?? null);
  };

  const loadCopy = () => {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STUDENT_EDITION_STORAGE_KEY);
    show(previewCopyFromText(raw));
  };

  const move = (id: string, x: number, y: number) => {
    setPoints((current) => ({ ...current, [id]: { x: Math.max(8, x), y: Math.max(8, y) } }));
  };

  const technique = preview.techniques.find((item) => item.id === selected) ?? null;
  const related = technique ? techniquesForCard(preview, technique.journalCards[0]?.id ?? '') : [];

  return (
    <main className="tcloud">
      <div className="tcloud-shell">
        <p className="tcloud-banner" role="note">
          {CLOUD_NOTE}
        </p>
        <p className="tcloud-kicker">Student preview</p>
        <h1>Technique cloud</h1>
        <p className="tcloud-note">{SUGGESTED_HEADING}</p>
        <p className="tcloud-quiet">{CLOUD_PATH}</p>
        <p className="tcloud-note">{preview.note}</p>
        <div className="tcloud-actions">
          <button type="button" className="tcloud-btn" onClick={() => show(sampleCloud())}>
            Show sample
          </button>
          <button type="button" className="tcloud-btn" onClick={loadCopy}>
            Load a preview copy
          </button>
          <button type="button" className="tcloud-btn" onClick={() => show(emptyCloud())}>
            Clear preview
          </button>
        </div>
        <div
          className="tcloud-board"
          ref={board}
          data-testid="technique-board"
          onPointerMove={(event) => {
            const current = drag.current;
            const frame = board.current?.getBoundingClientRect();
            if (!current || !frame) return;
            move(current.id, event.clientX - frame.left - current.dx, event.clientY - frame.top - current.dy);
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          {preview.techniques.length === 0 ? <p className="tcloud-note">Nothing here yet.</p> : null}
          <svg className="tcloud-links" data-testid="technique-edges">
            {preview.edges.map((edge) => {
              const from = points[edge.fromId];
              const to = points[edge.toId];
              if (!from || !to) return null;
              return (
                <line
                  key={edge.id}
                  data-testid={`edge-${edge.fromId}-${edge.toId}`}
                  x1={from.x + 74}
                  y1={from.y + 26}
                  x2={to.x + 74}
                  y2={to.y + 26}
                />
              );
            })}
          </svg>
          {preview.techniques.map((item, index) => {
            const point = points[item.id] ?? place(index);
            return (
              <button
                key={item.id}
                type="button"
                className="tcloud-node"
                data-testid={`node-${item.id}`}
                style={{ left: point.x, top: point.y }}
                aria-pressed={selected === item.id}
                onClick={() => setSelected(item.id)}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 48 : 16;
                  if (event.key === 'ArrowRight') move(item.id, point.x + step, point.y);
                  else if (event.key === 'ArrowLeft') move(item.id, point.x - step, point.y);
                  else if (event.key === 'ArrowDown') move(item.id, point.x, point.y + step);
                  else if (event.key === 'ArrowUp') move(item.id, point.x, point.y - step);
                  else return;
                  event.preventDefault();
                }}
                onPointerDown={(event) => {
                  const frame = board.current?.getBoundingClientRect();
                  if (!frame) return;
                  drag.current = { id: item.id, dx: event.clientX - frame.left - point.x, dy: event.clientY - frame.top - point.y };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
              >
                {item.title}
              </button>
            );
          })}
        </div>
        <Detail technique={technique} related={related} />
        <p className="tcloud-note">
          <Link to={LIBRARY_PATH}>Video review desk</Link>
        </p>
      </div>
    </main>
  );
}

function Detail({ technique, related }: { technique: CloudTechnique | null; related: CloudTechnique[] }) {
  if (!technique) return <p className="tcloud-note">Choose a technique.</p>;
  const cards = cardsForTechnique({ source: 'sample', techniques: [technique], edges: [], note: '' }, technique.id);
  return (
    <section className="tcloud-detail" aria-label={technique.title}>
      <h2>{technique.title}</h2>
      <p>{technique.notes || 'No note.'}</p>
      <p>{technique.classOrigin ? `Class origin: ${technique.classOrigin}` : 'No class origin on this technique.'}</p>
      <h3>Videos</h3>
      {technique.videos.length ? (
        <ul>
          {technique.videos.map((video) => (
            <li key={video.id}>{video.title}</li>
          ))}
        </ul>
      ) : (
        <p>No video link.</p>
      )}
      <h3>Journal cards</h3>
      {cards.length ? (
        <ul>
          {cards.map((card) => (
            <li key={card.id}>
              {card.date} · {card.title}
              {related.length > 1 ? ` · also ${related.map((item) => item.title).join(', ')}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p>No journal card.</p>
      )}
    </section>
  );
}
