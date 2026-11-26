import { Link } from 'react-router-dom';
import type { FolderId } from '../lib/photoStore';

export type MediaTileId = FolderId | 'schedule';

export type MediaTile = {
  id: MediaTileId;
  label: string;
  /** Files in the folder. Null while Cloud is still answering. */
  count: number | null;
  noun: string;
  nounPlural: string;
  playOn: boolean;
  onPlay: (next: boolean) => void;
  addLabel: string;
  /** Opens the add sheet (camera, library, Google Photos, Drive). */
  onAdd?: () => void;
  /** Schedule adds classes on its own page. */
  addHref?: string;
};

export const MEDIA_TILES_TITLE = 'Media';
export const MEDIA_TILES_HINT = 'Tap a folder to see its photos. Play on TV picks which folders the slideshow plays.';

export function mediaTileCount(tile: Pick<MediaTile, 'count' | 'noun' | 'nounPlural'>): string {
  if (tile.count === null) return '…';
  return `${tile.count} ${tile.count === 1 ? tile.noun : tile.nounPlural}`;
}

/** One Media screen: Gallery, Pro Shop, Events, Schedule. Same three controls on every folder. */
export function MediaFolderTiles({ tiles, onOpen }: { tiles: readonly MediaTile[]; onOpen: (id: MediaTileId) => void }) {
  return (
    <section className="media-tiles" aria-label="Media folders">
      <p className="cloud-gallery__hint">{MEDIA_TILES_HINT}</p>
      <ul className="cloud-folders">
        {tiles.map((tile) => (
          <li key={tile.id} className="media-tile" data-media-tile={tile.id}>
            <button
              type="button"
              className={`cloud-folders__open${tile.id === 'gallery' ? ' cloud-folders__open--gallery' : ''}`}
              data-media-tile-open={tile.id}
              onClick={() => onOpen(tile.id)}
            >
              <span className="cloud-folders__icon" aria-hidden="true" />
              <span className="cloud-folders__label">{tile.label}</span>
              <span className="cloud-folders__count" data-media-tile-count="">
                {mediaTileCount(tile)}
              </span>
            </button>
            <label className="toggle media-tile__play">
              <input
                type="checkbox"
                role="switch"
                checked={tile.playOn}
                aria-label={`Play ${tile.label} on TV`}
                onChange={(event) => tile.onPlay(event.target.checked)}
              />
              Play on TV
            </label>
            {tile.addHref ? (
              <Link className="btn btn--ghost media-tile__add" data-media-tile-add="" to={tile.addHref}>
                {tile.addLabel}
              </Link>
            ) : tile.onAdd ? (
              <button type="button" className="btn btn--ghost media-tile__add" data-media-tile-add="" onClick={tile.onAdd}>
                {tile.addLabel}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
