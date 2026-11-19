import { useEffect, useState } from 'react';
import { notifyCloudMedia } from '../lib/advantageCloudMedia';
import { normalizeQrLinks } from '../lib/eventSlides';
import { newCloudEventId, type CloudEvent, type CloudIndexPatch } from '../lib/cloudMediaIndex';
import {
  addToEventPatch,
  patchCloudMediaIndex,
  readCloudMediaIndex,
  removeFromEventPatch,
  type CloudIndexSave,
} from '../lib/cloudMediaFolders';

export type CloudEventTile = { path: string; label: string; thumb?: string };

type Props = {
  tiles: readonly CloudEventTile[];
  events: readonly CloudEvent[];
  canEdit: boolean;
  onPatch: (patch: CloudIndexPatch) => Promise<CloudIndexSave>;
};

export const CLOUD_EVENTS_TITLE = 'Events in Advantage Cloud';
export const CLOUD_EVENTS_HINT =
  'Group photos into an event. The TV plays each event together with its title and QR codes. Every signed-in device sees the same events.';
export const CLOUD_EVENTS_READ_ONLY = 'Approval is on. Only the owner can group photos into events.';
const NEW_EVENT = '__new__';

/**
 * Events grouping for the Cloud Events folder: pick photos (already uploaded),
 * then Add to event. Files never move; the event only lists them.
 */
