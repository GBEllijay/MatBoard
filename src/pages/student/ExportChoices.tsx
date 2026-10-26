import {
  studentExportBusyLabel,
  studentExportDetail,
  studentExportLabel,
  videoFilesLine,
  type StudentExportKind,
} from '../../lib/studentBackup';
import { todayIso } from '../../lib/studentEdition';

const OTHER_EXPORTS: readonly StudentExportKind[] = ['csv', 'progressPdf', 'assessmentPdf'];

/**
 * Backup downloads one JSON file. The other three exports are their own buttons.
 * `arena` is the Backup & Print page. `paper` is the older Connections page.
 */
export function ExportChoices({
  variant,
  includeVideos,
  onIncludeVideos,
  locked,
  busyKind,
  stamp,
  showStamp,
  onExport,
}: {
  variant: 'arena' | 'paper';
  includeVideos: boolean;
  onIncludeVideos: (included: boolean) => void;
  locked: boolean;
  busyKind: StudentExportKind | null;
  stamp: string;
  showStamp: boolean;
  onExport: (kind: StudentExportKind) => void;
}) {
  const paper = variant === 'paper';
  const day = todayIso();
  const videoId = paper ? 'connections-video-state' : 'backup-video-state';
  return (
    <div className={paper ? 'student-export' : 's-export'}>
      {showStamp ? <p className="student-export__stamp">Last backup: {stamp}</p> : null}
      <label className={paper ? 'student-export__check' : 's-backup__check'}>
        <input
          type="checkbox"
          checked={includeVideos}
          disabled={locked}
          aria-describedby={videoId}
          onChange={(event) => onIncludeVideos(event.target.checked)}
        />
        <span>Include video files kept on this device</span>
      </label>
      <p className={paper ? 'student-export__videos' : 's-backup__videos'}>
        <span
          className={paper ? 'student-export__state' : 's-backup__videos-state'}
          data-on={includeVideos ? 'yes' : 'no'}
          aria-hidden="true"
        >
          {includeVideos ? 'On' : 'Off'}
        </span>
        <span id={videoId}>{videoFilesLine(includeVideos)}</span>
      </p>
      <button type="button" className={paper ? 'ink-btn ink-btn--save' : 's-cta'} disabled={locked} onClick={() => onExport('json')}>
        {busyKind === 'json' ? studentExportBusyLabel('json') : studentExportLabel('json')}
      </button>
      <p className={paper ? 'student-export__note' : 's-export__note'}>{studentExportDetail('json', day)}</p>
      {paper ? <h3 className="student-export__kicker">Other exports</h3> : <h2 className="s-kicker">Other exports</h2>}
      <ul className={paper ? 'student-export__list' : 's-export-list'}>
        {OTHER_EXPORTS.map((kind) => (
          <li key={kind}>
            <button type="button" className="ink-btn" disabled={locked} onClick={() => onExport(kind)}>
              {busyKind === kind ? studentExportBusyLabel(kind) : studentExportLabel(kind)}
            </button>
            <p className={paper ? 'student-export__note' : 's-export__note'}>{studentExportDetail(kind, day)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
