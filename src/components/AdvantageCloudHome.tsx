import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { refreshEntitlement } from '../lib/entitlementRefresh';
import {
  CLOUD_ROLE_HOME,
  cloudHomeStatusLine,
  cloudUsageFigures,
  loadAdvantageCloudHome,
  readCloudBearer,
  writeCloudMediaHome,
  type CloudHomeView,
} from '../lib/advantageCloudMedia';
import { ADVANTAGE_CLOUD_DRIVE_NOTE, ADVANTAGE_CLOUD_HEADING, UNLIMITED_LESSON_PATH, UNLIMITED_VIDEOS_PATH } from '../lib/productNames';
import { Sheet } from './Sheet';

function useAdvantageCloudHome() {
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

  return { view, note, check, chooseCloud };
}

function CloudFigure({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div className="cloud-metric">
      <span className="sheet-stat__num">
        {value}
        {unit ? <small>{unit}</small> : null}
      </span>
      <span>{label}</span>
    </div>
  );
}

/** Status, roles, drive note, refresh, and the two upload actions. */
function CloudHomeBody({
  view,
  note,
  onCheck,
  onChooseCloud,
}: {
  view: CloudHomeView | null;
  note: string;
  onCheck: () => void;
  onChooseCloud: () => void;
}) {
  return (
    <div className="cloud-usage-detail" data-cloud-block="advantage-cloud">
      <p data-cloud-home-status="">{cloudHomeStatusLine(view)}</p>
      {note ? <p role="status">{note}</p> : null}
      <p>{CLOUD_ROLE_HOME}</p>
      <p>{ADVANTAGE_CLOUD_DRIVE_NOTE}</p>
      <button type="button" className="btn" onClick={onCheck}>
        Check again
      </button>
      <div className="cloud-home__actions">
        <Link className="btn" to={UNLIMITED_VIDEOS_PATH} onClick={onChooseCloud}>
          Upload daily videos
        </Link>
        <Link className="btn" to={UNLIMITED_LESSON_PATH} onClick={onChooseCloud}>
          Upload lesson-plan media
        </Link>
      </div>
    </div>
  );
}

/**
 * Navy stat on the academy profile. One tap opens the Cloud details.
 * Mount this only for a Cloud owner.
 */
export function CloudUsageMetric() {
  const { view, note, check, chooseCloud } = useAdvantageCloudHome();
  const [open, setOpen] = useState(false);
  const figures = cloudUsageFigures(view);

  return (
    <>
      <button
        type="button"
        className={`sheet-stat sheet-stat--link sheet-stat--cloud${figures.length === 1 ? ' sheet-stat--cloud-pending' : ''}`}
        data-testid="cloud-usage-metric"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Advantage Cloud. ${cloudHomeStatusLine(view)}`}
        onClick={() => setOpen(true)}
      >
        {figures.map((figure) => (
          <CloudFigure key={figure.label} value={figure.value} unit={figure.unit} label={figure.label} />
        ))}
      </button>
      <Sheet open={open} title={ADVANTAGE_CLOUD_HEADING} onClose={() => setOpen(false)} portal>
        <CloudHomeBody view={view} note={note} onCheck={() => check(true)} onChooseCloud={chooseCloud} />
      </Sheet>
    </>
  );
}

/** Live Advantage Cloud status. The media empty state still uses this cream card. */
export function AdvantageCloudHome() {
  const { view, note, check, chooseCloud } = useAdvantageCloudHome();

  return (
    <section className="cloud-home" aria-label={ADVANTAGE_CLOUD_HEADING}>
      <h2>{ADVANTAGE_CLOUD_HEADING}</h2>
      <CloudHomeBody view={view} note={note} onCheck={() => check(true)} onChooseCloud={chooseCloud} />
    </section>
  );
}
