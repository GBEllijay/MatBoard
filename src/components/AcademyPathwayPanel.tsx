import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GoogleDriveFolderTools } from './GoogleDriveFolderTools';
import {
  ACADEMY_FREE_NOTE,
  ACADEMY_NO_FOLDER,
  academyFolderWebUrl,
  academyPathway,
  academyPathwayUrl,
  providerLabel,
  shareGoogleFolderWithAnyone,
  shareOneDriveFolderWithAnyone,
  type AcademyPathway,
} from '../lib/academyPathway';
import { cloudStorage } from '../lib/cloudStorage';
import { readGymName } from '../lib/gymName';
import { readDriveBinding, requestDriveToken, subscribeDriveBinding } from '../lib/googleDrive';
import { readOneDriveBinding, readOneDriveSession } from '../lib/oneDrive';
import { COACH_UNLIMITED_PATH } from '../lib/productNames';
import { qrDataUrl } from '../lib/qr';

type Row = {
  pathway: AcademyPathway;
  url: string;
  qr: string;
  folderUrl: string | null;
  shareNote: string;
};

async function rowFor(pathway: AcademyPathway): Promise<Row> {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const url = academyPathwayUrl(pathway, origin);
  const qr = await qrDataUrl(url);
  return {
    pathway,
    url,
    qr,
    folderUrl: academyFolderWebUrl(pathway),
    shareNote: '',
  };
}

/**
 * Pro hands a student a pathway into the academy folder already connected
 * on this browser. The student does not pay. The folder itself is shared
 * in Google Drive or OneDrive when this app is allowed to, and the coach
 * can always open the folder and share it there.
 */
export function AcademyPathwayPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [driveTick, setDriveTick] = useState(0);

  const reload = useCallback(() => {
    const gymName = readGymName();
    const pathways: AcademyPathway[] = [];
    const google = readDriveBinding();
    if (google) {
      const pathway = academyPathway({
        provider: 'googleDrive',
        folderId: google.folderId,
        folderName: google.folderName,
        gymName,
      });
      if (pathway) pathways.push(pathway);
    }
    const one = readOneDriveBinding();
    if (one) {
      const pathway = academyPathway({
        provider: 'oneDrive',
        folderId: one.folderId,
        folderName: one.folderName,
        gymName,
      });
      if (pathway) pathways.push(pathway);
    }
    let alive = true;
    void Promise.all(pathways.map((pathway) => rowFor(pathway))).then((next) => {
      if (alive) setRows(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const stopAlive = reload();
    return () => {
      stopAlive?.();
    };
  }, [reload, driveTick]);

  useEffect(() => subscribeDriveBinding(() => setDriveTick((value) => value + 1)), []);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Academy link copied.');
      setError('');
    } catch {
      setStatus('');
      setError('Could not copy. Select the link and copy it.');
    }
  };

  const share = async (row: Row) => {
    setError('');
    setStatus('');
    if (row.pathway.provider === 'googleDrive') {
      const token = (await requestDriveToken('silent')) ?? (await requestDriveToken('consent'));
      if (!token) {
        setError('Sign in to Google Drive again, or open the folder and share it there.');
        return;
      }
      const result = await shareGoogleFolderWithAnyone(token, row.pathway.folderId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStatus('Google Drive now lets anyone with the folder link add files. Students still use Connect to my academy. They do not pay.');
      return;
    }
    const session = readOneDriveSession();
    if (!session) {
      setError('Sign in to OneDrive again, or share the folder from OneDrive.');
      return;
    }
    const result = await shareOneDriveFolderWithAnyone(session.token, row.pathway.folderId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRows((current) =>
      current.map((item) =>
        item.pathway.folderId === row.pathway.folderId ? { ...item, folderUrl: result.url ?? item.folderUrl } : item,
      ),
    );
    setStatus('OneDrive created an edit link. Students still use Connect to my academy. They do not pay.');
  };

  return (
    <section className="academy-pathway" aria-label="Academy folder pathway">
      <h2>Connect to my academy</h2>
      <p>
        Send students a pathway into the academy folder connected on this browser. They open Connect to my academy,
        sign in to that drive, and can upload and download there. {ACADEMY_FREE_NOTE} Set the folder up before you
        give out Student Edition seats.
      </p>
      {rows.length === 0 ? (
        <p>
          {ACADEMY_NO_FOLDER}{' '}
          <Link to={COACH_UNLIMITED_PATH}>Connect the folder</Link>
        </p>
      ) : null}
      {rows.map((row) => (
        <article key={`${row.pathway.provider}-${row.pathway.folderId}`} className="academy-pathway__card">
          <h3>{providerLabel(row.pathway.provider)}</h3>
          <p>
            {row.pathway.folderName}
            {row.pathway.gymName ? ` · ${row.pathway.gymName}` : ''}
          </p>
          <img src={row.qr} alt={`QR for the ${providerLabel(row.pathway.provider)} academy folder`} width={180} height={180} />
          <label>
            Academy link
            <input aria-label={`${providerLabel(row.pathway.provider)} academy link`} readOnly value={row.url} />
          </label>
          <div className="academy-pathway__actions">
            <button type="button" onClick={() => void copy(row.url)}>
              Copy academy link
            </button>
            <button type="button" onClick={() => void share(row)}>
              Share folder for student edits
            </button>
            {row.folderUrl ? (
              <a href={row.folderUrl} target="_blank" rel="noopener noreferrer">
                Open folder to share
              </a>
            ) : (
              <p>Open this folder in OneDrive and share it if the edit link is not created here.</p>
            )}
          </div>
          {row.pathway.provider === 'googleDrive' ? (
            <GoogleDriveFolderTools
              folderId={row.pathway.folderId}
              picker="inline"
              onPick={async (folder, token) => {
                await cloudStorage('googleDrive').pickFolder(token, folder);
                setDriveTick((value) => value + 1);
                setStatus(`Connected to ${folder.name}. Pick another folder any time, or disconnect to sign in with a different account.`);
                setError('');
              }}
              onDisconnected={() => {
                setDriveTick((value) => value + 1);
                setStatus('Google Drive is disconnected on this device. Connect again to pick a folder or account.');
                setError('');
              }}
            />
          ) : null}
        </article>
      ))}
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
