import { useEffect, useState } from 'react';
import {
  CLOUD_MEDIA_EVENT,
  CLOUD_SAVED_MESSAGE,
  cloudUsageLine,
  readCloudBearer,
  readCloudMediaHome,
  setCloudUploadReady,
  uploadAdvantageCloudFile,
  writeCloudMediaHome,
  type CloudFileRow,
  type CloudMediaHome,
  type CloudStatusBody,
} from '../lib/advantageCloudMedia';

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
  const [status, setStatus] = useState<CloudStatusBody | null>(null);
  const [files, setFiles] = useState<CloudFileRow[]>([]);
  const [home, setHome] = useState<CloudMediaHome>('device');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [player, setPlayer] = useState<Player | null>(null);

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
        if (!response.ok || !body?.cloud) {
          setStatus(body?.cloud === false ? body : null);
          setCloudUploadReady(false);
          if (body?.cloud === false) writeCloudMediaHome(localStorage, 'device');
          return;
        }
        setStatus(body);
        setCloudUploadReady(Boolean(body.canUpload));
        const listed = await fetch(`/api/gym/cloud?op=list&purpose=${purpose}&date=${encodeURIComponent(dateKey)}`, { headers });
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
  const usage = cloudUsageLine(status.licenseUsedBytes ?? 0, status.bucketUsedBytes ?? 0, status.capBytes ?? 0);
  const accept = purpose === 'daily-video' ? 'video/*' : 'video/*,image/*';

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
    let failed = '';
    for (let index = 0; index < list.length; index += 1) {
      const file = list[index];
      if (!file) continue;
      setNote(list.length === 1 ? 'Uploading to Advantage Cloud…' : `Uploading ${index + 1} of ${list.length} to Advantage Cloud…`);
      const result = await uploadAdvantageCloudFile({
        purpose: purpose === 'lesson' ? 'lesson-media' : 'daily-video',
        dateKey,
        file,
        fileName: file.name,
        mime: file.type || (purpose === 'daily-video' ? 'video/mp4' : 'application/octet-stream'),
      });
      if (!result.ok) {
        failed = result.message;
        break;
      }
    }
    setBusy(false);
    setNote(failed || CLOUD_SAVED_MESSAGE);
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
    });
    setBusy(false);
    setNote(result.ok ? 'Lesson plan saved to Advantage Cloud.' : result.message);
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
              Save this lesson plan
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
            <li key={file.path} className="cloud-media__file" data-cloud-file={file.path}>
              <span>{file.name}</span>
              {file.mime.startsWith('image/') || file.mime.startsWith('video/') || file.mime === 'application/octet-stream' ? (
                <button type="button" className="btn" onClick={() => void play(file)}>
                  Play
                </button>
              ) : null}
              <button type="button" className="btn btn--ghost" onClick={() => void download(file)}>
                Download
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cloud-media__empty">No Advantage Cloud files for this day yet.</p>
      )}
      {player?.kind === 'video' ? <video className="cloud-media__player" src={player.url} controls playsInline /> : null}
      {player?.kind === 'image' ? <img className="cloud-media__player" src={player.url} alt={player.name} /> : null}
    </section>
  );
}
