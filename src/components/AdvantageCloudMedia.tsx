import { useEffect, useState } from 'react';
import {
  CLOUD_MEDIA_EVENT,
  CLOUD_SAVED_MESSAGE,
  CLOUD_SENT_FOR_APPROVAL,
  cloudUsageLine,
  notifyCloudMedia,
  readCloudBearer,
  readCloudMediaHome,
  setCloudUploadReady,
  setCloudReplayPending,
  uploadAdvantageCloudFile,
  writeCloudMediaHome,
  type CloudFileRow,
  type CloudMediaHome,
  type CloudStatusBody,
  type PendingReplayRow,
} from '../lib/advantageCloudMedia';
import { isDailyPhoto, uploadDailyMediaFile } from '../lib/dailyOwnerUpload';
import { MEDIA_LIBRARY_ACCEPT } from '../lib/mediaPicker';
import { CLOUD_STUDENT_LICENSE_HINT } from '../lib/storageCopy';
import { useCurrentSeat } from './SeatSessionBar';

type Purpose = 'daily-video' | 'lesson';

type Props = {
  purpose: Purpose;
  dateKey: string;
  /** Lesson plan text. Saved when this page is set to Advantage Cloud. */
  planJson?: string;
};

type Player = { url: string; name: string; kind: 'video' | 'image' };

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function authHeaders(): HeadersInit | null {
  const token = readCloudBearer();
  if (!token) return null;
  return { authorization: `Bearer ${token}` };
}

/**
 * Advantage Cloud for daily videos or lesson-plan media.
 * Renders nothing unless this signed-in license has Plus Cloud.
 */
