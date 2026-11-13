import { useState } from 'react';
import {
  dismissReviewVideoPacket,
  formatDuration,
  ingestReviewVideoPacket,
  readReviewVideoInbox,
  type MemoryStore,
  type ReviewVideoPacket,
} from '../lib/ownerGatedDistribution';
import { loadFilms, putFilmBlob, type StudentFilm } from '../lib/studentFilm';
import { originCanStore } from '../lib/storageQuota';
import '../preview/ownerGated/ownerGated.css';

export function ReviewVideoInbox({
  storage,
  studentId,
  packets,
  onReceived,
  seedBlob,
}: {
  storage: MemoryStore;
  studentId?: string;
  packets?: ReviewVideoPacket[];
  onReceived?: (films: StudentFilm[]) => void;
  seedBlob?: Blob;
}) {
  const list = packets ?? readReviewVideoInbox(storage, studentId);
  const [note, setNote] = useState('');
  if (!list.length) return null;

  const accept = async (packet: ReviewVideoPacket) => {
    const blob = seedBlob ?? new Blob([new Uint8Array([0, 0, 0, 1])], { type: packet.media.mime || 'video/mp4' });
    const result = await ingestReviewVideoPacket(packet, storage, {
      films: loadFilms(storage),
      blob,
      canStore: originCanStore,
      putBlob: putFilmBlob,
    });
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    setNote(result.message);
    onReceived?.(result.films);
  };

  return (
    <section className="ogate__card coach-update" aria-label="From your coach">
      <h2>From your coach</h2>
      {list.map((packet) => (
        <article key={packet.id}>
          {packet.media.thumbnailDataUrl ? <img className="ogate__thumb" src={packet.media.thumbnailDataUrl} alt="" /> : null}
          <p className="ogate__meta">
            <strong>{packet.title}</strong>
            {packet.lesson ? ` · ${packet.lesson}` : ''}
            {packet.media.durationMs ? ` · ${formatDuration(packet.media.durationMs)}` : ''}
          </p>
          {packet.note ? <p>{packet.note}</p> : null}
          {packet.kidCard ? <p>Kid card is on file. You can still add this to your journal video library.</p> : null}
          <div className="ogate__actions">
            <button type="button" onClick={() => void accept(packet)}>
              Add to journal video library
            </button>
            <button type="button" className="ogate__btn--ghost" onClick={() => dismissReviewVideoPacket(storage, packet.id)}>
              Dismiss
            </button>
          </div>
        </article>
      ))}
      {note ? (
        <p className="ogate__status" role="status">
          {note}
        </p>
      ) : null}
    </section>
  );
}
