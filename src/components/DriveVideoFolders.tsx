import { useEffect, useState } from 'react';
import {
  DRIVE_VIDEO_SHOW_LIMIT,
  driveVideoCountLabel,
  renameDriveVideoName,
  videoDateFolderName,
  type DriveVideoPresentation,
} from '../lib/driveVideoNames';
import type { DriveVideoGroup } from '../lib/googleDrive';

type GalleryClip = {
  id: string;
  label: string;
  addedAt?: number;
};

type Row = DriveVideoPresentation & {
  key: string;
  source: 'gallery' | 'drive';
  dateKey: string;
};

type Props = {
  selectedDate: string;
  groups: readonly DriveVideoGroup[];
  gallery?: readonly GalleryClip[];
  onRename?: (fileId: string, name: string) => Promise<void>;
};

function galleryRow(clip: GalleryClip, dateKey: string): Row {
  const timeLabel = clip.addedAt
    ? new Date(clip.addedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';
  const shortLabel = clip.label.trim() || 'Clip';
  return {
    key: `gallery-${clip.id}`,
    source: 'gallery',
    dateKey,
    id: clip.id,
    label: clip.label,
    mime: 'video/mp4',
    shortLabel,
    timeLabel,
    displayLabel: timeLabel ? `${shortLabel} · ${timeLabel}` : shortLabel,
    detailLabel: '',
    thumbnailLink: null,
  };
}

function driveRow(video: DriveVideoGroup['videos'][number]): Row {
  return { ...video, key: `drive-${video.id}`, source: 'drive', dateKey: video.dateKey };
}

/**
 * Collapsible date folders for the Daily Lesson Plan Drive video list.
 * The selected day starts open. Other days stay collapsed.
 */
export function DriveVideoFolders({ selectedDate, groups, gallery = [], onRename }: Props) {
  const [openDates, setOpenDates] = useState<ReadonlySet<string>>(() => new Set([selectedDate]));
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    setOpenDates(new Set([selectedDate]));
    setShowAll({});
    setDetailKey(null);
    setEditingKey(null);
    setNote('');
  }, [selectedDate]);

  const folders = groups.map((group) => ({
    dateKey: group.dateKey,
    heading: group.heading,
    rows: [
      ...(group.dateKey === selectedDate ? gallery.map((clip) => galleryRow(clip, group.dateKey)) : []),
      ...group.videos.map(driveRow),
    ],
  }));
  if (gallery.length && !folders.some((folder) => folder.dateKey === selectedDate)) {
    folders.unshift({
      dateKey: selectedDate,
      heading: videoDateFolderName(selectedDate),
      rows: gallery.map((clip) => galleryRow(clip, selectedDate)),
    });
  }
  if (!folders.length) return null;

  const toggle = (dateKey: string) => {
    setOpenDates((current) => {
      const next = new Set(current);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  };

  const saveRename = async (row: Row) => {
    if (!onRename || row.source !== 'drive') return;
    const next = renameDriveVideoName(row.label, draft);
    if (next === row.label) {
      setEditingKey(null);
      return;
    }
    setBusy(true);
    setNote('');
    try {
      await onRename(row.id, next);
      setEditingKey(null);
      setNote('Renamed in Google Drive.');
    } catch (reason) {
      setNote(reason instanceof Error ? reason.message : 'That clip could not be renamed in Google Drive.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="drive-videos">
      {folders.map((folder) => {
        const open = openDates.has(folder.dateKey);
        const selected = folder.dateKey === selectedDate;
        const expanded = Boolean(showAll[folder.dateKey]);
        const visible = expanded ? folder.rows : folder.rows.slice(0, DRIVE_VIDEO_SHOW_LIMIT);
        const hidden = folder.rows.length - visible.length;
        return (
          <section key={folder.dateKey} className="drive-videos__day" aria-label={folder.heading}>
            <button
              type="button"
              className={selected ? 'drive-videos__toggle drive-videos__toggle--on' : 'drive-videos__toggle'}
              aria-expanded={open}
              onClick={() => toggle(folder.dateKey)}
            >
              <span className="drive-videos__heading">{folder.heading}</span>
              <span className="drive-videos__count">{driveVideoCountLabel(folder.rows.length)}</span>
            </button>
            {open ? (
              <ul className="drive-videos__list">
                {visible.map((row) => {
                  const editing = editingKey === row.key;
                  return (
                    <li key={row.key} className="drive-videos__row">
                      {row.thumbnailLink ? (
                        <img src={row.thumbnailLink} alt="" />
                      ) : (
                        <span className="drive-videos__thumb" aria-hidden="true" />
                      )}
                      <div className="drive-videos__copy">
                        {editing ? (
                          <form
                            className="drive-videos__rename-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void saveRename(row);
                            }}
                          >
                            <input
                              className="drive-videos__rename-input"
                              value={draft}
                              aria-label={`New name for ${row.displayLabel}`}
                              disabled={busy}
                              onChange={(event) => setDraft(event.target.value)}
                            />
                            <button type="submit" className="drive-videos__rename" disabled={busy}>
                              Save
                            </button>
                            <button
                              type="button"
                              className="drive-videos__rename"
                              disabled={busy}
                              onClick={() => setEditingKey(null)}
                            >
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="drive-videos__label"
                              title={row.label}
                              onClick={() => setDetailKey((current) => (current === row.key ? null : row.key))}
                            >
                              {row.displayLabel}
                            </button>
                            {detailKey === row.key ? (
                              <p className="drive-videos__full" title={row.label}>
                                {row.label}
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                      <div className="drive-videos__side">
                        {row.detailLabel ? <span className="drive-videos__meta">{row.detailLabel}</span> : null}
                        {row.source === 'drive' && onRename && !editing ? (
                          <button
                            type="button"
                            className="drive-videos__rename"
                            onClick={() => {
                              setEditingKey(row.key);
                              setDraft(row.label);
                              setNote('');
                            }}
                          >
                            Rename
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
                {folder.rows.length > DRIVE_VIDEO_SHOW_LIMIT ? (
                  <li>
                    <button
                      type="button"
                      className="drive-videos__more"
                      onClick={() => setShowAll((current) => ({ ...current, [folder.dateKey]: !expanded }))}
                    >
                      {hidden > 0 ? 'Show more' : 'Show less'}
                    </button>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </section>
        );
      })}
      {note ? (
        <p className="drive-videos__note" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
