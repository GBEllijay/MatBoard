import { useEffect, useRef, useState } from 'react';
import { gymActorForCloud } from '../lib/advantageCloudMedia';
import { readDriveBinding } from '../lib/googleDrive';
import {
  decideGymRoster,
  fetchGymRosterPrivateNotes,
  fetchGymRosterState,
  saveGymRosterPrivateNotes,
  setGymRosterTrust,
  submitGymRoster,
  type GymRosterState,
} from '../lib/gymRosterClient';
import {
  connectedRosterFolder,
  folderRosterMode,
  loadRosterFolder,
  markFolderDecided,
  readFolderDecided,
  saveRosterFolder,
  type FolderRosterLoad,
} from '../lib/gymRosterFolder';
import type { InstructorSeat } from '../lib/instructorSeats';
import { readOneDriveBinding } from '../lib/oneDrive';
import { ROSTER_BACKUP_FILE_NAME, formatRosterMergeReport, serializeRosterBackup } from '../lib/rosterBackup';
import {
  deviceRosterBackup,
  fillPrivateNotesOnDevice,
  importRosterBackupOnDevice,
  parseRosterBackupOnDevice,
} from '../lib/rosterBackupDevice';
import { normalizeRoster } from '../lib/rosterStore';

function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function localStore(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

type Props = {
  seat: InstructorSeat | null;
  /** Same gate as Export CSV (rosterSubmit). */
  canExport: boolean;
  /** Same gate as Import CSV (rosterPull). */
  canImport: boolean;
};

/**
 * Full backup, gym folder roster, and Advantage Cloud gym roster. Shown next to the CSV tools.
 * Every control renders only when this tier, seat, and connection can use it.
 */
export function RosterBackupTools({ seat, canExport, canImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const role = gymActorForCloud(seat ? 'seat' : 'owner', seat?.presetId ?? null);
  const folderMode = folderRosterMode(role);
  const folderBound = Boolean(readDriveBinding()?.folderId || readOneDriveBinding()?.folderId);
  const [folderPending, setFolderPending] = useState<FolderRosterLoad['pending']>([]);
  const [cloud, setCloud] = useState<GymRosterState | null>(null);

  const refreshCloud = async () => setCloud(await fetchGymRosterState());
  useEffect(() => {
    void refreshCloud();
  }, []);

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    try {
      setNote(await work());
    } catch (error) {
      setNote(error instanceof Error && error.message ? error.message : 'That did not finish. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onImportBackup = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    void run(async () => {
      const parsed = parseRosterBackupOnDevice(await file.text());
      if (!parsed.ok) return parsed.error;
      return formatRosterMergeReport(importRosterBackupOnDevice(parsed.backup, parsed.newerSchema));
    });
  };

  const saveFolder = () =>
    run(async () => {
      const io = await connectedRosterFolder();
      if (!io) return 'Connect the gym folder in Settings first.';
      const mode = await saveRosterFolder(io, {
        role,
        who: seat ? seat.id : 'owner',
        local: deviceRosterBackup('shared'),
        now: new Date(),
        normalize: normalizeRoster,
      });
      if (mode === 'pending') return 'Sent to the gym folder for the head coach to approve.';
      return 'Gym roster saved to the gym folder. Private notes and photos stay on this device.';
    });

  const loadFolder = () =>
    run(async () => {
      const io = await connectedRosterFolder();
      if (!io) return 'Connect the gym folder in Settings first.';
      const loaded = await loadRosterFolder(io, role, readFolderDecided(localStore()), normalizeRoster);
      setFolderPending(loaded.pending);
      const waiting = loaded.pending.length ? ` ${loaded.pending.length} coach change(s) waiting below.` : '';
      if (!loaded.master) return `No gym roster in the folder yet.${waiting}`;
      return `${formatRosterMergeReport(importRosterBackupOnDevice(loaded.master, loaded.newerSchema))}${waiting}`;
    });

  const decideFolder = (id: string, approve: boolean) =>
    run(async () => {
      const row = folderPending.find((item) => item.id === id);
      if (!row) return '';
      const text = approve ? formatRosterMergeReport(importRosterBackupOnDevice(row.backup, row.newerSchema)) : 'Skipped. The file stays in the folder.';
      markFolderDecided(localStore(), id);
      setFolderPending((list) => list.filter((item) => item.id !== id));
      return approve ? `${text} Save to gym folder to share it.` : text;
    });

  const sendCloud = () =>
    run(async () => {
      const sent = await submitGymRoster(deviceRosterBackup('shared'));
      if (!sent.ok) return sent.error;
      const notes = deviceRosterBackup('coach-private').privateNotes ?? {};
      if (Object.keys(notes).length) await saveGymRosterPrivateNotes(notes);
      await refreshCloud();
      if (sent.data.pending) return 'Sent to Advantage Cloud. The head coach approves it before it joins the gym roster.';
      return sent.data.report ? formatRosterMergeReport(sent.data.report) : 'Gym roster updated.';
    });

  const pullCloud = () =>
    run(async () => {
      const state = await fetchGymRosterState();
      setCloud(state);
      if (!state) return 'Advantage Cloud did not answer. Try again.';
      let text = state.master ? formatRosterMergeReport(importRosterBackupOnDevice(state.master)) : 'No gym roster in Advantage Cloud yet.';
      const mine = await fetchGymRosterPrivateNotes();
      // Only this author's own notes come back to this device.
      const own = mine ? mine.notes[mine.author] : undefined;
      const added = own ? fillPrivateNotesOnDevice(own) : 0;
      if (added) text += ` ${added} private note(s) restored.`;
      return text;
    });

  const decideCloud = (id: string, decision: 'approve' | 'reject') =>
    run(async () => {
      const result = await decideGymRoster(id, decision);
      await refreshCloud();
      if (!result.ok) return result.error;
      return decision === 'approve' ? 'Approved. It is in the gym roster now.' : 'Rejected. Nothing changed in the gym roster.';
    });

  const toggleTrust = () =>
    run(async () => {
      if (!cloud) return '';
      const result = await setGymRosterTrust(!cloud.trustMode);
      await refreshCloud();
      if (!result.ok) return result.error;
      return result.data.trustMode ? 'Trust mode on. Coach seats update the gym roster without approval.' : 'Trust mode off. Coach seat changes wait for approval.';
    });

  const showFolder = folderBound && folderMode !== 'hidden' && (canExport || canImport);
  const cloudPending = cloud?.role.canApprove
    ? cloud.pending.filter((row) => row.status === 'pending' && !(seat && row.submittedBy.kind === 'seat' && row.submittedBy.seatId === seat.id))
    : [];
  const ownWaiting = cloud && !cloud.role.canApprove ? cloud.pending.filter((row) => row.status === 'pending').length : 0;

  if (!canExport && !canImport) return null;

  return (
    <div className="roster__backup">
      <div className="roster__csv-actions">
        {canExport ? (
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => downloadJson(ROSTER_BACKUP_FILE_NAME, serializeRosterBackup(deviceRosterBackup('coach-private')))}
          >
            Export full backup
          </button>
        ) : null}
        {canImport ? (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
            Import full backup
          </button>
        ) : null}
        {showFolder && canExport ? (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void saveFolder()}>
            {folderMode === 'pending' ? 'Send to gym folder' : 'Save to gym folder'}
          </button>
        ) : null}
        {showFolder && canImport ? (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void loadFolder()}>
            Load from gym folder
          </button>
        ) : null}
        {cloud?.role.canSubmit && canExport ? (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void sendCloud()}>
            Send to Advantage Cloud
          </button>
        ) : null}
        {cloud?.role.canRead && canImport ? (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void pullCloud()}>
            Get gym roster
          </button>
        ) : null}
      </div>
      <p className="roster__csv-hint">
        A full backup keeps everything on this device, private coach notes included. Keep it private. Importing only adds
        students and fills blanks.
      </p>
      {cloud?.role.isOwner ? (
        <label className="roster__trust">
          <input type="checkbox" checked={cloud.trustMode} disabled={busy} onChange={() => void toggleTrust()} /> Trust
          coach seats (skip approval)
        </label>
      ) : null}
      {ownWaiting ? <p className="roster__csv-hint">{ownWaiting} roster change(s) waiting for the head coach.</p> : null}
      {cloudPending.length || folderPending.length ? (
        <ul className="roster__review" aria-label="Roster changes to review">
          {cloudPending.map((row) => (
            <li key={row.id}>
              <span>
                {row.summary.students} student(s): {row.summary.names.slice(0, 4).join(', ')}
              </span>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void decideCloud(row.id, 'approve')}>
                Approve
              </button>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void decideCloud(row.id, 'reject')}>
                Reject
              </button>
            </li>
          ))}
          {folderPending.map((row) => (
            <li key={row.id}>
              <span>
                {row.backup.roster.students.length} student(s) from {row.name}
              </span>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void decideFolder(row.id, true)}>
                Approve
              </button>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void decideFolder(row.id, false)}>
                Reject
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {note ? (
        <p className="roster__csv-summary" role="status">
          {note}
        </p>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Import full roster backup"
        onChange={(event) => {
          onImportBackup(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
}
