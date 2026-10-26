import { useEffect } from 'react';
import { loadStudentReport } from '../../lib/studentEdition';
import { withStarterRubric } from '../../lib/studentTools';
import { StudentMarks, useStudentFile, useStudentPath } from './chrome';
import { SelfAssessment } from './SelfAssessment';

export function SelfAssessmentPage() {
  const to = useStudentPath();
  const { report, commit } = useStudentFile();
  useEffect(() => {
    const current = loadStudentReport(localStorage);
    const next = withStarterRubric(current);
    if (next !== current) commit(next);
  }, [commit]);
  return (
    <main className="student student-frame student--arena student--assess">
      <StudentMarks />
      <div className="arena-scroll">
        <div className="assess-stack">
          <SelfAssessment report={report} to={to} />
        </div>
      </div>
    </main>
  );
}
