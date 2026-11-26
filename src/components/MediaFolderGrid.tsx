import { useEffect, useState } from 'react';
import type { StoredPhoto } from '../lib/photoStore';

/** What the viewer shows while it plays: the count only, never a file name. `position` counts from 0. */
export function viewerCount(position: number, total: number): string {
  return `${position + 1} of ${total}`;
}

type Props = {
  items: readonly StoredPhoto[];
  thumbById: Readonly<Record<string, string>>;
  /** The one delete path (Cloud: asks first, removes the file and its details). Missing hides Delete. */
  onRemove?: (id: string) => Promise<void>;
  /** The item open in the viewer, so its full picture can load. */
  onViewing?: (id: string | null) => void;
  emptyCopy: string;
};

/** A folder as a thumbnail grid. Tap a photo to view it full screen. */
export function MediaFolderGrid({ items, thumbById, onRemove, onViewing, emptyCopy }: Props) {
  const [viewing, setViewing] = useState<number | null>(null);
  const current = viewing !== null ? items[viewing] ?? null : null;

  useEffect(() => {
    onViewing?.(current?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => {
    if (viewing !== null && viewing >= items.length) setViewing(items.length ? items.length - 1 : null);
  }, [items.length, viewing]);

  if (!items.length) return <p className="saver-folder__empty">{emptyCopy}</p>;
  const step = (by: number) => setViewing((at) => (at === null ? null : (at + by + items.length) % items.length));
  const src = current ? thumbById[current.id] : undefined;
  const video = current?.mime.startsWith('video/') ?? false;

  return (
    <>
      <ul className="cloud-gallery__grid media-grid" aria-label="Photos in this folder">
        {items.map((item, i) => {
          const thumb = thumbById[item.id];
          return (
            <li key={item.id} className="cloud-gallery__tile" data-media-grid-item={item.cloudPath ?? item.id}>
              <button type="button" className="cloud-gallery__open" onClick={() => setViewing(i)} aria-label={`View ${item.label}`}>
                {thumb && !item.mime.startsWith('video/') ? (
                  <img src={thumb} alt={item.label} loading="lazy" />
                ) : (
                  <span className="cloud-gallery__glyph" aria-hidden="true">
                    {item.mime.startsWith('video/') ? '▶' : '▢'}
                  </span>
                )}
                <span className="cloud-gallery__name">{item.label}</span>
                {item.playEnabled === false ? <span className="cloud-gallery__date">Off the TV</span> : null}
              </button>
              {onRemove ? (
                <button type="button" className="btn btn--ghost cloud-gallery__delete" data-media-delete={item.cloudPath ?? item.id} onClick={() => void onRemove(item.id)}>
                  Delete
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {current ? (
        <div className="cloud-gallery__player" role="dialog" aria-label="Photo viewer" data-media-viewer={current.cloudPath ?? current.id}>
          {src ? (
            video ? (
              <video src={src} controls autoPlay playsInline />
            ) : (
              <img src={src} alt="" />
            )
          ) : (
            <p role="status">Opening…</p>
          )}
          <div className="cloud-gallery__controls">
            <button type="button" className="btn btn--ghost" onClick={() => step(-1)}>
              Previous
            </button>
            <span data-media-viewer-count="">{viewerCount(viewing ?? 0, items.length)}</span>
            <button type="button" className="btn btn--ghost" onClick={() => step(1)}>
              Next
            </button>
            <button type="button" className="btn" onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
