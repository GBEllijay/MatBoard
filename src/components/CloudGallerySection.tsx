import { useEffect, useRef, useState } from 'react';
import { CLOUD_MEDIA_EVENT } from '../lib/advantageCloudMedia';
import { advantageCloudLaneStore } from '../lib/advantageCloudLanes';
import {
  CLOUD_FOLDERS,
  CLOUD_FOLDERS_HINT,
  CLOUD_FOLDERS_TITLE,
  CLOUD_FOLDER_EMPTY,
  CLOUD_GALLERY_FOLDER_ACCEPT,
  CLOUD_SIDE_FOLDER_ACCEPT,
  cloudFolderInfo,
  gallerySlideshowItems,
  listCloudFolder,
  uploadToCloudFolder,
  type CloudFolderId,
  type CloudFolderItem,
  type CloudFolderListing,
} from '../lib/advantageCloudFolders';
import {
  CLOUD_DELETE_CONFIRM_PHOTO,
  CLOUD_DELETE_CONFIRM_VIDEO,
  CLOUD_DELETE_DONE,
  CLOUD_DELETE_FAILED,
  deleteCloudMedia,
} from '../lib/cloudVideoCleanup';
import type { ApprovalItem, ApprovalLaneStore } from '../lib/approvalLanes';
import { localDateKey } from '../lib/trainingNotesStore';
import { CloudDeleteConfirm } from './CloudDeleteConfirm';
import { CloudEventsFromCloud } from './CloudEventsPanel';
import { CloudVideoCleanup } from './CloudVideoCleanup';

/** Seconds a photo stays up when the Cloud Gallery plays as a slideshow. */
export const CLOUD_SLIDE_PHOTO_SEC = 8;
/** Photo thumbnails fetched up front. The rest load when the slideshow reaches them. */
const THUMB_LIMIT = 60;

export const CLOUD_GALLERY_TITLE = CLOUD_FOLDERS_TITLE;
export const CLOUD_GALLERY_EMPTY = 'No photos or videos in Gallery yet.';
export const CLOUD_GALLERY_HINT = CLOUD_FOLDERS_HINT;
export const CLOUD_DELETE_CONFIRM_FILE = 'Delete this file from Advantage Cloud? This cannot be undone.';
export const CLOUD_DRIVE_COPY_LABEL = 'Copy from Google Drive';
export const CLOUD_FOLDER_WAITS_FOR_OWNER = "Approval is on. What you upload shows here after the owner approves it in Review Inbox.";
export const CLOUD_DRIVE_CONNECT_LABEL = 'Connect Google Drive to copy';

type LoadFolder = (folder: CloudFolderId) => Promise<CloudFolderListing | null | { error: string }>;
type UploadFolder = (input: { folder: CloudFolderId; file: File; dateKey: string }) => ReturnType<typeof uploadToCloudFolder>;

type Props = {
  /** Tests pass a fake folder list. The page uses the signed-in Cloud. */
  load?: LoadFolder;
  store?: ApprovalLaneStore;
  /** Tests can force Delete on or off. The page uses what the server reports. */
  canManage?: boolean;
  remove?: typeof deleteCloudMedia;
  upload?: UploadFolder;
  /** Opens the existing Google Drive picker for Gallery. Picks are copied into Advantage Cloud Gallery. */
  onCopyFromDrive?: () => void;
  /** This device has Google Drive connected. When false the button offers to connect first. */
  driveConnected?: boolean;
  /** Tests can open a folder straight away. */
  initialFolder?: CloudFolderId | null;
};

const defaultLoad: LoadFolder = (folder) => listCloudFolder({ folder });
const defaultUpload: UploadFolder = (input) => uploadToCloudFolder(input);

function asLaneItem(item: CloudFolderItem): ApprovalItem {
  return { ...item, kind: item.kind === 'photo' ? 'photo' : 'video' };
}

/**
 * Advantage Cloud as folders on the Gallery page (/slideshow?folder=gallery).
 * Gallery, Pro Shop, Events, Schedule: tap one to open it. Gallery is what the
 * TV slideshow plays (approved photos and videos only). Renders nothing when
 * this device is not on Advantage Cloud.
 */