export function CloudEventsPanel({ tiles, events, canEdit, onPatch }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<string>(events[0]?.id ?? NEW_EVENT);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (patch: CloudIndexPatch, done: string) => {
    setBusy(true);
    const saved = await onPatch(patch);
    setBusy(false);
    setNote(saved.ok ? done : saved.message);
    return saved.ok;
  };

  const toggle = (path: string) =>
    setSelected((current) => (current.includes(path) ? current.filter((p) => p !== path) : [...current, path]));

  const addSelected = async () => {
    if (!selected.length) return;
    const existing = events.find((event) => event.id === target);
    const event: CloudEvent = existing ?? {
      id: newCloudEventId(),
      title: 'New event',
      date: '',
      qrLinks: [],
      items: [],
      order: events.length,
    };
    if (await run(addToEventPatch(events, event, selected), `Added ${selected.length} to ${event.title || 'the event'}.`)) {
      setSelected([]);
      setTarget(event.id);
    }
  };

  return (
    <section className="cloud-events" aria-label={CLOUD_EVENTS_TITLE} data-cloud-events="">
      <h4>{CLOUD_EVENTS_TITLE}</h4>
      <p className="saver-sound-hint">{CLOUD_EVENTS_HINT}</p>
      {!canEdit ? <p className="saver-folder__empty">{CLOUD_EVENTS_READ_ONLY}</p> : null}
      {events.map((event) => (
        <CloudEventEditor
          key={`${event.id}:${event.title}:${event.date}:${event.qrLinks.join('|')}`}
          event={event}
          tiles={tiles}
          canEdit={canEdit && !busy}
          onSave={(change) => run({ events: { upsert: [{ id: event.id, ...change }] } }, 'Saved.')}
          onRemoveItems={(paths) => run(removeFromEventPatch(event, paths), 'Removed from the event. The files are still in Events.')}
          onDelete={() => run({ events: { remove: [event.id] } }, 'Event removed. Its photos are still in Events.')}
        />
      ))}
      {canEdit ? (
        <>
          <p className="saver-sound-hint">Tap photos to select them, then add them to an event.</p>
          <ul className="cloud-events__grid" aria-label="Events photos">
            {tiles.map((tile) => {
              const on = selected.includes(tile.path);
              return (
                <li key={tile.path}>
                  <label className={`cloud-events__tile${on ? ' is-on' : ''}`} data-cloud-event-tile={tile.path}>
                    <input type="checkbox" checked={on} onChange={() => toggle(tile.path)} />
                    {tile.thumb ? <img src={tile.thumb} alt="" /> : <span className="cloud-events__thumb" aria-hidden="true" />}
                    <span>{tile.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="cloud-events__actions">
            <label>
              Event{' '}
              <select value={target} onChange={(e) => setTarget(e.target.value)} data-cloud-event-target="">
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title || 'Untitled event'}
                  </option>
                ))}
                <option value={NEW_EVENT}>New event…</option>
              </select>
            </label>
            <button type="button" className="btn" disabled={busy || !selected.length} onClick={() => void addSelected()} data-cloud-add-to-event="">
              Add to event{selected.length ? ` (${selected.length})` : ''}
            </button>
          </div>
        </>
      ) : null}
      {note ? (
        <p role="status" className="saver-folder__empty" data-cloud-events-note="">
          {note}
        </p>
      ) : null}
    </section>
  );
}

function CloudEventEditor({
  event,
  tiles,
  canEdit,
  onSave,
  onRemoveItems,
  onDelete,
}: {
  event: CloudEvent;
  tiles: readonly CloudEventTile[];
  canEdit: boolean;
  onSave: (change: Partial<CloudEvent>) => Promise<boolean>;
  onRemoveItems: (paths: string[]) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(event.date);
  const [links, setLinks] = useState(event.qrLinks.join('\n'));
  const inEvent = event.items.map((path) => tiles.find((tile) => tile.path === path) ?? { path, label: path.split('/').pop() ?? path });
  return (
    <fieldset className="cloud-event" data-cloud-event={event.id}>
      <legend>{event.title || 'Untitled event'}</legend>
      <label>
        Title
        <input
          type="text"
          value={title}
          maxLength={120}
          disabled={!canEdit}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title.trim() !== event.title) void onSave({ title });
          }}
        />
      </label>
      <label>
        Date
        <input
          type="date"
          value={date}
          disabled={!canEdit}
          onChange={(e) => setDate(e.target.value)}
          onBlur={() => {
            if (date !== event.date) void onSave({ date });
          }}
        />
      </label>
      <label>
        QR links (one per line, up to 6)
        <textarea
          rows={3}
          value={links}
          disabled={!canEdit}
          onChange={(e) => setLinks(e.target.value)}
          onBlur={() => {
            const next = normalizeQrLinks(links.split(/\s*\n\s*/));
            if (next.join('|') !== event.qrLinks.join('|')) void onSave({ qrLinks: next });
          }}
        />
      </label>
      <p className="saver-sound-hint">
        {inEvent.length} photo{inEvent.length === 1 ? '' : 's'} in this event.
      </p>
      <ul className="cloud-events__strip">
        {inEvent.map((tile) => (
          <li key={tile.path}>
            {'thumb' in tile && tile.thumb ? <img src={tile.thumb} alt="" /> : null}
            <span>{tile.label}</span>
            {canEdit ? (
              <button type="button" className="btn btn--ghost" onClick={() => void onRemoveItems([tile.path])}>
                Take out
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <button type="button" className="btn btn--ghost" onClick={() => void onDelete()}>
          Remove event
        </button>
      ) : null}
    </fieldset>
  );
}

/**
 * The same events grouping inside the Advantage Cloud Events folder on the Gallery page.
 * Reads and saves the folder details itself. Renders nothing when this device is not on Cloud.
 */
export function CloudEventsFromCloud({ tiles }: { tiles: readonly CloudEventTile[] }) {
  const [state, setState] = useState<{ events: CloudEvent[]; canEdit: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void readCloudMediaIndex({ folder: 'events' }).then((read) => {
      if (cancelled || !read || 'error' in read) return;
      setState({ events: read.index.events, canEdit: read.canEdit });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!state) return null;
  return (
    <CloudEventsPanel
      tiles={tiles}
      events={state.events}
      canEdit={state.canEdit}
      onPatch={async (patch) => {
        const saved = await patchCloudMediaIndex({ folder: 'events', patch });
        if (saved.ok) {
          setState((current) => (current ? { ...current, events: saved.index.events } : current));
          notifyCloudMedia();
        }
        return saved;
      }}
    />
  );
}
