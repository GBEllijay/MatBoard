import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useGymName } from '../hooks/useGymBrand';
import {
  INSTRUCTOR_PERMISSION_FIELDS,
  INSTRUCTOR_PRESETS,
  defaultInstructorPermissions,
  instructorInviteLink,
  instructorPresetPermissions,
  instructorPresetPlan,
  instructorSeatBinderLabel,
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
  plan: ReturnType<typeof instructorPresetPlan>;
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
    setIssued({
      email: result.seat.email,
      link: result.inviteLink,
      plan: instructorPresetPlan(presetId),
    });
    setCopiedId(null);
    setCopyFailedId(null);
  };

  const formKind = presetId ?? 'unset';

  return (
    <div className="invite-panel">
      <form className={`binder binder--${formKind}`} onSubmit={submitInvite}>
        <BinderRings />
        <div className="binder__cover">
          <p className="binder__kicker">Owner only · Soft beta</p>
          <strong>Generate instructor invite</strong>
          <PlanBadge presetId={presetId} />
          <span>
            Pick a binder, then change any switch for this person. The link stays on this
            device. Nothing is emailed, billed, or capped.
          </span>
          {gymName ? <span className="invite-gym">Gym · {gymName}</span> : null}
          {issued ? (
            <div className="invite-link" role="status" ref={issuedRef}>
              <p>Binder for {issued.email}. Status is invited.</p>
              {issued.plan ? <span className="binder-plan">{issued.plan}</span> : null}
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
          <PresetBinders
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
      </form>

      <section className="binder-list" aria-labelledby={`${formId}-seats`}>
        <h3 id={`${formId}-seats`}>Binders</h3>
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
          <p className="binder-list__empty">
            No binders yet. Issue an invite to hand a coach the class details.
          </p>
        )}
        {revokedSeats.length ? (
          <>
            <h3 className="invite-revoked-title">Revoked</h3>
            <ul className="invite-seats">
              {revokedSeats.map((seat) => (
                <BinderShell key={seat.id} presetId={seat.presetId} revoked>
                  <strong>{seat.email}</strong>
                  <PlanBadge presetId={seat.presetId} />
                  <span>
                    {instructorSeatBinderLabel(seat.presetId, seat.permissions)} · {statusLabel(seat.status)} ·{' '}
                    {issuedLabel(seat.issuedAt)}
                  </span>
                </BinderShell>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}

function PlanBadge({ presetId }: { presetId: InstructorPresetId | null }) {
  const plan = instructorPresetPlan(presetId);
  if (!plan) return null;
  return <span className="binder-plan">{plan}</span>;
}

function BinderRings() {
  return (
    <span className="binder__rings" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function BinderShell({
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
    <li className={`binder binder--${kind}${revoked ? ' binder--revoked' : ''}`}>
      <BinderRings />
      <div className="binder__cover">{children}</div>
    </li>
  );
}

function PresetBinders({
  selected,
  onSelect,
}: {
  selected: InstructorPresetId | null;
  onSelect: (id: InstructorPresetId) => void;
}) {
  return (
    <div className="binder-picks" role="radiogroup" aria-label="Binder preset">
      {INSTRUCTOR_PRESETS.map((preset) => {
        const on = selected === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={on}
            className={`binder-pick binder-pick--${preset.id}${on ? ' binder-pick--on' : ''}`}
            onClick={() => onSelect(preset.id)}
          >
            <BinderRings />
            <span className="binder-pick__copy">
              <span className="binder-pick__name">{preset.label}</span>
              <PlanBadge presetId={preset.id} />
              <span className="binder-pick__detail">{preset.detail}</span>
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
    <li className={`binder binder--${kind}`}>
      <BinderRings />
      <div className="binder__cover">
      <p className="binder__kicker">{instructorSeatBinderLabel(shownPreset, shown)}</p>
      <PlanBadge presetId={shownPreset} />
      <strong>{seat.email}</strong>
      <span>
        {statusLabel(seat.status)} · {issuedLabel(seat.issuedAt)}
      </span>
      <span>{permissionSummary(shown)}</span>
      {editing && draft ? (
        <>
          <PresetBinders selected={draftPresetId} onSelect={onPreset} />
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
    </li>
  );
}
