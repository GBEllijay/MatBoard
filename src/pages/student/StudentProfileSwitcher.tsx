import { useEffect, useState } from 'react';
import { readAccountReference, rememberAccountReference } from '../../lib/accountReference';
import { notifyStudentJournal } from '../../lib/studentDemo';
import { EXTRA_PROFILE_PRICE_LABEL } from '../../lib/productPrices';
import { forgetProfilePortraitMirror, portraitFromFile } from '../../lib/profilePortrait';
import { clearFilmBlobs } from '../../lib/studentFilm';
import {
  ADD_PROFILE_LABEL,
  DEFAULT_STUDENT_PROFILE_ID,
  addStudentProfile,
  deleteStudentProfile,
  ensureStudentProfiles,
  extraProfileFixtureOn,
  extraProfileNeedsPurchase,
  readExtraProfileSlots,
  readStudentProfiles,
  renameStudentProfile,
  setStudentProfilePortrait,
  switchStudentProfile,
  writeExtraProfileSlots,
  type StudentProfileRecord,
  type StudentProfileRegistry,
} from '../../lib/studentProfiles';
import { RowIcon } from './hubArt';

function reloadStudentEdition(): void {
  notifyStudentJournal();
  try {
    window.location.reload();
  } catch {
    /* the open profile is already stored */
  }
}

function fixtureActive(): boolean {
  if (extraProfileFixtureOn(localStorage)) return true;
  try {
    return Boolean(import.meta.env?.DEV) && new URLSearchParams(window.location.search).get('fixture') === 'profiles';
  } catch {
    return false;
  }
}

function needsPurchase(registry: StudentProfileRegistry): boolean {
  return extraProfileNeedsPurchase(registry.profiles.length, readExtraProfileSlots(localStorage), fixtureActive());
}

