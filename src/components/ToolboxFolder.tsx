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
  onClear?: () => Promise<void>;
  onRename: (id: string, label: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
};

/** Shared Owner’s Toolbox folder chrome: play toggle + ordered list (Gallery first; Videos / Pro Shop / Events plug in here). */
export function ToolboxFolder({
  folder,
  open,
  playEnabled,
  items,
  thumbById,
  onToggle,
  onPlayToggle,
  onAdd,
  onClear,
  onRename,
  onRemove,
  onReorder,
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
            {onAdd ? (
              <button type="button" className="btn" onClick={onAdd}>
                {folder.addLabel}
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
              />
            ) : null}
          </>
        )}
      </div>
    </details>
  );
}
