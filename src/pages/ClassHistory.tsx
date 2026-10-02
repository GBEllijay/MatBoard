import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DriveConnectCard } from '../components/DriveConnectCard';
import { OpenMyDrive } from '../components/OpenMyDrive';
import { PlayExitMark } from '../components/PlayExitMark';
import { useToolboxParent } from '../hooks/useToolboxParent';
import { cloudStorage } from '../lib/cloudStorage';
import {
  CLASS_HISTORY_CHECKING,
  CLASS_HISTORY_CONNECT,
  CLASS_HISTORY_EMPTY,
  CLASS_HISTORY_LEAD,
  CLASS_HISTORY_TITLE,
  downloadDriveFile,
  loadClassHistory,
  loadDriveDayPackage,
  readDriveBinding,
  requestDriveToken,
  type ClassDay,
  type DriveBinding,
} from '../lib/googleDrive';
import {
  OPEN_THIS_CLASS_LABEL,
  RESTORE_OPENING,
  restoreDriveDay,
} from '../lib/lessonRestore';
import { saveTechniquePlan, storeRestoredDriveClip } from '../lib/techniqueStore';
import { localDateKey, saveDay } from '../lib/trainingNotesStore';

function planDayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type HistoryState =
  | { phase: 'need-connect' }
  | { phase: 'checking' }
  | { phase: 'ready'; days: ClassDay[] }
  | { phase: 'error'; message: string };

/**
 * Pro calendar of class files in the connected Drive folder.
 * Rows come from the Drive list only.
 */
export function ClassHistoryPage() {
  const navigate = useNavigate();
  const parent = useToolboxParent();
  const [binding, setBinding] = useState<DriveBinding | null>(() => readDriveBinding());
  const [state, setState] = useState<HistoryState>({ phase: 'checking' });
  const [opening, setOpening] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const current = readDriveBinding();
    setBinding(current);
    if (!current) {
      setState({ phase: 'need-connect' });
      return;
    }
    const drive = cloudStorage();
    if (!drive.isAvailable()) {
      setState({ phase: 'error', message: drive.unavailableMessage() });
      return;
    }
    let cancelled = false;
    setState({ phase: 'checking' });
    void requestDriveToken('silent')
      .then((token) => {
        if (!token) throw new Error(CLASS_HISTORY_CONNECT);
        return loadClassHistory(token, current.folderId);
      })
      .then((days) => {
        if (!cancelled) setState({ phase: 'ready', days });
      })
      .catch((reason) => {
        if (cancelled) return;
        setState({
          phase: 'error',
          message: reason instanceof Error ? reason.message : 'Google Drive could not be checked.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openClass = (date: string) => {
    if (!binding || opening) return;
    setOpening(date);
    setNotice('');
    void requestDriveToken('silent')
      .then(async (silent) => {
        const token = silent ?? (await requestDriveToken('consent'));
        if (!token) throw new Error(CLASS_HISTORY_CONNECT);
        const pack = await loadDriveDayPackage(token, binding.folderId, date);
        return restoreDriveDay({
          todayKey: localDateKey(),
          pack,
          downloadVideo: (fileId) => downloadDriveFile(token, fileId),
          savePlan: (dateKey, plan, todayKey) => {
            saveDay(dateKey, plan, todayKey);
          },
          storeClip: storeRestoredDriveClip,
          saveVideoPlan: saveTechniquePlan,
        });
      })
      .then((result) => {
        if (!result.ok || !result.path) {
          setNotice(result.notice);
          setOpening(null);
          return;
        }
        navigate(result.path, { state: { driveRestoreNotice: result.notice } });
      })
      .catch((reason) => {
        setNotice(reason instanceof Error ? reason.message : 'This class could not be opened.');
        setOpening(null);
      });
  };

  return (
    <main className="notes">
      <PlayExitMark to="/instructors" onExit={() => navigate('/instructors')} />
      <header className="notes__bar">
        <div className="notes__brand">
          <p className="notes__eyebrow">{parent.eyebrow}</p>
          <h1>{CLASS_HISTORY_TITLE}</h1>
        </div>
      </header>
      <p className="notes__lead">{CLASS_HISTORY_LEAD}</p>
      <div className="notes__plan">
        <OpenMyDrive />
        {binding ? <p className="notes__when">{binding.folderName}</p> : null}
        {state.phase === 'need-connect' || state.phase === 'error' ? <DriveConnectCard /> : null}
        {state.phase === 'checking' ? (
          <p className="notes__gallery-status" role="status">
            {CLASS_HISTORY_CHECKING}
          </p>
        ) : null}
        {state.phase === 'error' ? (
          <p className="notes__gallery-status notes__gallery-status--empty" role="status">
            {state.message}
          </p>
        ) : null}
        {notice ? (
          <p className="notes__gallery-status notes__gallery-status--empty" role="status">
            {notice}
          </p>
        ) : null}
        {state.phase === 'ready' && state.days.length === 0 ? (
          <p className="notes__gallery-status notes__gallery-status--empty" role="status">
            {CLASS_HISTORY_EMPTY}
          </p>
        ) : null}
        {state.phase === 'ready'
          ? state.days.map((day) => (
              <section key={day.date} className="notes__card" aria-label={planDayLabel(day.date)}>
                <h2>{planDayLabel(day.date)}</h2>
                {day.techniques.length ? (
                  <ul className="history__list">
                    {day.techniques.map((title) => (
                      <li key={title}>{title}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="notes__gallery-status">No technique titles on this day.</p>
                )}
                {day.photos.length || day.videos.length ? (
                  <ul className="history__media">
                    {[...day.photos, ...day.videos].map((item) => (
                      <li key={item.id}>
                        {item.thumbnailLink ? (
                          <img src={item.thumbnailLink} alt="" />
                        ) : (
                          <span className="history__thumb" aria-hidden="true" />
                        )}
                        <span>{item.name}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button
                  type="button"
                  className="btn history__open"
                  disabled={opening !== null}
                  onClick={() => openClass(day.date)}
                >
                  {opening === day.date ? RESTORE_OPENING : OPEN_THIS_CLASS_LABEL}
                </button>
              </section>
            ))
          : null}
      </div>
    </main>
  );
}
