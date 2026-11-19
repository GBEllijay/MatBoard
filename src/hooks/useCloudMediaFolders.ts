import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CLOUD_MEDIA_EVENT, readCloudBearer } from '../lib/advantageCloudMedia';
import { listCloudFolder } from '../lib/advantageCloudFolders';
import { advantageCloudLaneStore } from '../lib/advantageCloudLanes';
import { deleteCloudMedia } from '../lib/cloudVideoCleanup';
import { cloudUploadQueue } from '../lib/cloudUploadQueueInstance';
import { applyCloudIndexPatch, type CloudIndexPatch } from '../lib/cloudMediaIndex';
import {
  NETWORKED_FOLDERS,
  chooseMediaBacking,
  cloudFolderOfDevice,
  cloudPathOfRowId,
  cloudRowsForFolder,
  detailsPatchOf,
  patchCloudMediaIndex,
  readCloudMediaIndex,
  reorderPatch,
  type CloudFolderSnapshot,
  type CloudIndexSave,
  type MediaBacking,
} from '../lib/cloudMediaFolders';
import type { FolderId, StoredPhoto } from '../lib/photoStore';

/** Other devices' changes show up within this long while the page is open. */
const CLOUD_REFRESH_MS = 60_000;

export type CloudMediaFolders = {
  backing: MediaBacking;
  /** True until the first answer from Cloud (or when this device is not on Cloud). */
  checking: boolean;
  snapshots: Partial<Record<FolderId, CloudFolderSnapshot>>;
  rows: StoredPhoto[];
  error: string;
  clearError: () => void;
  reload: () => Promise<void>;
  canUpload: (folderId: FolderId) => boolean;
  canEdit: (folderId: FolderId) => boolean;
  canDelete: (folderId: FolderId) => boolean;
  update: (folderId: FolderId, rowId: string, fields: Partial<StoredPhoto>) => Promise<boolean>;
  reorder: (folderId: FolderId, orderedIds: string[]) => Promise<boolean>;
  remove: (folderId: FolderId, rowId: string) => Promise<boolean>;
  patch: (folderId: FolderId, patch: CloudIndexPatch) => Promise<CloudIndexSave>;
};

/**
 * The networked top folders. `enabled` is "this license has Advantage Cloud";
 * the hook also needs this device's Cloud sign-in and a good answer.
 */
export function useCloudMediaFolders(enabled: boolean): CloudMediaFolders {
  const [snapshots, setSnapshots] = useState<Partial<Record<FolderId, CloudFolderSnapshot>>>({});
  const [answered, setAnswered] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const loading = useRef(false);
  const again = useRef(false);
  const signedIn = enabled && Boolean(readCloudBearer());

  const reload = useCallback(async () => {
    if (!enabled || !readCloudBearer()) {
      setAnswered(false);
      setChecking(false);
      return;
    }
    if (loading.current) {
      again.current = true;
      return;
    }
    loading.current = true;
    try {
      do {
        again.current = false;
        const next: Partial<Record<FolderId, CloudFolderSnapshot>> = {};
        let off = false;
        let failed = '';
        await Promise.all(
          NETWORKED_FOLDERS.map(async (folderId) => {
            const folder = cloudFolderOfDevice(folderId);
            const [listing, index] = await Promise.all([listCloudFolder({ folder }), readCloudMediaIndex({ folder })]);
            if (listing === null || index === null) {
              off = true;
              return;
            }
            if ('error' in listing) {
              failed = listing.error;
              return;
            }
            if ('error' in index) {
              failed = index.error;
              return;
            }
            next[folderId] = { folderId, listing, index: index.index, canEdit: index.canEdit };
          }),
        );
        if (off) {
          setAnswered(false);
        } else if (failed) {
          // Keep what was showing. A first-load failure keeps this device's folders.
          setError(failed);
        } else {
          setSnapshots(next);
          setAnswered(true);
          setError('');
        }
      } while (again.current);
    } finally {
      loading.current = false;
      setChecking(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
    if (!enabled) return;
    const onCloud = () => void reload();
    window.addEventListener(CLOUD_MEDIA_EVENT, onCloud);
    window.addEventListener('focus', onCloud);
    const timer = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') void reload();
    }, CLOUD_REFRESH_MS);
    // Queued uploads finishing: refresh lists and counters once the queue settles.
    let busy = cloudUploadQueue.pendingCount() > 0;
    const offQueue = cloudUploadQueue.subscribe(() => {
      const now = cloudUploadQueue.pendingCount() > 0;
      if (busy && !now) void reload();
      busy = now;
    });
    return () => {
      window.removeEventListener(CLOUD_MEDIA_EVENT, onCloud);
      window.removeEventListener('focus', onCloud);
      window.clearInterval(timer);
      offQueue();
    };
  }, [enabled, reload]);

  const backing = chooseMediaBacking({ cloudEntitled: enabled, signedIn, cloudAnswered: answered });

  const rows = useMemo(
    () => NETWORKED_FOLDERS.flatMap((folderId) => (snapshots[folderId] ? cloudRowsForFolder(snapshots[folderId]!) : [])),
    [snapshots],
  );

  const patch = useCallback(async (folderId: FolderId, change: CloudIndexPatch): Promise<CloudIndexSave> => {
    const current = snapshots[folderId];
    if (current) {
      // Show the change right away; the server answer replaces it.
      const local = applyCloudIndexPatch(current.index, change, new Date());
      if (local.ok) setSnapshots((all) => ({ ...all, [folderId]: { ...current, index: local.index } }));
    }
    const saved = await patchCloudMediaIndex({ folder: cloudFolderOfDevice(folderId), patch: change });
    if (saved.ok) {
      setSnapshots((all) => (all[folderId] ? { ...all, [folderId]: { ...all[folderId]!, index: saved.index } } : all));
    } else {
      setError(saved.message);
      void reload();
    }
    return saved;
  }, [snapshots, reload]);

  const update = useCallback(async (folderId: FolderId, rowId: string, fields: Partial<StoredPhoto>) => {
    const path = cloudPathOfRowId(rowId);
    if (!path) return false;
    return (await patch(folderId, { items: { [path]: detailsPatchOf(fields) } })).ok;
  }, [patch]);

  const reorder = useCallback(async (folderId: FolderId, orderedIds: string[]) => (await patch(folderId, reorderPatch(orderedIds))).ok, [patch]);

  const remove = useCallback(async (folderId: FolderId, rowId: string) => {
    const path = cloudPathOfRowId(rowId);
    if (!path) return false;
    const result = await deleteCloudMedia({ paths: [path] });
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    await patch(folderId, { items: { [path]: null } });
    await reload();
    return true;
  }, [patch, reload]);

  return {
    backing,
    checking: enabled && signedIn && checking,
    snapshots,
    rows,
    error,
    clearError: () => setError(''),
    reload,
    canUpload: (folderId) => snapshots[folderId]?.listing.canUpload === true,
    canEdit: (folderId) => snapshots[folderId]?.canEdit === true,
    canDelete: (folderId) => snapshots[folderId]?.listing.canDelete === true,
    update,
    reorder,
    remove,
    patch,
  };
}

