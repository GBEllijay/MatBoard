import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { BeltRail } from './BeltRail';
import { useGymName } from '../hooks/useGymBrand';
import {
  INSTRUCTOR_PERMISSION_FIELDS,
  defaultInstructorPermissions,
  instructorInviteLink,
  issueInstructorInvite,
  listInstructorSeats,
  revokeInstructorSeat,
  subscribeInstructorSeats,
  updateInstructorSeatPermissions,
  type InstructorPermissions,
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
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InstructorPermissions | null>(null);
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
      origin,
    });
    if (!result.ok) {
      setError(issueError(result.reason));
      setIssued(null);
      return;
    }
    setError(null);
    setEmail('');
    setPermissions(defaultInstructorPermissions());
    setIssued({ email: result.seat.email, link: result.inviteLink });
    setCopiedId(null);
    setCopyFailedId(null);
  };

  return (
    <div className="invite-panel">
      <article className="invite-card">
        <BeltRail kind="black" />
        <form className="invite-card__body" onSubmit={submitInvite}>
          <p className="plan-card__kicker">Owner only · Soft beta</p>
          <strong>Generate instructor invite</strong>
          <span>
            Enter an email, set the six permissions, then issue the invite. The link stays on this
            device. Nothing is emailed, billed, or capped.
          </span>
          {gymName ? <span className="invite-gym">Gym · {gymName}</span> : null}
          {issued ? (
            <div className="invite-link" role="status" ref={issuedRef}>
              <p>Invite ready for {issued.email}. Status is invited.</p>
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
        </form>
      </article>

      <section className="invite-card" aria-labelledby={`${formId}-seats`}>
        <BeltRail kind="black" />
        <div className="invite-card__body">
          <h3 id={`${formId}-seats`}>Instructor seats</h3>
          {openSeats.length ? (
            <ul className="invite-seats">
              {openSeats.map((seat) => (
                <SeatRow
                  key={seat.id}
                  seat={seat}
                  origin={origin}
                  editing={editingId === seat.id}
                  draft={editingId === seat.id ? draft : null}
                  confirming={confirmId === seat.id}
                  copied={copiedId === seat.id}
                  copyFailed={copyFailedId === seat.id}
                  onCopy={(link) => void copyLink(seat.id, link)}
                  onEdit={() => {
                    setConfirmId(null);
                    setEditingId(seat.id);
                    setDraft({ ...seat.permissions });
                  }}
                  onDraft={(key) =>
                    setDraft((current) => (current ? { ...current, [key]: !current[key] } : current))
                  }
                  onCancelEdit={() => {
                    setEditingId(null);
                    setDraft(null);
                  }}
                  onSave={() => {
                    if (!draft) return;
                    const saved = updateInstructorSeatPermissions(seat.id, draft);
                    if (!saved.ok) return;
                    setEditingId(null);
                    setDraft(null);
                  }}
                  onAskRevoke={() => {
                    setEditingId(null);
                    setDraft(null);
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
            <span>No open seats yet. Issue an invite to add one.</span>
          )}
          {revokedSeats.length ? (
            <>
              <h3 className="invite-revoked-title">Revoked</h3>
              <ul className="invite-seats">
                {revokedSeats.map((seat) => (
                  <li key={seat.id} className="invite-seat invite-seat--revoked">
                    <strong>{seat.email}</strong>
                    <span>
                      {statusLabel(seat.status)} · {issuedLabel(seat.issuedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </section>
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
  confirming,
  copied,
  copyFailed,
  onCopy,
  onEdit,
  onDraft,
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
  confirming: boolean;
  copied: boolean;
  copyFailed: boolean;
  onCopy: (link: string) => void;
  onEdit: () => void;
  onDraft: (key: keyof InstructorPermissions) => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onAskRevoke: () => void;
  onCancelRevoke: () => void;
  onRevoke: () => void;
}) {
  const link = instructorInviteLink(seat.inviteToken, origin);
  return (
    <li className="invite-seat">
      <strong>{seat.email}</strong>
      <span>
        {statusLabel(seat.status)} · {issuedLabel(seat.issuedAt)}
      </span>
      <span>{permissionSummary(seat.permissions)}</span>
      {editing && draft ? (
        <>
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
          <span>Revoke {seat.email}?</span>
          <div className="invite-actions">
            <button type="button" className="btn" onClick={onRevoke}>
              Revoke seat
            </button>
            <button type="button" className="btn btn--ghost" onClick={onCancelRevoke}>
              Keep seat
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
    </li>
  );
}
