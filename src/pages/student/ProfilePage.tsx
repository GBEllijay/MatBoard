import { StudentMarks, useStudentFile } from './chrome';
import { StudentProfileFields } from './ProfileFields';
import './profile.css';

/** Name, gym, and optional training start date. Saved with the journal on this phone. */
export function ProfilePage() {
  const { report, commit } = useStudentFile();
  return (
    <main className="student student-frame student--arena student--profile">
      <StudentMarks />
      <div className="arena-scroll">
        <header className="arena-hero profile-hero">
          <h1>My profile</h1>
          <p>Your name, gym, and training start date print on the progress report and the self-assessment. They stay on this phone.</p>
        </header>
        <div className="profile-stack">
          <StudentProfileFields report={report} commit={commit} variant="page" />
        </div>
      </div>
    </main>
  );
}
