import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CLOUD_HOME_CONNECTED,
  CLOUD_HOME_UNBOUND,
  CLOUD_ROLE_HOME,
  cloudUsageLine,
  loadAdvantageCloudHome,
  writeCloudMediaHome,
  type CloudHomeView,
} from '../lib/advantageCloudMedia';
import { ADVANTAGE_CLOUD_DRIVE_NOTE, ADVANTAGE_CLOUD_HEADING, UNLIMITED_LESSON_PATH, UNLIMITED_VIDEOS_PATH } from '../lib/productNames';

function statusLine(view: CloudHomeView | null): string {
  if (!view) return 'Checking Advantage Cloud…';
  if (view.phase === 'unbound') return CLOUD_HOME_UNBOUND;
  if (view.phase === 'connected') return CLOUD_HOME_CONNECTED;
  return cloudUsageLine(view.licenseUsedBytes, view.bucketUsedBytes, view.capBytes);
}

/** Live Advantage Cloud block for the head instructor. Hidden tiers never mount this page. */
export function AdvantageCloudHome() {
  const [view, setView] = useState<CloudHomeView | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadAdvantageCloudHome().then((next) => {
      if (!cancelled) setView(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const chooseCloud = () => {
    writeCloudMediaHome(typeof localStorage === 'undefined' ? null : localStorage, 'advantage-cloud');
  };

  return (
    <section className="cloud-home" aria-label={ADVANTAGE_CLOUD_HEADING} data-cloud-block="advantage-cloud">
      <h2>{ADVANTAGE_CLOUD_HEADING}</h2>
      <p data-cloud-home-status="">{statusLine(view)}</p>
      <p>{CLOUD_ROLE_HOME}</p>
      <p>{ADVANTAGE_CLOUD_DRIVE_NOTE}</p>
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
