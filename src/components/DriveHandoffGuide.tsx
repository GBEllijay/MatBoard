import { useState, useSyncExternalStore } from 'react';
import { DriveConnectCard } from './DriveConnectCard';
import { DRIVE_HANDOFF_CHECK, DRIVE_HANDOFF_CONNECT } from '../lib/driveHandoff';
import { getDriveBindingSnapshot, subscribeDriveBinding } from '../lib/googleDrive';

export function useDriveConnected(): boolean {
  const binding = useSyncExternalStore(subscribeDriveBinding, getDriveBindingSnapshot, () => null);
  return binding !== null;
}

/** Primary step when a send needs the gym Google Drive folder. */
export function DriveHandoffGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="drive-handoff">
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        {DRIVE_HANDOFF_CONNECT}
      </button>
      {open ? <DriveConnectCard /> : null}
    </div>
  );
}

export function DriveHandoffCheck({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`btn btn--ghost${on ? ' handoff-check--on' : ''}`} onClick={onClick}>
      {DRIVE_HANDOFF_CHECK}
    </button>
  );
}
