import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { refreshEntitlement } from '../lib/entitlementRefresh';
import {
  advantageCloudReady,
  CLOUD_MEDIA_EVENT,
  CLOUD_ROLE_HOME,
  cloudHomeStatusLine,
  cloudUsageFigures,
  loadAdvantageCloudHome,
  readCloudBearer,
  type CloudHomeView,
} from '../lib/advantageCloudMedia';
import { CLOUD_DAILY_MEDIA_LABEL, dailyMediaDateKey, uploadDailyMediaFile } from '../lib/dailyOwnerUpload';
import { MEDIA_LIBRARY_ACCEPT } from '../lib/mediaPicker';
import { ADVANTAGE_CLOUD_DRIVE_NOTE, ADVANTAGE_CLOUD_HEADING, UNLIMITED_LESSON_PATH } from '../lib/productNames';
import { Sheet } from './Sheet';
import { CloudUploadQueuePanel } from './CloudUploadQueuePanel';
import { cloudUploadQueue, dailyQueueInputs } from '../lib/cloudUploadQueueInstance';

/** Live status. `?fixture=cloud` is a dev-server sample. Production replaces DEV and drops it. */
async function loadCloudUsage(): Promise<CloudHomeView> {
  try {
    if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('fixture') === 'cloud') {
      const { fixtureCloudHome } = await import('../lib/advantageCloudFixture.ts');
      return fixtureCloudHome();
    }
  } catch {
    /* Node tests have no Vite env. The live probe still runs. */
  }
  return loadAdvantageCloudHome();
}

function useAdvantageCloudHome() {
  const [view, setView] = useState<CloudHomeView | null>(null);
  const [note, setNote] = useState('');
  const request = useRef(0);

  const check = (refreshPass: boolean, keep = false) => {
    const id = request.current + 1;
    request.current = id;
    if (!keep) setView(null);
    if (refreshPass) setNote('');
    void (async () => {
      if (refreshPass && readCloudBearer()) {
        const refreshed = await refreshEntitlement();
        if (request.current === id && !refreshed) {
          setNote('Could not refresh this pass. Showing the pass already on this device.');
        }
      }
      const next = await loadCloudUsage();
      if (request.current === id) setView(next);
    })();
  };

  useEffect(() => {
    check(false);
    // A bulk upload fires this once per file. Read usage once the burst settles.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onCloud = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        check(false, true);
      }, 1500);
    };
    window.addEventListener(CLOUD_MEDIA_EVENT, onCloud);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(CLOUD_MEDIA_EVENT, onCloud);
    };
  }, []);

  const uploadDaily = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = [...list];
    // Cloud on: the queue shows each file, retries, and skips what is already uploaded.
    if (await advantageCloudReady()) {
      setNote('');
      cloudUploadQueue.add(dailyQueueInputs(files, dailyMediaDateKey()));
      return;
    }
    const notes: string[] = [];
    for (const file of files) {
      const result = await uploadDailyMediaFile(file, dailyMediaDateKey());
      notes.push(result.message);
    }
    setNote(notes.join(' '));
    check(false, true);
  };

  return { view, note, check, uploadDaily };
}

function CloudFigure({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <span className="gym-cloud-usage__pair">
      <span className="gym-cloud-usage__num">
        {value}
        {unit ? <small>{unit}</small> : null}
      </span>
      <span className="gym-cloud-usage__label">{label}</span>
    </span>
  );
}

/** Status, roles, drive note, refresh, and the two upload actions. */
function CloudHomeBody({
  view,
  note,
  onCheck,
  onUpload,
  showQueue = true,
}: {
  view: CloudHomeView | null;
  note: string;
  onCheck: () => void;
  onUpload: (list: FileList | null) => void;
  showQueue?: boolean;
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
        <label className="btn cloud-media__upload">
          {CLOUD_DAILY_MEDIA_LABEL}
          <input
            data-cloud-daily-upload=""
            type="file"
            accept={MEDIA_LIBRARY_ACCEPT}
            multiple
            onChange={(event) => {
              onUpload(event.target.files);
              event.target.value = '';
            }}
          />
        </label>
        <Link className="btn" to={UNLIMITED_LESSON_PATH}>
          Upload lesson-plan media
        </Link>
      </div>
      {showQueue ? <CloudUploadQueuePanel /> : null}
    </div>
  );
}

/**
 * Navy stat on the academy profile. One tap opens the Cloud details.
 * Mount this only for a Cloud owner.
 */
export function CloudUsageMetric() {
  const { view, note, check, uploadDaily } = useAdvantageCloudHome();
  const [open, setOpen] = useState(false);
  const figures = cloudUsageFigures(view);

  return (
    <>
      <button
        type="button"
        className="gym-cloud-usage"
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
        <CloudHomeBody view={view} note={note} onCheck={() => check(true)} onUpload={(list) => void uploadDaily(list)} />
      </Sheet>
    </>
  );
}

/** Live Advantage Cloud status. The media empty state still uses this cream card. */
export function AdvantageCloudHome({ showQueue = true }: { showQueue?: boolean } = {}) {
  const { view, note, check, uploadDaily } = useAdvantageCloudHome();

  return (
    <section className="cloud-home" aria-label={ADVANTAGE_CLOUD_HEADING}>
      <h2>{ADVANTAGE_CLOUD_HEADING}</h2>
      <CloudHomeBody view={view} note={note} onCheck={() => check(true)} onUpload={(list) => void uploadDaily(list)} showQueue={showQueue} />
    </section>
  );
}
