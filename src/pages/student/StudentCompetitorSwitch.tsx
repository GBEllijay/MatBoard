import { Link } from 'react-router-dom';
import { useStudentCompetitor } from '../../hooks/useStudentCompetitor';
import { todayIso } from '../../lib/studentEdition';
import type { StudentProgressReport } from '../../lib/progress/types';
import { COMPETE_GROUP_LABEL, competitorHubSummary } from '../../lib/studentHubMenu';
import { useStudentPath } from './chrome';
import { ProfileSwitch } from './ProfileIdentity';

/**
 * "I'm a competitor" on the student's card. Mirrors the coach's Add to Competitor Roster
 * switch, but stays on this phone: it only shows or hides the competitor section and the
 * Competitor tile. Nothing is sent to the coach from here.
 */
export function StudentCompetitorSwitch({ report }: { report: StudentProgressReport }) {
  const to = useStudentPath();
  const [on, setOn] = useStudentCompetitor();
  const summary = competitorHubSummary(report, todayIso());
  return (
    <section className="profile-card profile-competitor" aria-label="Competitor" data-testid="student-competitor">
      <ProfileSwitch
        on={on}
        label="I'm a competitor"
        note={on ? 'Shows your Competitor section and tile. Stays on this phone.' : 'Competitor is hidden. Nothing is deleted.'}
        onToggle={() => setOn(!on)}
      />
      {on ? (
        <div className="profile-competitor__summary" data-testid="student-competitor-section">
          <span className="s-chip">{summary.next}</span>
          <span className="s-chip">{summary.record}</span>
          <Link className="profile-competitor__open" to={to('/student/compete')}>
            Open {COMPETE_GROUP_LABEL}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
