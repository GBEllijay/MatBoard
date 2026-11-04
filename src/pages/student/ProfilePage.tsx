import { useEffect, useState } from 'react';
import { beltModeOf, setBeltMode, setBirthYear } from '../../lib/beltBook';
import { StudentMarks, useStudentFile, useStudentPath } from './chrome';
import { StudentNoPhotosSwitch } from '../../components/rosterCard/StudentNoPhotos';
import { StudentCardPreview } from '../../components/rosterCard/StudentCardPreview';
import { ShareCardWithCoach, cardShareAvailable } from '../../components/StudentToCoachShare';
import { ProfileCornerMarks, ProfileMedia, ProfileSwitches, useProfileMedia } from './ProfileIdentity';
import { StudentProfileFields, TrainingSettings } from './ProfileFields';
import { StudentCompetitorSwitch } from './StudentCompetitorSwitch';
import { ProfileCardFace } from './ProfileCardFace';
import './profile.css';

/** Name, gym, start date, birth year, Kid or Adult, optional photo, and gym logo. Saved on this phone. */
export function ProfilePage() {
  const { report, commit } = useStudentFile();
  const media = useProfileMedia();
  const kids = beltModeOf(report) === 'kids';
  const showPhoto = Boolean(media.portrait);
  const gymName = report.profile.gymName.trim();
  const marked = Boolean(showPhoto || media.logo || (kids && gymName));
  const to = useStudentPath();
  const [saveSlot, setSaveSlot] = useState<HTMLElement | null>(null);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);
  return (
    <main className="student student-frame student--arena student--profile">
      <StudentMarks />
      <div className="arena-scroll">
        <header className={marked ? 'arena-hero profile-hero profile-hero--marks' : 'arena-hero profile-hero'}>
          <div className="profile-hero__copy">
            <h1>My profile</h1>
            <p>Tap any part of your card to fill it in. It all stays on this phone.</p>
          </div>
          <ProfileCornerMarks
            portrait={showPhoto ? media.portrait : null}
            logo={media.logo}
            name={kids && !media.logo && !showPhoto ? gymName : ''}
          />
        </header>
        <ProfileCardFace report={report} portrait={showPhoto ? media.portrait : null} logo={media.logo} to={to} />
        <div className="profile-stack">
          <ProfileMedia media={media} kids={kids} />
          <KidAdultFields report={report} commit={commit} />
          <StudentProfileFields
            report={report}
            commit={commit}
            variant="page"
            saveSlot={saveSlot}
            onSaved={() => {
              setSaved(true);
              setPreview(true);
            }}
          />
          <StudentCompetitorSwitch report={report} />
          <TrainingSettings report={report} commit={commit} />
          <ProfileSwitches report={report} />
          <StudentNoPhotosSwitch studentId={report.studentId} />
          {/* Save profile renders here: last on the page, reachable at 390px. */}
          <div ref={setSaveSlot} className="profile-save-slot" data-testid="profile-save-slot" />
          {saved ? (
            <section className="profile-card profile-after-save" aria-label="After saving">
              <button type="button" className="ink-btn" onClick={() => setPreview(true)}>
                Preview my card
              </button>
              {cardShareAvailable() ? <ShareCardWithCoach label="Upload for coach approval to add to student card" /> : null}
            </section>
          ) : null}
        </div>
        <StudentCardPreview
          open={preview}
          report={report}
          portrait={showPhoto ? media.portrait : null}
          logo={media.logo}
          onClose={() => setPreview(false)}
          to={to}
        />
      </div>
    </main>
  );
}

function KidAdultFields({
  report,
  commit,
}: {
  report: Parameters<typeof setBeltMode>[0];
  commit: (next: ReturnType<typeof setBeltMode>) => void;
}) {
  const mode = beltModeOf(report);
  const [pending, setPending] = useState<'' | 'adult' | 'kids'>('');
  const [error, setError] = useState('');
  const savedYear = report.beltBook?.birthYear ? String(report.beltBook.birthYear) : '';
  const [yearDraft, setYearDraft] = useState(savedYear);
  useEffect(() => {
    setYearDraft(savedYear);
  }, [savedYear]);
  const run = (next: ReturnType<typeof setBirthYear>) => {
    try {
      commit(next);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    }
  };
  const note = pending === 'kids'
    ? 'Switch to Kid? Your history stays. Adult belts stay on this phone.'
    : 'Switch to Adult? Your history stays. Kids belts stay on this phone.';
  return (
    <section className="profile-card" aria-label="Kid or Adult">
      <h2>Kid or Adult</h2>
      <p className="student-quiet">The switch is yours. Birth year only asks about the adult system at 16.</p>
      <div className="belt-system__switch" role="group" aria-label="Kid or Adult">
        <button type="button" aria-pressed={mode === 'kids'} onClick={() => setPending(mode === 'kids' ? '' : 'kids')}>
          Kid
        </button>
        <button type="button" aria-pressed={mode === 'adult'} onClick={() => setPending(mode === 'adult' ? '' : 'adult')}>
          Adult
        </button>
      </div>
      {pending ? (
        <div className="belt-system__confirm">
          <p>{note}</p>
          <div className="student-actions">
            <button
              type="button"
              className="ink-btn ink-btn--save"
              onClick={() => {
                const next = pending;
                setPending('');
                if (next === 'adult' || next === 'kids') run(setBeltMode(report, next));
              }}
            >
              Switch
            </button>
            <button type="button" className="ink-btn" onClick={() => setPending('')}>
              Stay
            </button>
          </div>
        </div>
      ) : null}
      <label className="profile-row">
        <span className="ink__label">Birth year</span>
        <input
          inputMode="numeric"
          aria-label="Birth year"
          value={yearDraft}
          placeholder="Optional"
          onChange={(event) => {
            const text = event.target.value;
            setYearDraft(text);
            if (/^\d{4}$/.test(text)) run(setBirthYear(report, Number(text)));
          }}
          onBlur={(event) => {
            const text = event.target.value.trim();
            if (!text) {
              run(setBirthYear(report, null));
              return;
            }
            if (/^\d{4}$/.test(text)) run(setBirthYear(report, Number(text)));
            else setYearDraft(savedYear);
          }}
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