export function AdvantageCloudPanel({ purpose, dateKey, planJson = '' }: Props) {
  const ownerSession = useCurrentSeat() === null;
  const [status, setStatus] = useState<CloudStatusBody | null>(null);
  const [files, setFiles] = useState<CloudFileRow[]>([]);
  const [home, setHome] = useState<CloudMediaHome>('device');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [player, setPlayer] = useState<Player | null>(null);
  const [studentLicenseId, setStudentLicenseId] = useState('');

  useEffect(() => {
    setHome(readCloudMediaHome(typeof localStorage === 'undefined' ? null : localStorage));
  }, []);

  useEffect(() => {
    return () => {
      if (player) URL.revokeObjectURL(player.url);
    };
  }, [player]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const headers = authHeaders();
      if (!headers) {
        setStatus(null);
        setCloudUploadReady(false);
        return;
      }
      try {
        const response = await fetch('/api/gym/cloud?op=status', { headers });
        const body = await readJson<CloudStatusBody>(response);
        if (cancelled) return;
        setCloudReplayPending(response.ok && body?.replayUpload === 'pending');
        if (!response.ok || !body?.cloud) {
          setStatus(body?.cloud === false ? body : null);
          setCloudUploadReady(false);
          if (body?.cloud === false) writeCloudMediaHome(localStorage, 'device');
          return;
        }
        setStatus(body);
        setCloudUploadReady(Boolean(body.canUpload));
        // Approvers also get pending and rejected daily videos, tagged with their lane.
        const lanes = purpose === 'daily-video' ? '&lanes=all' : '';
        const listed = await fetch(`/api/gym/cloud?op=list&purpose=${purpose}&date=${encodeURIComponent(dateKey)}${lanes}`, { headers });
        const listBody = await readJson<{ files?: CloudFileRow[] }>(listed);
        if (!cancelled) setFiles(listed.ok && listBody?.files ? listBody.files : []);
      } catch {
        if (!cancelled) {
          setStatus(null);
          setCloudUploadReady(false);
        }
      }
    };
    void load();
    const onChange = () => void load();
    window.addEventListener(CLOUD_MEDIA_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(CLOUD_MEDIA_EVENT, onChange);
    };
  }, [purpose, dateKey]);

  if (!status?.cloud) return null;

  const canUpload = Boolean(status.canUpload);
  const usage =
    typeof status.licenseUsedBytes === 'number' && typeof status.capBytes === 'number'
      ? cloudUsageLine(status.licenseUsedBytes, status.capBytes)
      : 'Could not read Cloud usage.';
  const accept = purpose === 'daily-video' ? MEDIA_LIBRARY_ACCEPT : 'video/*,image/*';

  const chooseHome = (next: CloudMediaHome) => {
    writeCloudMediaHome(localStorage, next);
    setHome(next);
    setCloudUploadReady(canUpload);
  };

  const fetchFile = async (file: CloudFileRow): Promise<Blob | null> => {
    const headers = authHeaders();
    if (!headers) {
      setNote('Sign in on this device to use Advantage Cloud.');
      return null;
    }
    const response = await fetch(`/api/gym/cloud?op=file&path=${encodeURIComponent(file.path)}`, { headers });
    if (!response.ok) {
      setNote('That file could not be opened from Advantage Cloud.');
      return null;
    }
    return response.blob();
  };

  const play = async (file: CloudFileRow) => {
    const blob = await fetchFile(file);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const kind = file.mime.startsWith('image/') ? 'image' : 'video';
    setPlayer((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return { url, name: file.name, kind };
    });
  };

  const download = async (file: CloudFileRow) => {
    const blob = await fetchFile(file);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const uploadFiles = async (list: FileList | null) => {
    if (!list?.length || !canUpload) return;
    setBusy(true);
    setNote('');
    const notes: string[] = [];
    let cloudWrote = false;
    for (let index = 0; index < list.length; index += 1) {
      const file = list[index];
      if (!file) continue;
      const photo = purpose === 'daily-video' && isDailyPhoto(file);
      setNote(photo ? 'Saving photo…' : list.length === 1 ? 'Uploading to Advantage Cloud…' : `Uploading ${index + 1} of ${list.length} to Advantage Cloud…`);
      if (photo) {
        const saved = await uploadDailyMediaFile(file, dateKey);
        notes.push(saved.message);
        if (saved.cloud) cloudWrote = true;
        if (!saved.ok) break;
        continue;
      }
      const result = await uploadAdvantageCloudFile({
        purpose: purpose === 'lesson' ? 'lesson-media' : 'daily-video',
        dateKey,
        file,
        fileName: file.name,
        mime: file.type || (purpose === 'daily-video' ? 'video/mp4' : 'application/octet-stream'),
      });
      if (!result.ok) {
        notes.push(result.message);
        break;
      }
      cloudWrote = true;
      notes.push(result.lane === 'pending' ? CLOUD_SENT_FOR_APPROVAL : CLOUD_SAVED_MESSAGE);
    }
    setBusy(false);
    setNote(notes.join(' ') || (cloudWrote ? CLOUD_SAVED_MESSAGE : 'Could not read Cloud usage.'));
    if (cloudWrote) notifyCloudMedia();
  };

  const sendToStudent = async (file: CloudFileRow) => {
    const headers = authHeaders();
    const studentId = studentLicenseId.trim();
    if (!headers || !studentId) {
      setNote('Enter the student license, then send.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/gym/cloud', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'send-to-student', key: file.path, studentId, dateKey }),
      });
      const body = await readJson<{ error?: string; path?: string }>(response);
      setNote(response.ok ? `Sent ${file.name} to that student.` : body?.error || 'That did not send.');
    } catch {
      setNote('That did not send.');
    } finally {
      setBusy(false);
    }
  };

  const savePlan = async () => {
    if (!canUpload || !planJson) return;
    setBusy(true);
    const result = await uploadAdvantageCloudFile({
      purpose: 'lesson',
      dateKey,
      file: new Blob([planJson], { type: 'application/json' }),
      fileName: `${dateKey}.json`,
      mime: 'application/json',
      planTarget: 'mine',
    });
    setBusy(false);
    setNote(result.ok ? 'Saved to your plan in Advantage Cloud. The gym template was not changed.' : result.message);
  };

  return (
    <section className="cloud-media" aria-label="Advantage Cloud" data-cloud-panel={purpose}>
      <h2>Advantage Cloud</h2>
      <p data-cloud-usage="">{usage}</p>
      {canUpload ? (
        <fieldset className="cloud-media__choice">
          <legend>Where new files from this page go</legend>
          <label>
            <input
              type="radio"
              name={`cloud-home-${purpose}`}
              checked={home === 'device'}
              onChange={() => chooseHome('device')}
            />
            <span>This phone, Google Drive, or OneDrive</span>
          </label>
          <label>
            <input
              type="radio"
              name={`cloud-home-${purpose}`}
              checked={home === 'advantage-cloud'}
              onChange={() => chooseHome('advantage-cloud')}
            />
            <span>Advantage Cloud</span>
          </label>
        </fieldset>
      ) : (
        <p>You can play and download these files. A coach uploads them.</p>
      )}
      {canUpload ? (
        <label>
          Student license
          <input
            data-send-student=""
            value={studentLicenseId}
            onChange={(event) => setStudentLicenseId(event.target.value)}
            autoComplete="off"
            aria-describedby={`cloud-student-hint-${purpose}`}
          />
          <small id={`cloud-student-hint-${purpose}`} className="cloud-media__hint" data-student-license-hint="">
            {CLOUD_STUDENT_LICENSE_HINT}
          </small>
        </label>
      ) : null}
      {canUpload ? (
        <div className="cloud-media__actions">
          <label className="btn cloud-media__upload">
            <span>{purpose === 'daily-video' ? 'Upload a video' : 'Upload lesson media'}</span>
            <input
              data-cloud-upload=""
              type="file"
              accept={accept}
              multiple
              disabled={busy}
              onChange={(event) => {
                void uploadFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </label>
          {purpose === 'lesson' ? (
            <button type="button" className="btn" disabled={busy || !planJson} onClick={() => void savePlan()}>
              Save my plan to Cloud
            </button>
          ) : null}
        </div>
      ) : null}
      {note ? (
        <p className="cloud-media__note" role="status">
          {note}
        </p>
      ) : null}
      {files.length ? (
        <ul className="cloud-media__files">
          {files.map((file) => (
            <li key={file.path} className="cloud-media__file" data-cloud-file={file.path} data-cloud-lane={file.lane ?? 'approved'}>
              <span>
                {file.lessonPlan === 'template' ? 'Gym template · ' : file.lessonPlan === 'mine' ? 'My plan · ' : ''}
                {file.name}
                {file.lane === 'pending' ? ' · Waiting for approval' : file.lane === 'rejected' ? ' · Rejected' : ''}
              </span>
              {file.mime.startsWith('image/') || file.mime.startsWith('video/') || file.mime === 'application/octet-stream' ? (
                <button type="button" className="btn" onClick={() => void play(file)}>
                  Play
                </button>
              ) : null}
              <button type="button" className="btn btn--ghost" onClick={() => void download(file)}>
                Download
              </button>
              {canUpload && (file.lane ?? 'approved') === 'approved' && (file.mime.startsWith('video/') || file.mime === 'application/octet-stream') ? (
                <button type="button" className="btn" disabled={busy} onClick={() => void sendToStudent(file)}>
                  Send to student
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="cloud-media__empty">No Advantage Cloud files for this day yet.</p>
      )}
      {player?.kind === 'video' ? <video className="cloud-media__player" src={player.url} controls playsInline /> : null}
      {player?.kind === 'image' ? <img className="cloud-media__player" src={player.url} alt={player.name} /> : null}
      {purpose === 'lesson' ? <PendingReplayApprovals owner={ownerSession} /> : null}
    </section>
  );
}

/**
 * Replay clips and pictures from an assistant coach or program director wait here.
 * The head coach sees every one and approves or declines; a seat sees only its own.
 * Decline never deletes the file.
 */
export function PendingReplayApprovals({ owner, fetcher = fetch }: { owner: boolean; fetcher?: typeof fetch }) {
  const [rows, setRows] = useState<PendingReplayRow[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const headers = authHeaders();
    if (!headers) return;
    try {
      const response = await fetcher('/api/gym/cloud?op=pending', { headers });
      const body = await readJson<{ pending?: PendingReplayRow[] }>(response);
      setRows(response.ok && body?.pending ? body.pending.filter((row) => row.status === 'pending') : []);
    } catch {
      setRows([]);
    }
  };

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener(CLOUD_MEDIA_EVENT, onChange);
    return () => window.removeEventListener(CLOUD_MEDIA_EVENT, onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decide = async (row: PendingReplayRow, action: 'approve' | 'decline') => {
    const headers = authHeaders();
    if (!headers) return;
    setBusy(row.path);
    try {
      const response = await fetcher('/api/gym/cloud', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ action, key: row.path }),
      });
      const body = await readJson<{ error?: string }>(response);
      if (!response.ok) {
        setNote(body?.error ?? 'That did not save. Try again.');
        return;
      }
      setNote(action === 'approve' ? `Approved ${row.name}. It is in lesson media now.` : `Declined ${row.name}.`);
      setRows((list) => list.filter((item) => item.path !== row.path));
    } catch {
      setNote('That did not save. Try again.');
    } finally {
      setBusy(null);
    }
  };

  if (!rows.length && !note) return null;
  return (
    <div className="cloud-media__pending" data-pending-replays="">
      <h3 className="cloud-media__title">{owner ? 'Waiting for your approval' : 'Waiting for the head coach'}</h3>
      {note ? (
        <p className="cloud-media__note" role="status">
          {note}
        </p>
      ) : null}
      <ul className="cloud-media__files">
        {rows.map((row) => (
          <li key={row.path} className="cloud-media__file" data-pending-replay={row.path}>
            <span>
              {row.name} · {row.dateKey}
            </span>
            {owner ? (
              <>
                <button type="button" className="btn" disabled={busy === row.path} onClick={() => void decide(row, 'approve')}>
                  Approve
                </button>
                <button type="button" className="btn btn--ghost" disabled={busy === row.path} onClick={() => void decide(row, 'decline')}>
                  Decline
                </button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