async function confirmExtraProfile(sessionId: string): Promise<{ slots: number; accountId?: string } | null> {
  const response = await fetch('/api/checkout-confirm', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  const body = (await response.json()) as { ok?: boolean; extraProfileSlots?: number; accountId?: string };
  if (!response.ok || body.ok !== true || typeof body.extraProfileSlots !== 'number') return null;
  return { slots: body.extraProfileSlots, accountId: body.accountId };
}

function initial(name: string): string {
  const letter = name.trim().charAt(0);
  return letter ? letter.toUpperCase() : '?';
}

export const ADD_ADDITIONAL_PROFILES_LABEL = 'Add additional profiles';
export const EXISTING_PROFILES_HEADING = 'Existing profiles';

/** Switch, add, rename, and delete family profiles on this phone. */
export function StudentProfileSwitcher({ detail = false }: { detail?: boolean }) {
  const [registry, setRegistry] = useState<StudentProfileRegistry>(() => readStudentProfiles(localStorage));
  const [panel, setPanel] = useState<'closed' | 'add' | 'pay' | 'rename' | 'delete'>('closed');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [renameId, setRenameId] = useState('');
  const [deleteId, setDeleteId] = useState('');
  const [name, setName] = useState('');
  const [portrait, setPortrait] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => setRegistry(readStudentProfiles(localStorage));

  useEffect(() => {
    ensureStudentProfiles(localStorage);
    refresh();
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id') ?? '';
    if (params.get('checkout') !== 'success' || !sessionId.startsWith('cs_')) return;
    let alive = true;
    void confirmExtraProfile(sessionId).then((result) => {
      if (!alive || !result) return;
      writeExtraProfileSlots(localStorage, result.slots);
      if (result.accountId) rememberAccountReference(result.accountId);
      setError('');
      setPanel('add');
      refresh();
    });
    return () => {
      alive = false;
    };
  }, []);

  const openAdd = () => {
    setName('');
    setPortrait('');
    setError('');
    refresh();
    const current = readStudentProfiles(localStorage);
    setPanel(needsPurchase(current) ? 'pay' : 'add');
  };

  const pay = async () => {
    setBusy(true);
    setError('');
    try {
      const accountId = readAccountReference();
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ product: 'extra-profile', ...(accountId ? { accountId } : {}) }),
      });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || typeof body.url !== 'string') {
        setError(body.error || 'Checkout did not open. No charge was made.');
        setBusy(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setError('Checkout did not open. No charge was made.');
      setBusy(false);
    }
  };

  const onPortrait = async (file: File | undefined) => {
    if (!file) {
      setPortrait('');
      return;
    }
    try {
      setPortrait(await portraitFromFile(file));
      setError('');
    } catch {
      setPortrait('');
      setError('That photo could not be used. You can add the profile without one.');
    }
  };

  const add = () => {
    const result = addStudentProfile(localStorage, { name, portrait: portrait || null });
    if (!result.ok) {
      setError(
        result.reason === 'name'
          ? 'Enter a name.'
          : result.reason === 'portrait'
            ? 'That photo could not be used.'
            : 'This phone cannot store another profile.',
      );
      refresh();
      return;
    }
    setPanel('closed');
    setName('');
    setPortrait('');
    setError('');
    refresh();
  };

  const saveName = () => {
    if (!renameStudentProfile(localStorage, renameId, name)) {
      setError('Enter a name.');
      return;
    }
    setPanel('closed');
    setError('');
    refresh();
  };

  const savePortrait = async (file: File | undefined) => {
    if (!file) return;
    try {
      const next = await portraitFromFile(file);
      if (!setStudentProfilePortrait(localStorage, registry.activeId, next)) {
        setError('That photo could not be used.');
        return;
      }
      setError('');
      refresh();
    } catch {
      setError('That photo could not be used.');
    }
  };

  const confirmDelete = () => {
    const id = deleteId;
    const wasOpen = registry.activeId === id;
    if (!deleteStudentProfile(localStorage, id)) return;
    void clearFilmBlobs(id).catch(() => undefined);
    void forgetProfilePortraitMirror(id).catch(() => undefined);
    setPanel('closed');
    setDeleteId('');
    refresh();
    if (wasOpen) reloadStudentEdition();
  };

  const pendingDelete = registry.profiles.find((profile) => profile.id === deleteId) ?? null;

  const closeSheet = () => {
    setSheetOpen(false);
    setPanel('closed');
    setError('');
  };

  const profileList = (
    <ul>
      {registry.profiles.map((profile) => (
        <ProfileRow
          key={profile.id}
          profile={profile}
          current={profile.id === registry.activeId}
          detail={detail}
          onOpen={() => {
            if (profile.id === registry.activeId) return;
            if (!switchStudentProfile(localStorage, profile.id)) return;
            reloadStudentEdition();
          }}
          onRename={() => {
            setRenameId(profile.id);
            setName(profile.name);
            setError('');
            setPanel('rename');
          }}
          onDelete={() => {
            setDeleteId(profile.id);
            setError('');
            setPanel('delete');
          }}
          onPortrait={(file) => void savePortrait(file)}
        />
      ))}
    </ul>
  );

  const addOrForms = (
    <>
      {panel === 'closed' ? (
        <button type="button" className="s-profiles__add" data-testid="student-profile-add" onClick={openAdd}>
          {needsPurchase(registry) ? `Add a profile — ${EXTRA_PROFILE_PRICE_LABEL}` : ADD_PROFILE_LABEL}
        </button>
      ) : null}
      {panel === 'pay' ? (
        <div className="s-profiles__panel" role="region" aria-label="Buy an extra profile">
          <h3>Extra profile — {EXTRA_PROFILE_PRICE_LABEL}</h3>
          <p>The first profile is free. Each extra profile is {EXTRA_PROFILE_PRICE_LABEL} once. Switching profiles stays free.</p>
          <div className="s-profiles__actions">
            <button type="button" className="s-profiles__save" onClick={() => void pay()} disabled={busy}>
              {busy ? 'Opening checkout…' : `Continue to checkout — ${EXTRA_PROFILE_PRICE_LABEL}`}
            </button>
            <button type="button" onClick={() => setPanel('closed')}>
              Cancel
            </button>
          </div>
          {error ? <p className="s-profiles__error" role="alert">{error}</p> : null}
        </div>
      ) : null}
      {panel === 'add' ? (
        <div className="s-profiles__panel" role="region" aria-label={ADD_PROFILE_LABEL}>
          <h3>{ADD_PROFILE_LABEL}</h3>
          <p>Name the profile. A portrait is optional. It stays on this phone.</p>
          <label>
            Name
            <input
              aria-label="Profile name"
              value={name}
              maxLength={40}
              autoComplete="nickname"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Optional portrait
            <input
              aria-label="Optional profile portrait"
              type="file"
              accept="image/*"
              onChange={(event) => void onPortrait(event.target.files?.[0])}
            />
          </label>
          {portrait ? <img className="s-profiles__preview" src={portrait} alt="" /> : null}
          <div className="s-profiles__actions">
            <button type="button" className="s-profiles__save" onClick={add}>
              Add profile
            </button>
            <button type="button" onClick={() => setPanel('closed')}>
              Cancel
            </button>
          </div>
          {error ? <p className="s-profiles__error" role="alert">{error}</p> : null}
        </div>
      ) : null}
      {panel === 'rename' ? (
        <form
          className="s-profiles__panel"
          aria-label="Rename profile"
          onSubmit={(event) => {
            event.preventDefault();
            saveName();
          }}
        >
          <h3>Rename profile</h3>
          <label>
            Name
            <input aria-label="Profile name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="s-profiles__actions">
            <button type="submit" className="s-profiles__save">
              Save name
            </button>
            <button type="button" onClick={() => setPanel('closed')}>
              Cancel
            </button>
          </div>
          {error ? <p className="s-profiles__error" role="alert">{error}</p> : null}
        </form>
      ) : null}
      {panel === 'delete' && pendingDelete ? (
        <div className="s-profiles__panel" role="alertdialog" aria-label={`Delete ${pendingDelete.name}`}>
          <h3>Delete {pendingDelete.name}?</h3>
          <p>
            This removes {pendingDelete.name}&apos;s journal, check-ins, rank, and the rest of that profile from this phone.
            The first profile stays.
          </p>
          <div className="s-profiles__actions">
            <button type="button" className="s-profiles__danger" onClick={confirmDelete}>
              Delete {pendingDelete.name}
            </button>
            <button type="button" onClick={() => setPanel('closed')}>
              Keep {pendingDelete.name}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );

  if (detail) {
    return (
      <section className="s-profiles" aria-label="Profiles" data-testid="student-profile-switcher">
        <h2>Profiles</h2>
        {profileList}
        {addOrForms}
      </section>
    );
  }

  const count = registry.profiles.length;
  const status = count === 1 ? '1 profile' : `${count} profiles`;

  return (
    <section className="s-profiles-entry" data-testid="student-profile-switcher">
      <button
        type="button"
        className="s-ghost"
        data-testid="student-profiles-entry"
        aria-label={ADD_ADDITIONAL_PROFILES_LABEL}
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        onClick={() => {
          setError('');
          setPanel('closed');
          setSheetOpen(true);
        }}
      >
        <RowIcon label={ADD_ADDITIONAL_PROFILES_LABEL} />
        <span className="s-ghost__label">{ADD_ADDITIONAL_PROFILES_LABEL}</span>
        <span className="s-ghost__status">{status}</span>
      </button>
      {sheetOpen ? (
        <div className="s-profiles-sheet">
          <button type="button" className="s-profiles-sheet__backdrop" aria-label="Close profiles" onClick={closeSheet} />
          <section
            className="s-profiles s-profiles--sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="existing-profiles-heading"
            data-testid="student-profiles-sheet"
          >
            <div className="s-profiles__sheet-head">
              <h2 id="existing-profiles-heading">{EXISTING_PROFILES_HEADING}</h2>
              <button type="button" className="s-profiles__close" onClick={closeSheet}>
                Close
              </button>
            </div>
            {profileList}
            <hr className="s-profiles__divider" data-testid="student-profiles-divider" />
            {addOrForms}
          </section>
        </div>
      ) : null}
    </section>
  );
}


function ProfileRow({
  profile,
  current,
  detail,
  onOpen,
  onRename,
  onDelete,
  onPortrait,
}: {
  profile: StudentProfileRecord;
  current: boolean;
  detail: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onPortrait: (file: File | undefined) => void;
}) {
  return (
    <li className={current ? 's-profiles__row is-current' : 's-profiles__row'}>
      <button type="button" aria-pressed={current} aria-label={current ? `${profile.name}, current profile` : profile.name} onClick={onOpen}>
        {profile.portrait ? (
          <img className="s-profiles__portrait" src={profile.portrait} alt="" />
        ) : (
          <span className="s-profiles__portrait s-profiles__portrait--letter" aria-hidden="true">
            {initial(profile.name)}
          </span>
        )}
        <span>
          <strong>{profile.name}</strong>
          {profile.id === DEFAULT_STUDENT_PROFILE_ID ? <small>First profile</small> : null}
        </span>
      </button>
      {detail && current ? (
        <div className="s-profiles__manage">
          <button type="button" onClick={onRename}>
            Rename
          </button>
          <label>
            Portrait
            <input aria-label={`Portrait for ${profile.name}`} type="file" accept="image/*" onChange={(event) => onPortrait(event.target.files?.[0])} />
          </label>
        </div>
      ) : null}
      {detail && profile.id !== DEFAULT_STUDENT_PROFILE_ID ? (
        <button type="button" className="s-profiles__danger" onClick={onDelete}>
          Delete
        </button>
      ) : null}
    </li>
  );
}
