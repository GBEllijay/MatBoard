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
  loadClassHistory,
  readDriveBinding,
  requestDriveToken,
  type ClassDay,
  type DriveBinding,
} from '../lib/googleDrive';

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
              </section>
            ))
          : null}
      </div>
    </main>
  );
}
