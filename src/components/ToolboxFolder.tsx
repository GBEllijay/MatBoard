import type { FolderConfig, FolderId, StoredPhoto } from '../lib/photoStore';
import { FolderItemList } from './FolderItemList';

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
  onClear?: () => Promise<void>;
  onRename: (id: string, label: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
  onItemPlayToggle: (id: string, enabled: boolean) => Promise<void>;
  onBuyUrl?: (id: string, buyUrl: string) => Promise<void>;
  onStartsSlide?: (id: string, startsSlide: boolean) => Promise<void>;
  notice?: string;
  addDisabled?: boolean;
};

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
  onClear,
  onRename,
  onRemove,
  onReorder,
  onItemPlayToggle,
  onBuyUrl,
  onStartsSlide,
  notice,
  addDisabled,
}: Props) {
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
        <span className="saver-folder__title">
          {folder.label}
          {folder.ready ? null : <small>Coming soon</small>}
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
              />
            ) : null}
          </>
        )}
      </div>
    </details>
  );
}
