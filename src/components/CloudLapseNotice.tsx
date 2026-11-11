import { useState } from 'react';
import {
  LAPSE_CONNECT,
  LAPSE_DOWNLOADED,
  LAPSE_PAUSED,
  LAPSE_REMOVED,
  LAPSE_WHY,
  downloadButtonLabel,
  gymFolderDownloadText,
  readCloudLapse,
  syncCloudLapse,
  type CloudLapsePhase,
} from '../lib/cloudLapse';
import { proPlusCloudUnlocked } from '../lib/proPlusCloud';

function currentPhase(): CloudLapsePhase {
  if (typeof localStorage === 'undefined') return { phase: 'hidden' };
  const active = proPlusCloudUnlocked();
  syncCloudLapse(localStorage, active);
  return readCloudLapse(localStorage, Date.now(), active);
}

/** Shown only after Plus Cloud has been on and then stopped. */
export function CloudLapseNotice() {
  const [phase, setPhase] = useState<CloudLapsePhase>(currentPhase);
  const [note, setNote] = useState('');
  if (phase.phase === 'hidden') return null;

  const download = () => {
    const blob = new Blob([gymFolderDownloadText()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'advantage-gym-folder.txt';
    link.click();
    URL.revokeObjectURL(url);
    setNote(LAPSE_DOWNLOADED);
    setPhase(currentPhase());
  };

  return (
    <section aria-label="Advantage Cloud status">
      <p>{LAPSE_PAUSED}</p>
      <p data-cloud-lapse-why="">{LAPSE_WHY}</p>
      <p>{LAPSE_CONNECT}</p>
      {phase.phase === 'download' ? (
        <button type="button" className="btn" onClick={download}>
          {downloadButtonLabel(phase.daysLeft)}
        </button>
      ) : (
        <p>{LAPSE_REMOVED}</p>
      )}
      {note ? <p role="status">{note}</p> : null}
    </section>
  );
}
