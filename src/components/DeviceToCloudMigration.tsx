import { useMemo, useState } from 'react';
import { cloudFingerprint } from '../lib/cloudFingerprint';
import type { CloudIndexPatch } from '../lib/cloudMediaIndex';
import {
  migrationSummaryLine,
  planDeviceMigration,
  runDeviceMigration,
  type CloudFolderSnapshot,
  type CloudIndexSave,
  type MigrationUpload,
} from '../lib/cloudMediaFolders';
import { folderById, type FolderId, type StoredPhoto } from '../lib/photoStore';
import { localDateKey } from '../lib/trainingNotesStore';
import { useLeaveWarning } from '../hooks/useCloudMediaFolders';

export const MIGRATION_TITLE = "Send this device's items to Advantage Cloud";
export const MIGRATION_HINT =
  'Copies what is saved only on this device into the gym\u2019s Advantage Cloud folders, with names, buy links, and QR links, so every phone, computer, and TV shows them. Nothing on this device is deleted. Items already sent are skipped.';
export const MIGRATION_KEEP_OPEN = 'Keep this page open until it says done.';
export const MIGRATION_GALLERY_CAUTION =
  'Gallery photos added while Advantage Cloud was on are usually already in Cloud Gallery. Sending them again can make a second copy.';

type Props = {
  deviceRows: readonly StoredPhoto[];
  snapshots: Partial<Record<FolderId, CloudFolderSnapshot>>;
  patch: (folderId: FolderId, patch: CloudIndexPatch) => Promise<CloudIndexSave>;
  onDone: () => void | Promise<void>;
  upload?: MigrationUpload;
};

const ORDER: FolderId[] = ['shop', 'events', 'gallery'];

/**
 * The one-time move for a device that built its Pro Shop and Events before
 * the folders were networked. Shows only while this device still has items
 * that are not in Cloud and this account can save their details.
 */
export function DeviceToCloudMigration({ deviceRows, snapshots, patch, onDone, upload }: Props) {
  const [running, setRunning] = useState<FolderId | null>(null);
  const [progress, setProgress] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  useLeaveWarning(running !== null);

  const dateKey = localDateKey();
  const plans = useMemo(() => {
    const out: { folderId: FolderId; count: number }[] = [];
    for (const folderId of ORDER) {
      const snapshot = snapshots[folderId];
      if (!snapshot?.canEdit) continue;
      const plan = planDeviceMigration({
        rows: deviceRows,
        folderId,
        index: snapshot.index,
        listedPaths: new Set(snapshot.listing.items.map((item) => item.path)),
        dateKey,
      });
      const count = plan.send.length + plan.relink.length;
      if (count) out.push({ folderId, count });
    }
    return out;
  }, [deviceRows, snapshots, dateKey]);

  if (!plans.length && !lines.length) return null;

  const send = async (folderIds: FolderId[]) => {
    const done: string[] = [];
    for (const folderId of folderIds) {
      const snapshot = snapshots[folderId];
      if (!snapshot) continue;
      const label = folderById(folderId).label;
      setRunning(folderId);
      setProgress(`Checking ${label}…`);
      const fingerprints = new Map<string, string>();
      for (const row of deviceRows) {
        if (row.folderId !== folderId || !row.mime.startsWith('image/') || row.blob.size === 0) continue;
        try {
          fingerprints.set(row.id, await cloudFingerprint(row.blob));
        } catch {
          /* No fingerprint: the device id still prevents a second copy. */
        }
      }
      const plan = planDeviceMigration({
        rows: deviceRows,
        folderId,
        index: snapshot.index,
        listedPaths: new Set(snapshot.listing.items.map((item) => item.path)),
        fingerprints,
        dateKey,
      });
      const summary = await runDeviceMigration({
        plan,
        folderId,
        dateKey,
        upload,
        fingerprints,
        patch: (change) => patch(folderId, change),
        onProgress: ({ done: n, total }) => {
          if (total) setProgress(`Sending ${Math.min(n + 1, total)} of ${total} to ${label}… ${MIGRATION_KEEP_OPEN}`);
        },
      });
      done.push(migrationSummaryLine(summary, label));
      setLines([...done]);
    }
    setRunning(null);
    setProgress('');
    await onDone();
  };

  const nonGallery = plans.filter((plan) => plan.folderId !== 'gallery').map((plan) => plan.folderId);
  const gallery = plans.find((plan) => plan.folderId === 'gallery');

  return (
    <section className="saver-migrate" aria-label={MIGRATION_TITLE} data-device-migration="">
      <h3 className="saver-settings__title">{MIGRATION_TITLE}</h3>
      <p className="saver-sound-hint">{MIGRATION_HINT}</p>
      {plans.map((plan) => (
        <button
          key={plan.folderId}
          type="button"
          className="btn"
          disabled={running !== null}
          data-migrate-folder={plan.folderId}
          onClick={() => void send([plan.folderId])}
        >
          Send {plan.count} {folderById(plan.folderId).label} {plan.count === 1 ? folderById(plan.folderId).itemNoun : folderById(plan.folderId).itemNounPlural}
        </button>
      ))}
      {nonGallery.length > 1 ? (
        <button type="button" className="btn" disabled={running !== null} data-migrate-all="" onClick={() => void send(nonGallery)}>
          Send Pro Shop and Events
        </button>
      ) : null}
      {gallery ? <p className="saver-sound-hint">{MIGRATION_GALLERY_CAUTION}</p> : null}
      {running ? (
        <p role="status" className="saver-folder__empty" data-migrate-progress="">
          {progress || MIGRATION_KEEP_OPEN}
        </p>
      ) : null}
      {lines.map((line) => (
        <p key={line} role="status" className="saver-folder__empty" data-migrate-result="">
          {line}
        </p>
      ))}
    </section>
  );
}
