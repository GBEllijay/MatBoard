import { StudentMarks, useStudentFile } from './chrome';
import { ProfileMedia, ProfileSwitches } from './ProfileIdentity';
import { StudentProfileFields } from './ProfileFields';
import './profile.css';

/** Name, gym, start date, optional photo, and gym logo. Saved on this phone. */
export function ProfilePage() {
  const { report, commit } = useStudentFile();
  return (
    <main className="student student-frame student--arena student--profile">
      <StudentMarks />
      <div className="arena-scroll">
        <header className="arena-hero profile-hero">
          <h1>My profile</h1>
          <p>Your name, gym, and training start date print on the progress report. A photo is optional and stays on this phone.</p>
        </header>
        <div className="profile-stack">
          <ProfileMedia />
          <StudentProfileFields report={report} commit={commit} variant="page" />
          <ProfileSwitches report={report} />
        </div>
      </div>
    </main>
  );
}
