import { useEffect, useState } from 'react';
import { notifyStudentJournal } from '../../lib/studentDemo';
import { forgetProfilePortraitMirror, portraitFromFile } from '../../lib/profilePortrait';
import { clearFilmBlobs } from '../../lib/studentFilm';
import {
  ADD_PROFILE_LABEL,
  DEFAULT_STUDENT_PROFILE_ID,
  addStudentProfile,
  deleteStudentProfile,
  ensureStudentProfiles,
  readStudentProfiles,
  renameStudentProfile,
  setStudentProfilePortrait,
  switchStudentProfile,
  type StudentProfileRecord,
  type StudentProfileRegistry,
} from '../../lib/studentProfiles';

function reloadStudentEdition(): void {
  notifyStudentJournal();
  try {
    window.location.reload();
  } catch {
    /* the open profile is already stored */
  }
}

function initial(name: string): string {
  const letter = name.trim().charAt(0);
  return letter ? letter.toUpperCase() : '?';
}

/** Switch, add, rename, and delete family profiles on this phone. */
export function StudentProfileSwitcher({ detail = false }: { detail?: boolean }) {
  const [registry, setRegistry] = useState<StudentProfileRegistry>(() => readStudentProfiles(localStorage));
  const [panel, setPanel] = useState<'closed' | 'add' | 'rename' | 'delete'>('closed');
  const [renameId, setRenameId] = useState('');
  const [deleteId, setDeleteId] = useState('');
  const [name, setName] = useState('');
  const [portrait, setPortrait] = useState('');
  const [error, setError] = useState('');

  const refresh = () => setRegistry(readStudentProfiles(localStorage));

  useEffect(() => {
    ensureStudentProfiles(localStorage);
    refresh();
  }, []);

  const openAdd = () => {
    setPanel('add');
    setName('');
    setPortrait('');
    setError('');
    refresh();
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

  return (
    <section className="s-profiles" aria-label="Profiles" data-testid="student-profile-switcher">
      <h2>Profiles</h2>
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
      {panel === 'closed' ? (
        <button type="button" className="s-profiles__add" data-testid="student-profile-add" onClick={openAdd}>
          {ADD_PROFILE_LABEL}
        </button>
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