/** Thumbnails and slides kept in memory at once. Older ones are let go. */
const CLOUD_URL_CACHE = 48;

/**
 * Object URLs for Cloud rows, read only when wanted (the slide on screen, the
 * next few, and the open folder's list), so a TV never pulls a whole library into memory.
 * Returns a map keyed by row id, like the device thumbnails.
 */
export function useCloudRowUrls(rows: readonly StoredPhoto[], wantedIds: readonly string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const cache = useRef(new Map<string, string>());
  const failed = useRef(new Set<string>());
  const store = useRef(advantageCloudLaneStore());
  const wantedKey = wantedIds.join('|');

  // A fresh folder list gives files that failed to open another try.
  useEffect(() => {
    failed.current.clear();
  }, [rows]);

  useEffect(() => {
    let cancelled = false;
    const byId = new Map(rows.map((row) => [row.id, row]));
    void (async () => {
      for (const id of wantedIds) {
        if (cancelled) return;
        if (cache.current.has(id) || failed.current.has(id)) continue;
        const row = byId.get(id);
        if (!row?.cloudPath) continue;
        const blob = await store.current.open({
          provider: 'advantage-cloud',
          source: 'gallery',
          lane: 'approved',
          path: row.cloudPath,
          name: row.label,
          dateKey: '',
          mime: row.mime,
          size: 0,
          kind: row.mime.startsWith('video/') ? 'video' : 'photo',
        });
        if (cancelled) return;
        if (!blob) {
          failed.current.add(id);
          continue;
        }
        cache.current.set(id, URL.createObjectURL(blob));
        // Drop the oldest entries that are not wanted right now.
        const keep = new Set(wantedIds);
        for (const [oldId, url] of cache.current) {
          if (cache.current.size <= CLOUD_URL_CACHE) break;
          if (keep.has(oldId)) continue;
          URL.revokeObjectURL(url);
          cache.current.delete(oldId);
        }
        setUrls(Object.fromEntries(cache.current));
      }
    })();
    return () => {
      cancelled = true;
    };
    // wantedKey stands in for wantedIds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey, rows]);

  useEffect(() => {
    const held = cache.current;
    return () => {
      for (const url of held.values()) URL.revokeObjectURL(url);
      held.clear();
    };
  }, []);

  return urls;
}

/** Ask before closing the tab while uploads are still going. */
export function useLeaveWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [active]);
}
