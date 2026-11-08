import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { refreshEntitlement } from '../lib/entitlementRefresh';
import {
  CLOUD_ROLE_HOME,
  cloudHomeStatusLine,
  loadAdvantageCloudHome,
  readCloudBearer,
  writeCloudMediaHome,
  type CloudHomeView,
} from '../lib/advantageCloudMedia';
import { ADVANTAGE_CLOUD_DRIVE_NOTE, ADVANTAGE_CLOUD_HEADING, UNLIMITED_LESSON_PATH, UNLIMITED_VIDEOS_PATH } from '../lib/productNames';

/** Live Advantage Cloud status for the gym owner. Hidden tiers never mount this page. */
export function AdvantageCloudHome() {
  const [view, setView] = useState<CloudHomeView | null>(null);
  const [note, setNote] = useState('');
  const request = useRef(0);

  const check = (refreshPass: boolean) => {
    const id = request.current + 1;
    request.current = id;
    setView(null);
    if (refreshPass) setNote('');
    void (async () => {
      if (refreshPass && readCloudBearer()) {
        const refreshed = await refreshEntitlement();
        if (request.current === id && !refreshed) {
          setNote('Could not refresh this pass. Showing the pass already on this device.');
        }
      }
      const next = await loadAdvantageCloudHome();
      if (request.current === id) setView(next);
    })();
  };

  useEffect(() => {
    check(false);
  }, []);

  const chooseCloud = () => {
    writeCloudMediaHome(typeof localStorage === 'undefined' ? null : localStorage, 'advantage-cloud');
  };

  return (
    <section className="cloud-home" aria-label={ADVANTAGE_CLOUD_HEADING} data-cloud-block="advantage-cloud">
      <h2>{ADVANTAGE_CLOUD_HEADING}</h2>
      <p data-cloud-home-status="">{cloudHomeStatusLine(view)}</p>
      {note ? <p role="status">{note}</p> : null}
      <p>{CLOUD_ROLE_HOME}</p>
      <p>{ADVANTAGE_CLOUD_DRIVE_NOTE}</p>
      <button type="button" className="btn" onClick={() => check(true)}>
        Check again
      </button>
      <div className="cloud-home__actions">
        <Link className="btn" to={UNLIMITED_VIDEOS_PATH} onClick={chooseCloud}>
          Upload daily videos
        </Link>
        <Link className="btn" to={UNLIMITED_LESSON_PATH} onClick={chooseCloud}>
          Upload lesson-plan media
        </Link>
      </div>
    </section>
  );
}
