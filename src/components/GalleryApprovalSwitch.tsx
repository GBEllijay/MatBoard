import { useEffect, useState } from 'react';
import {
  REQUIRE_APPROVAL_LABEL,
  canSetGalleryApproval,
  writeGalleryApproval,
  type GalleryApprovalSettings,
} from '../lib/galleryApproval';
import { readGalleryApprovalHere } from '../lib/galleryApprovalDefault';
import { listInstructorSeats, type InstructorSeat } from '../lib/instructorSeats';

type Viewer = { role: 'owner' | 'seat' | 'student'; presetId?: string | null };

function load(): GalleryApprovalSettings {
  return readGalleryApprovalHere(typeof localStorage === 'undefined' ? null : localStorage);
}

/** The gallery switch, plus the people the owner names as approvers. Hidden when this person cannot set it. */
export function GalleryApprovalSwitch({ viewer }: { viewer: Viewer }) {
  const [settings, setSettings] = useState<GalleryApprovalSettings>(load);
  const [seats, setSeats] = useState<InstructorSeat[]>([]);
  useEffect(() => {
    setSeats(listInstructorSeats().filter((seat) => seat.status === 'invited' || seat.status === 'active'));
  }, []);
  if (!canSetGalleryApproval(viewer)) return null;

  const save = (next: GalleryApprovalSettings) => {
    setSettings(next);
    writeGalleryApproval(localStorage, next);
  };

  return (
    <fieldset className="invite-form">
      <legend className="sr-only">Gallery approval</legend>
      <label>
        <input
          type="checkbox"
          checked={settings.required}
          onChange={(event) => save({ ...settings, required: event.target.checked })}
        />{' '}
        {REQUIRE_APPROVAL_LABEL}
      </label>
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
                    save({ ...settings, approverSeatIds });
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