export function CloudGallerySection({
  load = defaultLoad,
  store,
  canManage,
  remove = deleteCloudMedia,
  upload = defaultUpload,
  onCopyFromDrive,
  driveConnected,
  initialFolder = null,
}: Props) {
  const storeRef = useRef<ApprovalLaneStore>(store ?? advantageCloudLaneStore());
  const [listings, setListings] = useState<Partial<Record<CloudFolderId, CloudFolderListing>>>({});
  const [checked, setChecked] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState('');
  const [openFolder, setOpenFolder] = useState<CloudFolderId | null>(initialFolder);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [playList, setPlayList] = useState<CloudFolderItem[]>([]);
  const [playing, setPlaying] = useState<number | null>(null);
  const [slideUrl, setSlideUrl] = useState<string>('');
  const [slideNote, setSlideNote] = useState('');
  const [pendingDelete, setPendingDelete] = useState<CloudFolderItem | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const urls = useRef<string[]>([]);

  const loadFolder = async (folder: CloudFolderId): Promise<'hidden' | 'ok' | 'error'> => {
    const result = await load(folder);
    if (result === null) return 'hidden';
    if ('error' in result) {
      setError(result.error);
      return 'error';
    }
    setListings((current) => ({ ...current, [folder]: result }));
    return 'ok';
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const gallery = await load('gallery');
      if (cancelled) return;
      setChecked(true);
      if (gallery === null) {
        setHidden(true);
        return;
      }
      setHidden(false);
      if ('error' in gallery) {
        setError(gallery.error);
        return;
      }
      setError('');
      setListings((current) => ({ ...current, gallery }));
      for (const folder of CLOUD_FOLDERS) {
        if (folder.id === 'gallery') continue;
        const listed = await load(folder.id);
        if (cancelled) return;
        if (listed && !('error' in listed)) setListings((current) => ({ ...current, [folder.id]: listed }));
      }
    };
    void run();
    const onCloud = () => void run();
    window.addEventListener(CLOUD_MEDIA_EVENT, onCloud);
    return () => {
      cancelled = true;
      window.removeEventListener(CLOUD_MEDIA_EVENT, onCloud);
    };
  }, [load]);

  const openItems = openFolder ? listings[openFolder]?.items ?? null : null;

  useEffect(() => {
    if (!openItems?.length) return;
    let cancelled = false;
    const photos = openItems.filter((item) => item.kind === 'photo' && !thumbs[item.path]).slice(0, THUMB_LIMIT);
    void (async () => {
      for (const item of photos) {
        const blob = await storeRef.current.open(asLaneItem(item));
        if (cancelled || !blob) continue;
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        setThumbs((current) => ({ ...current, [item.path]: url }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Thumbnails load once per opened list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItems]);

  useEffect(() => {
    return () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
    };
  }, []);

  const current = playing !== null ? playList[playing] ?? null : null;

  useEffect(() => {
    if (!current) {
      setSlideUrl('');
      return;
    }
    let cancelled = false;
    setSlideNote('');
    const ready = thumbs[current.path];
    if (ready) {
      setSlideUrl(ready);
      return;
    }
    setSlideUrl('');
    void storeRef.current.open(asLaneItem(current)).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setSlideNote('That file could not be opened from Advantage Cloud.');
        return;
      }
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      setSlideUrl(url);
    });
    return () => {
      cancelled = true;
    };
    // Re-open only when the slide changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.path]);

  const advance = () => {
    if (!playList.length || playing === null) return;
    setPlaying((playing + 1) % playList.length);
  };

  useEffect(() => {
    if (!current || current.kind !== 'photo' || !slideUrl) return;
    const timer = setTimeout(advance, CLOUD_SLIDE_PHOTO_SEC * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.path, slideUrl]);

  if (hidden) return null;

  const listing = openFolder ? listings[openFolder] ?? null : null;
  const manage = canManage ?? listing?.canDelete ?? false;
  const canUpload = canManage ?? listing?.canUpload ?? false;
  const slideshow = gallerySlideshowItems(listings.gallery?.items ?? []);

  const play = (list: CloudFolderItem[], start: number) => {
    setPlayList(list);
    setPlaying(start);
  };

  const openFile = async (item: CloudFolderItem) => {
    if (item.kind !== 'file') {
      const viewable = (listing?.items ?? []).filter((row) => row.kind !== 'file');
      play(viewable, Math.max(0, viewable.indexOf(item)));
      return;
    }
    const blob = await storeRef.current.open(asLaneItem(item));
    if (!blob) {
      setNote('That file could not be opened from Advantage Cloud.');
      return;
    }
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    window.open(url, '_blank', 'noopener');
  };

  const confirmDelete = async () => {
    if (!pendingDelete || !openFolder) return;
    setBusy(true);
    const target = pendingDelete;
    const result = await remove({ paths: [target.path] });
    setBusy(false);
    if (!result.ok) {
      setNote(result.message || CLOUD_DELETE_FAILED);
      return;
    }
    setNote(CLOUD_DELETE_DONE);
    setPendingDelete(null);
    if (current?.path === target.path) setPlaying(null);
    setListings((all) => {
      const folder = all[openFolder];
      if (!folder) return all;
      return { ...all, [openFolder]: { ...folder, items: folder.items.filter((item) => item.path !== target.path) } };
    });
  };

  const onPicked = async (files: readonly File[]) => {
    if (!openFolder || !files.length) return;
    const folder = openFolder;
    const label = cloudFolderInfo(folder).label;
    setBusy(true);
    let added = 0;
    let waiting = 0;
    let repeats = 0;
    let failed = '';
    for (const [index, file] of files.entries()) {
      setNote(`Uploading ${index + 1} of ${files.length} to ${label}…`);
      const result = await upload({ folder, file, dateKey: localDateKey() });
      if (!result.ok) {
        failed = result.message;
        continue;
      }
      if (result.duplicate) repeats += 1;
      else if (result.lane === 'pending') waiting += 1;
      else added += 1;
    }
    setBusy(false);
    const parts: string[] = [];
    if (added) parts.push(`Added ${added} to ${label}.`);
    if (repeats) parts.push(`${repeats} already in ${label}, skipped.`);
    if (waiting) parts.push(`${waiting} wait for the owner's approval in Review Inbox.`);
    if (failed) parts.push(`${files.length - added - waiting - repeats} did not upload: ${failed}`);
    setNote(parts.join(' '));
    await loadFolder(folder);
  };

  const tile = (item: CloudFolderItem) => (
    <li key={item.path} className="cloud-gallery__tile" data-cloud-gallery-item={item.path} data-cloud-folder-item={item.folder}>
      <button type="button" className="cloud-gallery__open" onClick={() => void openFile(item)} aria-label={`Open ${item.name}`}>
        {item.kind === 'photo' && thumbs[item.path] ? (
          <img src={thumbs[item.path]} alt={item.name} loading="lazy" />
        ) : (
          <span className="cloud-gallery__glyph" aria-hidden="true">
            {item.kind === 'video' ? '▶' : item.kind === 'file' ? 'PDF' : '▢'}
          </span>
        )}
        <span className="cloud-gallery__name">{item.name}</span>
        {item.dateKey ? <span className="cloud-gallery__date">{item.dateKey}</span> : null}
      </button>
      {manage ? (
        <button
          type="button"
          className="btn btn--ghost cloud-gallery__delete"
          data-cloud-delete={item.path}
          onClick={() => {
            setNote('');
            setPendingDelete(item);
          }}
        >
          Delete
        </button>
      ) : null}
    </li>
  );

  const folderGrid = (
    <>
      <p className="cloud-gallery__hint">{CLOUD_FOLDERS_HINT}</p>
      <ul className="cloud-folders" aria-label="Advantage Cloud folders">
        {CLOUD_FOLDERS.map((folder) => {
          const count = listings[folder.id]?.items.length;
          return (
            <li key={folder.id}>
              <button
                type="button"
                className={`cloud-folders__open${folder.id === 'gallery' ? ' cloud-folders__open--gallery' : ''}`}
                data-cloud-folder-open={folder.id}
                onClick={() => {
                  setNote('');
                  setOpenFolder(folder.id);
                  void loadFolder(folder.id);
                }}
              >
                <span className="cloud-folders__icon" aria-hidden="true" />
                <span className="cloud-folders__label">{folder.label}</span>
                <span className="cloud-folders__count">
                  {typeof count === 'number' ? `${count} ${count === 1 ? 'file' : 'files'}` : '…'}
                </span>
                {folder.id === 'gallery' ? <span className="cloud-folders__badge">Plays on TV</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      {slideshow.length ? (
        <button type="button" className="btn" data-cloud-gallery-play="" onClick={() => play(slideshow, 0)}>
          Play Gallery slideshow ({slideshow.length})
        </button>
      ) : null}
    </>
  );

  const openView = openFolder ? (
    <div className="cloud-folder" data-cloud-folder={openFolder}>
      <div className="cloud-folder__bar">
        <button type="button" className="btn btn--ghost" data-cloud-folder-back="" onClick={() => setOpenFolder(null)}>
          ‹ All folders
        </button>
        <h3>{cloudFolderInfo(openFolder).label}</h3>
      </div>
      <p className="cloud-gallery__hint">{cloudFolderInfo(openFolder).hint}</p>
      {canUpload && listing?.uploadLane === 'pending' ? (
        <p className="cloud-gallery__hint" data-cloud-folder-approval="">
          {CLOUD_FOLDER_WAITS_FOR_OWNER}
        </p>
      ) : null}
      <div className="cloud-folder__actions">
        {openFolder === 'gallery' && slideshow.length ? (
          <button type="button" className="btn" data-cloud-gallery-play="" onClick={() => play(slideshow, 0)}>
            Play Gallery slideshow ({slideshow.length})
          </button>
        ) : null}
        {canUpload ? (
          <button type="button" className="btn" data-cloud-folder-upload={openFolder} disabled={busy} onClick={() => fileInput.current?.click()}>
            Upload to {cloudFolderInfo(openFolder).label}
          </button>
        ) : null}
        {openFolder === 'gallery' && canUpload && onCopyFromDrive ? (
          <button type="button" className="btn btn--ghost" data-cloud-drive-copy={driveConnected ? 'ready' : 'connect'} disabled={busy} onClick={onCopyFromDrive}>
            {driveConnected ? CLOUD_DRIVE_COPY_LABEL : CLOUD_DRIVE_CONNECT_LABEL}
          </button>
        ) : null}
      </div>
      {canUpload ? (
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          data-cloud-folder-input={openFolder}
          accept={openFolder === 'gallery' ? CLOUD_GALLERY_FOLDER_ACCEPT : CLOUD_SIDE_FOLDER_ACCEPT}
          onChange={(event) => {
            const files = [...(event.currentTarget.files ?? [])];
            event.currentTarget.value = '';
            void onPicked(files);
          }}
        />
      ) : null}
      {!listing ? <p role="status">Opening {cloudFolderInfo(openFolder).label}…</p> : null}
      {listing && listing.items.length === 0 ? (
        <p data-cloud-gallery-empty="">{openFolder === 'gallery' ? CLOUD_GALLERY_EMPTY : CLOUD_FOLDER_EMPTY}</p>
      ) : null}
      {listing && listing.items.length ? (
        <ul className="cloud-gallery__grid" aria-label={`${cloudFolderInfo(openFolder).label} files`}>
          {listing.items.map(tile)}
        </ul>
      ) : null}
      {openFolder === 'gallery' && manage ? <CloudVideoCleanup /> : null}
      {openFolder === 'events' && listing ? (
        <CloudEventsFromCloud
          tiles={listing.items
            .filter((item) => item.kind === 'photo')
            .map((item) => ({ path: item.path, label: item.name, thumb: thumbs[item.path] }))}
        />
      ) : null}
    </div>
  ) : null;

  return (
    <section className="cloud-gallery" aria-label={CLOUD_GALLERY_TITLE} data-cloud-gallery="">
      <h2>{CLOUD_GALLERY_TITLE}</h2>
      {!checked ? <p role="status">Checking Advantage Cloud…</p> : null}
      {error ? (
        <p role="alert" className="cloud-gallery__error" data-cloud-gallery-error="">
          {error}
        </p>
      ) : null}
      {checked && !error ? (openFolder ? openView : folderGrid) : null}
      {pendingDelete ? (
        <CloudDeleteConfirm
          title="Delete from Advantage Cloud"
          body={
            pendingDelete.kind === 'photo'
              ? CLOUD_DELETE_CONFIRM_PHOTO
              : pendingDelete.kind === 'video'
                ? CLOUD_DELETE_CONFIRM_VIDEO
                : CLOUD_DELETE_CONFIRM_FILE
          }
          busy={busy}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
      {note ? (
        <p role="status" data-cloud-delete-note="" data-cloud-folder-note="">
          {note}
        </p>
      ) : null}
      {current ? (
        <div className="cloud-gallery__player" role="dialog" aria-label="Advantage Cloud slideshow" data-cloud-slide={current.path}>
          {slideUrl ? (
            current.kind === 'photo' ? (
              <img src={slideUrl} alt={current.name} />
            ) : (
              <video src={slideUrl} autoPlay controls playsInline onEnded={advance} />
            )
          ) : (
            <p role="status">{slideNote || 'Opening from Advantage Cloud…'}</p>
          )}
          <div className="cloud-gallery__controls">
            <button type="button" className="btn btn--ghost" onClick={() => setPlaying(((playing ?? 0) - 1 + playList.length) % Math.max(1, playList.length))}>
              Previous
            </button>
            <span data-cloud-slide-count="">
              {(playing ?? 0) + 1} of {playList.length}
            </span>
            <button type="button" className="btn btn--ghost" onClick={advance}>
              Next
            </button>
            <button type="button" className="btn" onClick={() => setPlaying(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
