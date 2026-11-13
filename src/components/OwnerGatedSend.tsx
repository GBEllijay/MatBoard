import { useMemo, useState } from 'react';
import {
  CLOUD_FORBIDDEN_MESSAGE,
  NO_HOME_MESSAGE,
  chooseDistributionHome,
  formatDuration,
  formatSize,
  selectAudienceTargets,
  selectDivisionTargets,
  submitDistribution,
  type DistributionHome,
  type DistributionTarget,
  type MemoryStore,
} from '../lib/ownerGatedDistribution';
import '../preview/ownerGated/ownerGated.css';

export type OwnerGatedSendProps = {
  roster: readonly DistributionTarget[];
  storage: MemoryStore;
  approvalRequired: boolean;
  title: string;
  lesson: string;
  dateKey: string;
  media: {
    home?: DistributionHome;
    ref: string;
    fileName: string;
    mime: string;
    size: number;
    durationMs?: number;
    thumbnailDataUrl?: string;
  } | null;
  availableHomes: { googleDrive?: boolean; oneDrive?: boolean };
  senderName?: string;
  heading?: string;
};

export function OwnerGatedSend({
  roster,
  storage,
  approvalRequired,
  title,
  lesson,
  dateKey,
  media,
  availableHomes,
  senderName = 'Instructor',
  heading = 'Send to students',
}: OwnerGatedSendProps) {
  const [selected, setSelected] = useState<string[]>(() => roster.map((row) => row.studentId));
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
  const home = chooseDistributionHome(availableHomes);
  const targets = useMemo(() => roster.filter((row) => selected.includes(row.studentId)), [roster, selected]);
  const asRoster = useMemo(() => roster.map((row) => ({ id: row.studentId, ...row })), [roster]);
  const divisions = useMemo(() => [...new Set(roster.map((row) => row.division).filter(Boolean))], [roster]);

  const toggle = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((row) => row !== id) : [...current, id]));
  };

  const send = () => {
    if (!media) {
      setStatus('Record or pick a clip first.');
      return;
    }
    const result = submitDistribution(
      {
        kind: 'review-video',
        title,
        note,
        sentBy: { name: senderName },
        dateKey,
        lesson,
        targets,
        media: {
          ...media,
          home,
          title,
          lesson,
        },
      },
      storage,
      approvalRequired,
    );
    if ('ok' in result && result.ok === false) {
      setStatus(result.error);
      return;
    }
    if ('message' in result) setStatus(result.message);
  };

  return (
    <section className="ogate__card" aria-label={heading}>
      <h2>{heading}</h2>
      {media?.thumbnailDataUrl ? <img className="ogate__thumb" src={media.thumbnailDataUrl} alt="" /> : null}
      <p className="ogate__meta">
        <strong>{title || 'Untitled review'}</strong>
        {lesson ? ` · ${lesson}` : ''}
        {media?.durationMs ? ` · ${formatDuration(media.durationMs)}` : ''}
        {media?.size ? ` · ${formatSize(media.size)}` : ''}
      </p>
      <div className="ogate__actions">
        <button type="button" className="ogate__btn--ghost" onClick={() => setSelected(selectDivisionTargets(asRoster, 'Kids Gi').map((row) => row.studentId))}>
          Kids division
        </button>
        <button type="button" className="ogate__btn--ghost" onClick={() => setSelected(selectAudienceTargets(asRoster, 'adults').map((row) => row.studentId))}>
          Adults
        </button>
        {divisions.map((division) => (
          <button
            key={division}
            type="button"
            className="ogate__btn--ghost"
            onClick={() => setSelected(selectDivisionTargets(asRoster, division).map((row) => row.studentId))}
          >
            {division}
          </button>
        ))}
      </div>
      <ul className="ogate__targets" aria-label="Students">
        {roster.map((row) => (
          <li key={row.studentId}>
            <label>
              <input type="checkbox" checked={selected.includes(row.studentId)} onChange={() => toggle(row.studentId)} />
              <span>
                {row.name}
                {row.division ? ` · ${row.division}` : ''}
                {row.kidCard ? <span className="ogate__pill">Kid card</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <label>
        Note for students
        <textarea className="ogate__note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
      </label>
      <fieldset className="ogate__homes">
        <legend>Where the video is stored</legend>
        <label>
          <input type="radio" name="ogate-home" checked={home === 'google-drive'} readOnly /> Google Drive
        </label>
        <label>
          <input type="radio" name="ogate-home" checked={home === 'onedrive'} readOnly /> OneDrive
        </label>
        <label>
          <input type="radio" name="ogate-home" checked={home === 'share-file'} readOnly /> Share file
        </label>
        <label className="is-blocked">
          <input type="radio" name="ogate-home" checked={false} disabled /> Advantage Cloud — {CLOUD_FORBIDDEN_MESSAGE}
        </label>
        {home === 'share-file' && !availableHomes.googleDrive && !availableHomes.oneDrive ? <p>{NO_HOME_MESSAGE}</p> : null}
      </fieldset>
      <div className="ogate__actions">
        <button type="button" onClick={send} disabled={!media || targets.length === 0}>
          {approvalRequired ? 'Send for owner approval' : 'Send to students'}
        </button>
      </div>
      {status ? (
        <p className="ogate__status" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}
