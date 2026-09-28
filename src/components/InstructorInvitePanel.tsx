import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useGymName } from '../hooks/useGymBrand';
import {
  INSTRUCTOR_PERMISSION_FIELDS,
  INSTRUCTOR_PRESETS,
  defaultInstructorPermissions,
  instructorInviteLink,
  instructorPresetPermissions,
  instructorSeatBandLabel,
  issueInstructorInvite,
  listInstructorSeats,
  revokeInstructorSeat,
  subscribeInstructorSeats,
  updateInstructorSeatPermissions,
  type InstructorPermissions,
  type InstructorPresetId,
  type InstructorSeat,
  type SeatStatus,
} from '../lib/instructorSeats';

type IssuedLink = {
  email: string;
  link: string;
};

function statusLabel(status: SeatStatus): string {
  if (status === 'invited') return 'Invited';
  if (status === 'active') return 'Active';
  return 'Revoked';
}

function issuedLabel(issuedAt: number): string {
  return new Date(issuedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function permissionSummary(permissions: InstructorPermissions): string {
  const on = INSTRUCTOR_PERMISSION_FIELDS.filter((field) => permissions[field.key]).map(
    (field) => field.label,
  );
  if (!on.length) return 'All permissions off';
  return on.join(' · ');
}

function issueError(reason: 'email' | 'duplicate' | 'storage'): string {
  if (reason === 'duplicate') return 'That email already has an open seat.';
  if (reason === 'storage') return 'This device could not save the seat.';
  return "Enter the instructor's email.";
}

function useInstructorSeats(): InstructorSeat[] {
  const [seats, setSeats] = useState(() => listInstructorSeats());
  useEffect(() => subscribeInstructorSeats(() => setSeats(listInstructorSeats())), []);
  return seats;
}

export function InstructorInvitePanel() {
  const formId = useId();
  const gymName = useGymName();
  const seats = useInstructorSeats();
  const [email, setEmail] = useState('');
  const [permissions, setPermissions] = useState<InstructorPermissions>(() => defaultInstructorPermissions());
  const [presetId, setPresetId] = useState<InstructorPresetId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InstructorPermissions | null>(null);
  const [draftPresetId, setDraftPresetId] = useState<InstructorPresetId | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyFailedId, setCopyFailedId] = useState<string | null>(null);
  const issuedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!copiedId) return;
    const timer = window.setTimeout(() => setCopiedId(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copiedId]);

  useEffect(() => {
    if (!issued) return;
    issuedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [issued]);

  const openSeats = seats.filter((seat) => seat.status === 'invited' || seat.status === 'active');
  const revokedSeats = seats.filter((seat) => seat.status === 'revoked');
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  const copyLink = async (id: string, link: string) => {
    setCopyFailedId(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard');
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
    } catch {
      setCopiedId(null);
      setCopyFailedId(id);
    }
  };

  const submitInvite = (event: FormEvent) => {
    event.preventDefault();
    const result = issueInstructorInvite({
      email,
      permissions,
      presetId,
      origin,
    });
    if (!result.ok) {
      setError(issueError(result.reason));
      setIssued(null);
      return;
    }
    setError(null);
    setEmail('');
    setPresetId(null);
    setPermissions(defaultInstructorPermissions());
    setIssued({ email: result.seat.email, link: result.inviteLink });
    setCopiedId(null);
    setCopyFailedId(null);
  };

  const formKind = presetId ?? 'unset';

  return (
    <div className="invite-panel">
      <form className={`wristband wristband--${formKind}`} onSubmit={submitInvite}>
        <span className="wristband__clasp" aria-hidden="true" />
        <div className="wristband__face">
          <p className="wristband__kicker">Owner only · Soft beta</p>
          <strong>Generate instructor invite</strong>
          <span>
            Pick a wristband, then change any switch for this person. The link stays on this
            device. Nothing is emailed, billed, or capped.
          </span>
          {gymName ? <span className="invite-gym">Gym · {gymName}</span> : null}
          {issued ? (
            <div className="invite-link" role="status" ref={issuedRef}>
              <p>Wristband on {issued.email}. Status is invited.</p>
              <label htmlFor={`${formId}-issued-link`}>
                Invite link
                <input
                  id={`${formId}-issued-link`}
                  readOnly
                  value={issued.link}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => void copyLink('issued', issued.link)}
              >
                {copiedId === 'issued' ? 'Copied' : 'Copy invite link'}
              </button>
              {copyFailedId === 'issued' ? (
                <span>Select the link and copy it from there.</span>
              ) : null}
            </div>
          ) : null}
          <PresetBands
            selected={presetId}
            onSelect={(id) => {
              setPresetId(id);
              setPermissions(instructorPresetPermissions(id));
            }}
          />
          <label className="invite-field" htmlFor={`${formId}-email`}>
            Instructor email
            <input
              id={`${formId}-email`}
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={254}
              placeholder="name@gym.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
            />
          </label>
          <PermissionSwitches
            legendId={`${formId}-permissions`}
            permissions={permissions}
            onToggle={(key) => setPermissions((current) => ({ ...current, [key]: !current[key] }))}
          />
          {error ? (
            <p className="invite-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn">
            Issue invite
          </button>
        </div>
        <span className="wristband__tail" aria-hidden="true" />
      </form>

      <section className="wristband-list" aria-labelledby={`${formId}-seats`}>
        <h3 id={`${formId}-seats`}>Wristbands</h3>
        {openSeats.length ? (
          <ul className="invite-seats">
            {openSeats.map((seat) => (
              <SeatRow
                key={seat.id}
                seat={seat}
                origin={origin}
                editing={editingId === seat.id}
                draft={editingId === seat.id ? draft : null}
                draftPresetId={editingId === seat.id ? draftPresetId : null}
                confirming={confirmId === seat.id}
                copied={copiedId === seat.id}
                copyFailed={copyFailedId === seat.id}
                onCopy={(link) => void copyLink(seat.id, link)}
                onEdit={() => {
                  setConfirmId(null);
                  setEditingId(seat.id);
                  setDraft({ ...seat.permissions });
                  setDraftPresetId(seat.presetId);
                }}
                onDraft={(key) =>
                  setDraft((current) => (current ? { ...current, [key]: !current[key] } : current))
                }
                  onCancelEdit={() => {
                    setEditingId(null);
                    setDraft(null);
                    setDraftPresetId(null);
                  }}
                  onSave={() => {
                    if (!draft) return;
                    const saved = updateInstructorSeatPermissions(seat.id, draft, draftPresetId);
                    if (!saved.ok) return;
                    setEditingId(null);
                    setDraft(null);
                    setDraftPresetId(null);
                  }}
                  onPreset={(id) => {
                    setDraftPresetId(id);
                    setDraft(instructorPresetPermissions(id));
                  }}
                  onAskRevoke={() => {
                    setEditingId(null);
                    setDraft(null);
                    setDraftPresetId(null);
                    setConfirmId(seat.id);
                  }}
                onCancelRevoke={() => setConfirmId(null)}
                onRevoke={() => {
                  revokeInstructorSeat(seat.id);
                  setConfirmId(null);
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="wristband-list__empty">
            No wristbands on the mat yet. Issue an invite to put one on a coach.
          </p>
        )}
        {revokedSeats.length ? (
          <>
            <h3 className="invite-revoked-title">Taken off</h3>
            <ul className="invite-seats">
              {revokedSeats.map((seat) => (
                <WristbandShell key={seat.id} presetId={seat.presetId} revoked>
                  <strong>{seat.email}</strong>
                  <span>
                    {instructorSeatBandLabel(seat.presetId, seat.permissions)} · {statusLabel(seat.status)} ·{' '}
                    {issuedLabel(seat.issuedAt)}
                  </span>
                </WristbandShell>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}

function WristbandShell({
  presetId,
  revoked = false,
  children,
}: {
  presetId: InstructorPresetId | null;
  revoked?: boolean;
  children: ReactNode;
}) {
  const kind = presetId ?? 'unset';
  return (
    <li className={`wristband wristband--${kind}${revoked ? ' wristband--revoked' : ''}`}>
      <span className="wristband__clasp" aria-hidden="true" />
      <div className="wristband__face">{children}</div>
      <span className="wristband__tail" aria-hidden="true" />
    </li>
  );
}

function PresetBands({
  selected,
  onSelect,
}: {
  selected: InstructorPresetId | null;
  onSelect: (id: InstructorPresetId) => void;
}) {
  return (
    <div className="preset-bands" role="radiogroup" aria-label="Wristband preset">
      {INSTRUCTOR_PRESETS.map((preset) => {
        const on = selected === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={on}
            className={`preset-band preset-band--${preset.id}${on ? ' preset-band--on' : ''}`}
            onClick={() => onSelect(preset.id)}
          >
            <span className="preset-band__clasp" aria-hidden="true" />
            <span className="preset-band__copy">
              <span className="preset-band__name">{preset.label}</span>
              <span className="preset-band__detail">{preset.detail}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PermissionSwitches({
  legendId,
  permissions,
  onToggle,
}: {
  legendId: string;
  permissions: InstructorPermissions;
  onToggle: (key: keyof InstructorPermissions) => void;
}) {
  return (
    <fieldset className="invite-permissions" aria-labelledby={legendId}>
      <legend id={legendId}>Permissions</legend>
      {INSTRUCTOR_PERMISSION_FIELDS.map((field) => {
        const on = permissions[field.key];
        return (
          <button
            key={field.key}
            type="button"
            className={on ? 'invite-switch invite-switch--on' : 'invite-switch'}
            role="switch"
            aria-checked={on}
            onClick={() => onToggle(field.key)}
          >
            <span className="invite-switch__track" aria-hidden="true" />
            <span className="invite-switch__label">{field.label}</span>
            <span className="invite-switch__state">{on ? 'On' : 'Off'}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

function SeatRow({
  seat,
  origin,
  editing,
  draft,
  draftPresetId,
  confirming,
  copied,
  copyFailed,
  onCopy,
  onEdit,
  onDraft,
  onPreset,
  onCancelEdit,
  onSave,
  onAskRevoke,
  onCancelRevoke,
  onRevoke,
}: {
  seat: InstructorSeat;
  origin: string;
  editing: boolean;
  draft: InstructorPermissions | null;
  draftPresetId: InstructorPresetId | null;
  confirming: boolean;
  copied: boolean;
  copyFailed: boolean;
  onCopy: (link: string) => void;
  onEdit: () => void;
  onDraft: (key: keyof InstructorPermissions) => void;
  onPreset: (id: InstructorPresetId) => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onAskRevoke: () => void;
  onCancelRevoke: () => void;
  onRevoke: () => void;
}) {
  const link = instructorInviteLink(seat.inviteToken, origin);
  const shown = editing && draft ? draft : seat.permissions;
  const shownPreset = editing ? draftPresetId : seat.presetId;
  const kind = shownPreset ?? 'unset';
  return (
    <li className={`wristband wristband--${kind}`}>
      <span className="wristband__clasp" aria-hidden="true" />
      <div className="wristband__face">
      <p className="wristband__kicker">{instructorSeatBandLabel(shownPreset, shown)}</p>
      <strong>{seat.email}</strong>
      <span>
        {statusLabel(seat.status)} · {issuedLabel(seat.issuedAt)}
      </span>
      <span>{permissionSummary(shown)}</span>
      {editing && draft ? (
        <>
          <PresetBands selected={draftPresetId} onSelect={onPreset} />
          <PermissionSwitches
            legendId={`edit-${seat.id}`}
            permissions={draft}
            onToggle={onDraft}
          />
          <div className="invite-actions">
            <button type="button" className="btn" onClick={onSave}>
              Save permissions
            </button>
            <button type="button" className="btn btn--ghost" onClick={onCancelEdit}>
              Cancel
            </button>
          </div>
        </>
      ) : confirming ? (
        <div className="invite-confirm" role="group" aria-label={`Revoke ${seat.email}`}>
          <span>Take this wristband off {seat.email}?</span>
          <div className="invite-actions">
            <button type="button" className="btn" onClick={onRevoke}>
              Revoke
            </button>
            <button type="button" className="btn btn--ghost" onClick={onCancelRevoke}>
              Keep wristband
            </button>
          </div>
        </div>
      ) : (
        <div className="invite-actions">
          <button type="button" className="btn btn--ghost" onClick={() => onCopy(link)}>
            {copied ? 'Copied' : 'Copy invite link'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onEdit}>
            Edit permissions
          </button>
          <button type="button" className="btn btn--ghost" onClick={onAskRevoke}>
            Revoke
          </button>
        </div>
      )}
      {copyFailed ? (
        <label>
          Invite link
          <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
        </label>
      ) : null}
      </div>
      <span className="wristband__tail" aria-hidden="true" />
    </li>
  );
}
