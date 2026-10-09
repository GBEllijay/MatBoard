import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useGymName } from '../hooks/useGymBrand';
import { DRIVE_HANDOFF_SAVED, publishSeatToGym } from '../lib/driveHandoff';
import { SITE_FEEDBACK_EMAIL } from '../lib/siteFooter';
import { DriveHandoffGuide, useDriveConnected } from './DriveHandoffGuide';
import { useCurrentSeat } from './SeatSessionBar';
import {
  INSTRUCTOR_PERMISSION_FIELDS,
  INSTRUCTOR_PRESETS,
  PRO_INSTRUCTOR_SEAT_CAP,
  PRO_SEAT_CAP_REQUEST_NOTE,
  countOpenInstructorSeats,
  defaultInstructorPermissions,
  instructorInviteLink,
  instructorPresetPermissions,
  instructorPresetPlan,
  instructorSeatBinderLabel,
  issueInstructorInvite,
  listInstructorSeats,
  proSeatCapBlockedCopy,
  proSeatCapNear,
  proSeatRemainingLabel,
  proSeatUsageLabel,
  revokeInstructorSeat,
  subscribeInstructorSeats,
  updateInstructorSeatPermissions,
  type InstructorPermissions,
  type InstructorPresetId,
  type InstructorSeat,
  type IssueInviteFailure,
  type SeatStatus,
} from '../lib/instructorSeats';

