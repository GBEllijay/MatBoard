import { StudentMarks, useStudentFile } from './chrome';
import { ProfileCornerMarks, ProfileMedia, ProfileSwitches, useProfileMedia } from './ProfileIdentity';
import { StudentProfileFields, TrainingSettings } from './ProfileFields';
import './profile.css';

/** Name, gym, start date, optional photo, and gym logo. Saved on this phone. */
export function ProfilePage() {
  const { report, commit } = useStudentFile();
  const media = useProfileMedia();
  const marked = Boolean(media.portrait || media.logo);
  return (
    <main className="student student-frame student--arena student--profile">
      <StudentMarks />
      <div className="arena-scroll">
        <header className={marked ? 'arena-hero profile-hero profile-hero--marks' : 'arena-hero profile-hero'}>
          <div className="profile-hero__copy">
            <h1>My profile</h1>
            <p>Your name, gym, and training start date print on the progress report. A photo is optional and stays on this phone.</p>
          </div>
          <ProfileCornerMarks portrait={media.portrait} logo={media.logo} />
        </header>
        <div className="profile-stack">
          <ProfileMedia media={media} />
          <StudentProfileFields report={report} commit={commit} variant="page" />
          <TrainingSettings report={report} commit={commit} />
          <ProfileSwitches report={report} />
        </div>
      </div>
    </main>
  );
}
