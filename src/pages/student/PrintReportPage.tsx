import { useState } from 'react';
import { progressReportLines, selfAssessmentLines } from '../../lib/studentBackup';
import { loadAssessments } from '../../lib/studentAssessment';
import { pdfBlob, textToPdf } from '../../lib/simplePdf';
import { loadStudentReport, todayIso } from '../../lib/studentEdition';
import { LeatherHeader, StudentMarks } from './chrome';

export function PrintReportPage({ kind }: { kind: 'progress' | 'assessment' }) {
  const [report] = useState(() => loadStudentReport(localStorage));
  const [assessment] = useState(() => loadAssessments(localStorage));
  const lines = kind === 'assessment' ? selfAssessmentLines(report, assessment) : progressReportLines(report, assessment);
  const title = kind === 'assessment' ? 'Self-assessment report' : 'Progress report';

  const download = () => {
    const pdf = textToPdf(lines);
    const url = URL.createObjectURL(pdfBlob(pdf));
    const link = document.createElement('a');
    link.href = url;
    link.download = `advantage-student-${kind}-${todayIso()}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="student student-frame student-print">
      <div className="student-print-toolbar">
        <StudentMarks />
        <LeatherHeader title={title} />
        <div className="student-clip__actions">
          <button type="button" className="ink-btn ink-btn--save" onClick={() => window.print()}>
            Print
          </button>
          <button type="button" className="ink-btn" onClick={download}>
            Download PDF
          </button>
        </div>
      </div>
      <article className="student-print-sheet" aria-label={title}>
        {lines.map((line, index) =>
          line ? <p key={`${index}-${line.slice(0, 24)}`}>{line}</p> : <p key={`blank-${index}`} className="student-print-sheet__gap" />,
        )}
      </article>
    </main>
  );
}
