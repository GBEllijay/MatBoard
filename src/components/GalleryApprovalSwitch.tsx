import { useEffect, useState } from 'react';
import {
  REQUIRE_APPROVAL_LABEL,
  canSetGalleryApproval,
  writeGalleryApproval,
  type GalleryApprovalSettings,
} from '../lib/galleryApproval';
import { readGalleryApprovalHere } from '../lib/galleryApprovalDefault';
import { fetchCloudGalleryApproval, saveCloudGalleryApproval } from '../lib/advantageCloudMedia';
import { listInstructorSeats, type InstructorSeat } from '../lib/instructorSeats';

type Viewer = { role: 'owner' | 'seat' | 'student'; presetId?: string | null };

function load(): GalleryApprovalSettings {
  return readGalleryApprovalHere(typeof localStorage === 'undefined' ? null : localStorage);
}

export const CLOUD_APPROVAL_OWNER_HINT =
  "This is the gym-wide Advantage Cloud setting. Only the owner can change it. Photos that stay on this phone or go to Google Drive or OneDrive still use this device's own approval setting.";

export const CLOUD_APPROVAL_SEAT_HINT = 'Only the owner can change the Advantage Cloud approval setting.';

/** The gallery switch, plus the people the owner names as approvers. Hidden when this person cannot set it. */
export function GalleryApprovalSwitch({ viewer }: { viewer: Viewer }) {
  const [settings, setSettings] = useState<GalleryApprovalSettings>(load);
  const [seats, setSeats] = useState<InstructorSeat[]>([]);
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudRequired, setCloudRequired] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    setSeats(listInstructorSeats().filter((seat) => seat.status === 'invited' || seat.status === 'active'));
  }, []);
  useEffect(() => {
    let cancelled = false;
    void fetchCloudGalleryApproval().then((result) => {
      if (cancelled || !result.ok) return;
      setCloudReady(true);
      setCloudRequired(result.required);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const canEditLocal = canSetGalleryApproval(viewer) && !cloudReady;
  const canEditCloud = viewer.role === 'owner' && cloudReady;
  if (!cloudReady && !canSetGalleryApproval(viewer)) return null;
  if (cloudReady && viewer.role !== 'owner' && viewer.role !== 'seat') return null;

  const saveLocal = (next: GalleryApprovalSettings) => {
    setSettings(next);
    writeGalleryApproval(localStorage, next);
  };

  const checked = cloudReady ? cloudRequired : settings.required;
  const disabled = busy || (cloudReady ? !canEditCloud : !canEditLocal);

  return (
    <fieldset className="invite-form">
      <legend className="sr-only">Gallery approval</legend>
      <label>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => {
            const required = event.target.checked;
            if (canEditCloud) {
              setBusy(true);
              setCloudRequired(required);
              setNote('');
              void saveCloudGalleryApproval(required).then((result) => {
                setBusy(false);
                if (result.ok) {
                  setCloudRequired(result.required);
                  return;
                }
                setNote(result.error);
                void fetchCloudGalleryApproval().then((fresh) => {
                  if (fresh.ok) setCloudRequired(fresh.required);
                });
              });
              return;
            }
            if (canEditLocal) saveLocal({ ...settings, required });
          }}
        />{' '}
        {REQUIRE_APPROVAL_LABEL}
      </label>
      {cloudReady ? (
        <p className="invite-form__note">{canEditCloud ? CLOUD_APPROVAL_OWNER_HINT : CLOUD_APPROVAL_SEAT_HINT}</p>
      ) : null}
      {note ? (
        <p className="invite-form__note" role="status">
          {note}
        </p>
      ) : null}
      {viewer.role === 'owner' ? (
        <div>
          {seats.map((seat) => {
            const on = settings.approverSeatIds.includes(seat.id);
            return (
              <label key={seat.id}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(event) => {
                    const approverSeatIds = event.target.checked
                      ? [...settings.approverSeatIds, seat.id]
                      : settings.approverSeatIds.filter((id) => id !== seat.id);
                    saveLocal({ ...settings, approverSeatIds });
                  }}
                />{' '}
                {seat.email} can approve gallery photos and videos
              </label>
            );
          })}
        </div>
      ) : null}
    </fieldset>
  );
}