type IssuedLink = {
  email: string;
  link: string;
  plan: ReturnType<typeof instructorPresetPlan>;
  presetId: InstructorPresetId | null;
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

function issueError(reason: IssueInviteFailure): string {
  if (reason === 'duplicate') return 'That email already has an open seat.';
  if (reason === 'storage') return 'This device could not save the seat.';
  if (reason === 'cap') return proSeatCapBlockedCopy();
  if (reason === 'owner') return 'Only the gym owner can issue invites.';
  return "Enter the instructor's email.";
}

function SeatCapRequestNote() {
  const emailAt = PRO_SEAT_CAP_REQUEST_NOTE.indexOf(SITE_FEEDBACK_EMAIL);
  if (emailAt < 0) return <p className="invite-cap-note">{PRO_SEAT_CAP_REQUEST_NOTE}</p>;
  return (
    <p className="invite-cap-note">
      {PRO_SEAT_CAP_REQUEST_NOTE.slice(0, emailAt)}
      <a href={`mailto:${SITE_FEEDBACK_EMAIL}`}>{SITE_FEEDBACK_EMAIL}</a>
      {PRO_SEAT_CAP_REQUEST_NOTE.slice(emailAt + SITE_FEEDBACK_EMAIL.length)}
    </p>
  );
}

function useInstructorSeats(): InstructorSeat[] {
  const [seats, setSeats] = useState(() => listInstructorSeats());
  useEffect(() => subscribeInstructorSeats(() => setSeats(listInstructorSeats())), []);
  return seats;
}

export function InstructorInvitePanel() {
  const formId = useId();
  const gymName = useGymName();
  const currentSeat = useCurrentSeat();
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
  const [handoffNote, setHandoffNote] = useState<string | null>(null);
  const driveConnected = useDriveConnected();
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

  if (currentSeat) {
    return (
      <section className="invite-owner-only" aria-label="Instructor invites">
        <p>Only the gym owner can issue invites. This seat cannot create or send them.</p>
      </section>
    );
  }

  const openSeats = seats.filter((seat) => seat.status === 'invited' || seat.status === 'active');
  const revokedSeats = seats.filter((seat) => seat.status === 'revoked');
  const seatsUsed = countOpenInstructorSeats(seats);
  const atCap = seatsUsed >= PRO_INSTRUCTOR_SEAT_CAP;
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
      setIssued(null);
      setError(result.reason === 'cap' ? null : issueError(result.reason));
      return;
    }
    setError(null);
    setEmail('');
    setPresetId(null);
    setPermissions(defaultInstructorPermissions());
    setIssued({
      email: result.seat.email,
      link: result.inviteLink,
      plan: instructorPresetPlan(presetId),
      presetId,
    });
    setCopiedId(null);
    setCopyFailedId(null);
    setHandoffNote(null);
    void publishSeatToGym(result.seat).then((sent) => {
      setHandoffNote(sent === 'saved' ? DRIVE_HANDOFF_SAVED : null);
    });
  };

  return (
    <div className="invite-panel">
      <form className="invite-stack" onSubmit={submitInvite}>
        <div className="invite-form">
          <p className="invite-form__kicker">Owner only · Soft beta</p>
          <strong>Generate instructor invite</strong>
          <span className="invite-form__note">
            Pick a role, then change any switch for this person. The role chooses which menus
            open. Inside those menus, cloud and sharing match the owner. The link stays on this
            device until the gym Google Drive folder carries it. Nothing is emailed or billed.
          </span>
          {gymName ? <span className="invite-gym">Gym · {gymName}</span> : null}
          <div className="invite-seat-cap" role="status" aria-live="polite">
            <p className="invite-seat-cap__count">{proSeatUsageLabel(seatsUsed)}</p>
            <p className="invite-seat-cap__remaining">{proSeatRemainingLabel(seatsUsed)}</p>
            <SeatCapRequestNote />
          </div>
          {issued ? (
            <div className="invite-link" role="status" ref={issuedRef}>
              <div className="invite-link__copy">
              <p>Invite for {issued.email}. Status is invited.</p>
              <PlanBadge presetId={issued.presetId} />
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
              {handoffNote ? <p role="status">{handoffNote}</p> : null}
              </div>
            </div>
          ) : null}
          {driveConnected ? null : <DriveHandoffGuide />}
          </div>
          <label className="invite-field invite-field--lead" htmlFor={`${formId}-email`}>
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
            <span className="invite-field__hint">
              Advantage does not send email. Copy the invite link after you issue it.
            </span>
          </label>
          <RoleOptions
            selected={presetId}
            onSelect={(id) => {
              setPresetId(id);
              setPermissions(instructorPresetPermissions(id));
            }}
          />
          <div className="invite-form">
          <PermissionSwitches
            legendId={`${formId}-permissions`}
            permissions={permissions}
            onToggle={(key) => setPermissions((current) => ({ ...current, [key]: !current[key] }))}
          />
          {atCap ? (
            <p className="invite-error" id={`${formId}-cap`} role="alert">
              {proSeatCapBlockedCopy()}
            </p>
          ) : null}
          {error ? (
            <p className="invite-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="btn"
            disabled={atCap}
            aria-describedby={atCap ? `${formId}-cap` : undefined}
          >
            Issue invite
          </button>
          </div>
      </form>

      <section className="binder-list" aria-labelledby={`${formId}-seats`}>
        <div className="binder-list__head">
          <h3 id={`${formId}-seats`}>Binders</h3>
          <p className="binder-list__seats">
            {proSeatUsageLabel(seatsUsed)} · {proSeatRemainingLabel(seatsUsed)}
          </p>
          {proSeatCapNear(seatsUsed) ? <SeatCapRequestNote /> : null}
        </div>
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
                  const revoked = revokeInstructorSeat(seat.id);
                  setConfirmId(null);
                  if (revoked.ok) void publishSeatToGym(revoked.seat);
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="binder-list__empty">
            No binders yet. Issue an invite to hand a coach the class details.
          </p>
        )}
        {revokedSeats.length ? (
          <>
            <h3 className="invite-revoked-title">Revoked</h3>
            <ul className="invite-seats">
              {revokedSeats.map((seat) => (
                <li key={seat.id} className="seat-card seat-card--revoked">
                  <div className="seat-card__body">
                    <strong>{seat.email}</strong>
                    <PlanBadge presetId={seat.presetId} />
                    <span>
                      {instructorSeatBinderLabel(seat.presetId, seat.permissions)} · {statusLabel(seat.status)} ·{' '}
                      {issuedLabel(seat.issuedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}

function PlanMark({ presetId }: { presetId: InstructorPresetId }) {
  if (presetId === 'program-director') {
    return (
      <svg className="role-plan__mark" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 1.3 9.9 5.7l4.8.4-3.7 3.1 1.2 4.7L8 11.5 3.8 13.9l1.2-4.7L1.3 6.1l4.8-.4L8 1.3z"
        />
      </svg>
    );
  }
  if (presetId === 'instructors') {
    return (
      <svg className="role-plan__mark" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M1.4 12.1h13.2V14H1.4v-1.9zM2.1 11.2 3.4 5.2l2.7 2.3L8 2.4l1.9 5.1 2.7-2.3 1.3 6H2.1z"
        />
      </svg>
    );
  }
  return (
    <span className="role-plan__mark" aria-hidden="true">
      ∞
    </span>
  );
}

function PlanBadge({ presetId }: { presetId: InstructorPresetId | null }) {
  const plan = instructorPresetPlan(presetId);
  if (!plan || !presetId) return null;
  return (
    <span className={`role-plan role-plan--${presetId}`}>
      <PlanMark presetId={presetId} />
      {plan}
    </span>
  );
}

/** Cover titles. Seat lists keep the stored preset labels. */
const BINDER_COVER_NAME: Record<InstructorPresetId, string> = {
  'assistant-coach': 'Assistant Coach',
  coach: 'Coach',
  'program-director': 'Program Director',
  instructors: 'Instructor',
};

const BINDER_ART: Record<InstructorPresetId, string> = {
  'assistant-coach': '/instructor-binders/assistant-coach.png',
  coach: '/instructor-binders/coach.png',
  'program-director': '/instructor-binders/program-director.png',
  instructors: '/instructor-binders/instructor.png',
};

function RoleOptions({
  selected,
  onSelect,
  heading = 'Choose role to invite',
}: {
  selected: InstructorPresetId | null;
  onSelect: (id: InstructorPresetId) => void;
  heading?: string;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key;
    if (
      key !== 'ArrowRight' &&
      key !== 'ArrowLeft' &&
      key !== 'ArrowDown' &&
      key !== 'ArrowUp' &&
      key !== 'Home' &&
      key !== 'End'
    ) {
      return;
    }
    event.preventDefault();
    const ids = INSTRUCTOR_PRESETS.map((preset) => preset.id);
    const current = selected ? ids.indexOf(selected) : -1;
    let next = current;
    if (key === 'Home') next = 0;
    else if (key === 'End') next = ids.length - 1;
    else if (key === 'ArrowRight' || key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % ids.length;
    else next = current < 0 ? ids.length - 1 : (current - 1 + ids.length) % ids.length;
    onSelect(ids[next]);
    buttons.current[next]?.focus();
  };

  return (
    <div className="role-options">
      <p className="role-options__title">{heading}</p>
      <div className="role-options__row" role="radiogroup" aria-label="Instructor role" onKeyDown={onKeyDown}>
        {INSTRUCTOR_PRESETS.map((preset, index) => {
          const on = selected === preset.id;
          const coverName = BINDER_COVER_NAME[preset.id];
          return (
            <button
              key={preset.id}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${coverName}, ${preset.plan}. ${preset.detail.join('. ')}`}
              className={`binder-pick binder-pick--${preset.id}${on ? ' binder-pick--on' : ''}`}
              onClick={() => onSelect(preset.id)}
            >
              <span className="binder-pick__cover">
                <img className="binder-pick__art" src={BINDER_ART[preset.id]} alt="" draggable={false} />
              </span>
              <PlanBadge presetId={preset.id} />
              <span className="binder-pick__detail">
                {preset.detail.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
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
  return (
    <li className="seat-stack">
      <div className="seat-card">
      <div className="seat-card__body">
      <p className="seat-card__role">{instructorSeatBinderLabel(shownPreset, shown)}</p>
      <PlanBadge presetId={shownPreset} />
      <strong>{seat.email}</strong>
      <span>
        {statusLabel(seat.status)} · {issuedLabel(seat.issuedAt)}
      </span>
      <span>{permissionSummary(shown)}</span>
      {editing && draft ? null : confirming ? (
        <div className="invite-confirm" role="group" aria-label={`Revoke ${seat.email}`}>
          <span>Revoke the binder for {seat.email}?</span>
          <div className="invite-actions">
            <button type="button" className="btn" onClick={onRevoke}>
              Revoke
            </button>
            <button type="button" className="btn btn--ghost" onClick={onCancelRevoke}>
              Keep binder
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
      </div>
      {editing && draft ? (
        <>
          <RoleOptions heading="Change role" selected={draftPresetId} onSelect={onPreset} />
          <div className="invite-form">
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
          </div>
        </>
      ) : null}
    </li>
  );
}
