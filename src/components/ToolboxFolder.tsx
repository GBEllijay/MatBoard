import type { ReactNode } from 'react';
import { PICK_FROM_DRIVE_LABEL } from '../lib/driveMediaPicker';
import { GALLERY_LINK_TECHNIQUES } from '../lib/gallerySchedule';
import { PHOTOS_PICK_LABEL } from '../lib/googlePhotos';
import type { FolderConfig, FolderId, StoredPhoto } from '../lib/photoStore';
import { FolderChevron } from './FolderChevron';
import { FolderItemList } from './FolderItemList';
import { MediaFolderGrid } from './MediaFolderGrid';
import { OpenMyDrive } from './OpenMyDrive';

type Props = {
  folder: FolderConfig;
  open: boolean;
  playEnabled: boolean;
  items: StoredPhoto[];
  thumbById: Record<string, string>;
  onToggle: (open: boolean) => void;
  onPlayToggle: (folderId: FolderId, enabled: boolean) => void;
  onAdd?: () => void;
  onAddVideo?: () => void;
  onPickDrive?: () => void;
  onPickPhotos?: () => void;
  onClear?: () => Promise<void>;
  onRename: (id: string, label: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
  onItemPlayToggle: (id: string, enabled: boolean) => Promise<void>;
  onBuyUrl?: (id: string, buyUrl: string) => Promise<void>;
  onStartsSlide?: (id: string, startsSlide: boolean) => Promise<void>;
  onQrLinks?: (id: string, qrLinks: string[]) => Promise<void>;
  onGalleryChange?: (
    id: string,
    patch: { caption?: string; schedule?: 'always' | 'date' | 'next-class'; showDate?: string },
  ) => Promise<void>;
  onLinkTechniques?: () => void;
  notice?: string;
  addDisabled?: boolean;
  /** Media screen: the open folder only, as a thumbnail grid with the details list folded below. */
  bare?: boolean;
  onBack?: () => void;
  onViewing?: (id: string | null) => void;
  /** Extra panels inside the open folder (Events: Group into an event). */
  children?: ReactNode;
};

export const MEDIA_DETAILS_SUMMARY = 'Edit names, links, and order';

/** Shared Console folder chrome: folder play toggle + ordered list (Gallery, then Pro Shop / Events). */
export function ToolboxFolder({
  folder,
  open,
  playEnabled,
  items,
  thumbById,
  onToggle,
  onPlayToggle,
  onAdd,
  onAddVideo,
  onPickDrive,
  onPickPhotos,
  onClear,
  onRename,
  onRemove,
  onReorder,
  onItemPlayToggle,
  onBuyUrl,
  onStartsSlide,
  onQrLinks,
  onGalleryChange,
  onLinkTechniques,
  notice,
  addDisabled,
  bare,
  onBack,
  onViewing,
  children,
}: Props) {
  if (bare) {
    const list = (
      <FolderItemList
        folder={folder}
        items={items}
        thumbById={thumbById}
        onRename={onRename}
        onRemove={onRemove}
        onReorder={onReorder}
        onPlayToggle={onItemPlayToggle}
        onBuyUrl={onBuyUrl}
        onStartsSlide={onStartsSlide}
        onQrLinks={onQrLinks}
        onGalleryChange={onGalleryChange}
      />
    );
    return (
      <section className="cloud-folder media-folder" data-media-folder={folder.id}>
        <div className="cloud-folder__bar">
          <button type="button" className="btn btn--ghost" data-media-folder-back="" onClick={onBack}>
            ‹ All folders
          </button>
          <h3>{folder.label}</h3>
          <label className="toggle media-tile__play">
            <input type="checkbox" role="switch" checked={playEnabled} aria-label={`Play ${folder.label} on TV`} onChange={(event) => onPlayToggle(folder.id, event.target.checked)} />
            Play on TV
          </label>
        </div>
        {notice ? <p className="saver-folder__empty">{notice}</p> : null}
        <div className="media-folder__add">
          {onAdd ? (
            <button type="button" className="btn" onClick={onAdd} disabled={addDisabled}>
              {folder.addLabel}
            </button>
          ) : null}
          {onAddVideo && folder.videoAddLabel ? (
            <button type="button" className="btn" onClick={onAddVideo}>
              {folder.videoAddLabel}
            </button>
          ) : null}
          {onPickPhotos ? (
            <button type="button" className="btn btn--ghost" onClick={onPickPhotos}>
              {PHOTOS_PICK_LABEL}
            </button>
          ) : null}
          {onPickDrive ? (
            <button type="button" className="btn btn--ghost" onClick={onPickDrive}>
              {PICK_FROM_DRIVE_LABEL}
            </button>
          ) : null}
          {onLinkTechniques ? (
            <button type="button" className="btn btn--ghost" onClick={onLinkTechniques}>
              {GALLERY_LINK_TECHNIQUES}
            </button>
          ) : null}
        </div>
        <MediaFolderGrid items={items} thumbById={thumbById} onRemove={onRemove} onViewing={onViewing} emptyCopy={folder.emptyCopy} />
        {children}
        {items.length ? (
          <details className="saver-folder media-folder__details">
            <summary className="saver-folder__summary">
              <FolderChevron />
              <span className="saver-folder__title">{MEDIA_DETAILS_SUMMARY}</span>
            </summary>
            <div className="saver-folder__panel">
              {onClear ? (
                <button type="button" className="btn btn--ghost" onClick={() => void onClear()}>
                  Clear {folder.label}
                </button>
              ) : null}
              {list}
            </div>
          </details>
        ) : null}
        <OpenMyDrive />
      </section>
    );
  }
  return (
    <details
      className="saver-folder"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        onToggle(next);
      }}
    >
      <summary className="saver-folder__summary">
        <FolderChevron />
        <span className="saver-folder__title">
          {folder.label}
          {folder.ready ? null : <small>This product is in alpha</small>}
        </span>
        <button
          type="button"
          className={`preset saver-folder__play${playEnabled ? ' preset--on' : ''}`}
          aria-pressed={playEnabled}
          aria-label={`Play ${folder.label}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onPlayToggle(folder.id, !playEnabled);
          }}
        >
          {playEnabled ? 'On' : 'Off'}
        </button>
      </summary>
      <div className="saver-folder__panel">
        {folder.ready ? (
          <>
            {notice ? <p className="saver-folder__empty">{notice}</p> : null}
            {onAdd ? (
              <button type="button" className="btn" onClick={onAdd} disabled={addDisabled}>
                {folder.addLabel}
              </button>
            ) : null}
            {onAddVideo && folder.videoAddLabel ? (
              <button type="button" className="btn" onClick={onAddVideo}>
                {folder.videoAddLabel}
              </button>
            ) : null}
            {onPickPhotos ? (
              <button type="button" className="btn" onClick={onPickPhotos}>
                {PHOTOS_PICK_LABEL}
              </button>
            ) : null}
            {onPickDrive ? (
              <button type="button" className="btn" onClick={onPickDrive}>
                {PICK_FROM_DRIVE_LABEL}
              </button>
            ) : null}
            {onLinkTechniques ? (
              <button type="button" className="btn btn--ghost" onClick={onLinkTechniques}>
                {GALLERY_LINK_TECHNIQUES}
              </button>
            ) : null}
            {folder.ready ? <OpenMyDrive /> : null}
            {items.length && onClear ? (
              <button type="button" className="btn btn--ghost" onClick={() => void onClear()}>
                Clear {folder.label}
              </button>
            ) : null}
            <FolderItemList
              folder={folder}
              items={items}
              thumbById={thumbById}
              onRename={onRename}
              onRemove={onRemove}
              onReorder={onReorder}
              onPlayToggle={onItemPlayToggle}
              onBuyUrl={onBuyUrl}
              onStartsSlide={onStartsSlide}
              onQrLinks={onQrLinks}
              onGalleryChange={onGalleryChange}
            />
          </>
        ) : (
          <>
            <p className="saver-folder__empty">{folder.comingSoon}</p>
            {items.length ? (
              <FolderItemList
                folder={folder}
                items={items}
                thumbById={thumbById}
                onRename={onRename}
                onRemove={onRemove}
                onReorder={onReorder}
                onPlayToggle={onItemPlayToggle}
                onBuyUrl={onBuyUrl}
                onStartsSlide={onStartsSlide}
                onQrLinks={onQrLinks}
              />
            ) : null}
          </>
        )}
      </div>
    </details>
  );
}
