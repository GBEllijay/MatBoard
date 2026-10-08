import { useEffect, useState } from 'react';
import {
  allVisibleSelected,
  anyVisibleSelected,
  clearVisibleSelection,
  selectAllVisible,
} from '../lib/mediaSelection';
import {
  DRIVE_PICK_BACK,
  DRIVE_PICK_LOADING,
  DRIVE_PICK_STAY,
  DRIVE_PICK_TITLE,
  drivePickDoneLabel,
  drivePickEmptyCopy,
  drivePickEnterFolder,
  drivePickGoBack,
  drivePickPath,
  drivePickRootStack,
  drivePickShowsBack,
  splitDriveBrowse,
  toggleDriveSelection,
  type DriveBrowseFolder,
  type DriveBrowseMedia,
  type DrivePickKind,
} from '../lib/driveMediaPicker';
import { listFolderFiles, readDriveBinding, requestDriveToken } from '../lib/googleDrive';
import { MediaSelectBar } from './MediaSelectBar';
import { Sheet } from './Sheet';

type Crumb = { id: string; name: string };

type Props = {
  open: boolean;
  kind: DrivePickKind;
  stacked?: boolean;
  onClose: () => void;
  onDone: (files: DriveBrowseMedia[]) => void;
};

/**
 * Photos-style sheet: browse the connected gym folder, multi-select, Done.
 * Select all / Clear apply to the folder on screen. Choices from a folder you
 * already left stay selected. Bytes stay in Drive. The parent copies chosen
 * files onto this phone for playback.
 */
export function DriveMediaPicker({ open, kind, stacked = false, onClose, onDone }: Props) {
  const [stack, setStack] = useState<Crumb[]>([]);
  const [folders, setFolders] = useState<DriveBrowseFolder[]>([]);
  const [media, setMedia] = useState<DriveBrowseMedia[]>([]);
  const [selected, setSelected] = useState<DriveBrowseMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const binding = readDriveBinding();
    setSelected([]);
    setFolders([]);
    setMedia([]);
    setError('');
    setStack(drivePickRootStack(binding));
  }, [open]);

  const current = stack[stack.length - 1] ?? null;

  useEffect(() => {
    if (!open || !current) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void requestDriveToken('silent')
      .then(async (token) => {
        const access = token ?? (await requestDriveToken('consent'));
        if (!access) throw new Error('Sign in to Google Drive again to open this folder.');
        return listFolderFiles(access, current.id);
      })
      .then((files) => {
        if (cancelled) return;
        const split = splitDriveBrowse(files, kind);
        setFolders(split.folders);
        setMedia(split.media);
      })
      .catch((reason) => {
        if (cancelled) return;
        setFolders([]);
        setMedia([]);
        setError(reason instanceof Error ? reason.message : 'Google Drive could not be opened.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, current, kind]);

  const path = drivePickPath(stack);

  return (
    <Sheet
      className="sheet--dock-footer"
      open={open}
      title={DRIVE_PICK_TITLE}
      stacked={stacked}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn"
          disabled={selected.length === 0}
          onClick={() => onDone(selected)}
        >
          {drivePickDoneLabel(selected.length)}
        </button>
      }
    >
      <p className="saver-sound-hint">{DRIVE_PICK_STAY}</p>
      {path ? <p className="drive-pick__path">{path}</p> : null}
      {drivePickShowsBack(stack) ? (
        <button type="button" className="btn btn--ghost" onClick={() => setStack((prev) => drivePickGoBack(prev))}>
          {DRIVE_PICK_BACK}
        </button>
      ) : null}
      {!loading && media.length > 0 ? (
        <MediaSelectBar
          allSelected={allVisibleSelected(selected, media)}
          anySelected={anyVisibleSelected(selected, media)}
          onSelectAll={() => setSelected((prev) => selectAllVisible(prev, media))}
          onClear={() => setSelected((prev) => clearVisibleSelection(prev, media))}
        />
      ) : null}
      {loading ? (
        <p className="notes__gallery-status" role="status">
          {DRIVE_PICK_LOADING}
        </p>
      ) : null}
      {error ? (
        <p className="notes__gallery-status notes__gallery-status--empty" role="status">
          {error}
        </p>
      ) : null}
      {folders.length ? (
        <div className="drive-pick__folders" role="list">
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className="btn btn--ghost"
              onClick={() => setStack((prev) => drivePickEnterFolder(prev, folder))}
            >
              {folder.name}
            </button>
          ))}
        </div>
      ) : null}
      {media.length ? (
        <div className="drive-pick__grid" role="list">
          {media.map((item) => {
            const on = selected.some((row) => row.id === item.id);
            return (
              <button
                key={item.id}
                type="button"
                role="listitem"
                className={on ? 'drive-pick__cell is-selected' : 'drive-pick__cell'}
                aria-pressed={on}
                onClick={() => setSelected((prev) => toggleDriveSelection(prev, item))}
              >
                {item.thumbnailLink ? (
                  <img src={item.thumbnailLink} alt="" />
                ) : (
                  <span className="drive-pick__thumb" aria-hidden="true" />
                )}
                <span className="drive-pick__name">{item.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {!loading && !error && media.length === 0 ? (
        <p className="notes__gallery-status notes__gallery-status--empty" role="status">
          {drivePickEmptyCopy(kind, folders.length)}
        </p>
      ) : null}
    </Sheet>
  );
}
