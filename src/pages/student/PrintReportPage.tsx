import { useState } from 'react';
import { RadarChart } from '../../components/RadarChart';
import { ASSESSMENT_AREAS, assessmentAverage, loadAssessments, type AssessmentState } from '../../lib/studentAssessment';
import { loadFilms, type StudentFilm } from '../../lib/studentFilm';
import { pdfBlob } from '../../lib/simplePdf';
import { assessmentReportPdf, progressReportPdf } from '../../lib/reportPdf';
import {
  profileNeedsPrompt,
  progressReportBlocks,
  reportIdentity,
  studentReportPdfName,
  type ReportBlock,
} from '../../lib/studentReport';
import { loadScouting, type ScoutingCard } from '../../lib/studentScouting';
import type { StudentProgressReport } from '../../lib/progress/types';
import { todayIso } from '../../lib/studentEdition';
import { StudentMarks, useStudentFile } from './chrome';
import { StudentProfileFields } from './ProfileFields';

export function PrintReportPage({ kind }: { kind: 'progress' | 'assessment' }) {
  const { report, commit } = useStudentFile();
  const [assessment] = useState(() => loadAssessments(localStorage));
  const [scouting] = useState(() => loadScouting(localStorage));
  const [films] = useState(() => loadFilms(localStorage));
  const title = kind === 'assessment' ? 'Self-assessment' : 'Progress report';
  const issuedOn = todayIso();

  const download = () => {
    const pdf = kind === 'assessment'
      ? assessmentReportPdf(report, assessment, issuedOn)
      : progressReportPdf(report, assessment, { scouting, films }, issuedOn);
    const url = URL.createObjectURL(pdfBlob(pdf));
    const link = document.createElement('a');
    link.href = url;
    link.download = studentReportPdfName(kind, issuedOn);
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="student student-frame student-print">
      <div className="student-print-toolbar">
        <StudentMarks />
        <div className="student-print-toolbar__row">
          <div>
            <p className="report-kicker">Advantage Student Edition</p>
            <h1>{title}</h1>
          </div>
          <div className="student-clip__actions">
            <button type="button" className="ink-btn ink-btn--save" onClick={() => window.print()}>
              Print
            </button>
            <button type="button" className="ink-btn" onClick={download}>
              Download PDF
            </button>
          </div>
        </div>
        {profileNeedsPrompt(report) ? (
          <form className="report-prompt" aria-label="Student profile" onSubmit={(event) => event.preventDefault()}>
            <p>Add your name, gym, and start date so this report is ready to hand to an instructor. They stay on this phone with the rest of your Student Edition data.</p>
            <StudentProfileFields report={report} commit={commit} />
          </form>
        ) : null}
      </div>
      <article className="report-sheet" aria-label={title}>
        {kind === 'assessment' ? (
          <AssessmentSheet report={report} assessment={assessment} issuedOn={issuedOn} />
        ) : (
          <ProgressSheet report={report} assessment={assessment} scouting={scouting} films={films} issuedOn={issuedOn} />
        )}
      </article>
    </main>
  );
}

function ReportHero({
  title,
  report,
  issuedOn,
  score,
}: {
  title: string;
  report: StudentProgressReport;
  issuedOn: string;
  score?: string;
}) {
  const identity = reportIdentity(report);
  return (
    <header className="report-hero">
      <img src="/advantage-icon.png" alt="" width={713} height={713} />
      <div>
        <p className="report-kicker">Advantage Student Edition</p>
        <h1>{title}</h1>
        <p>Student: {identity.name}</p>
        <p>Gym: {identity.gym}</p>
        <p>Started: {identity.started}</p>
        <p>
          {identity.belt}
          <span aria-hidden="true"> · </span>
          {issuedOn}
        </p>
      </div>
      {score ? (
        <p className="report-score">
          {score}
          <small> / 5</small>
        </p>
      ) : null}
    </header>
  );
}

function AssessmentSheet({
  report,
  assessment,
  issuedOn,
}: {
  report: StudentProgressReport;
  assessment: AssessmentState;
  issuedOn: string;
}) {
  const entries = [...assessment.entries].sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
  const latest = entries[0];
  const previous = entries[1];
  const average = latest ? assessmentAverage(latest.scores).toFixed(1) : '';
  return (
    <>
      <ReportHero title="Self-assessment" report={report} issuedOn={issuedOn} score={average || undefined} />
      <div className="report-body">
        {!latest ? <p>No self-assessment saved on this phone.</p> : null}
        {latest ? (
          <>
            <div className="report-checkin">
              <p className="report-date">{latest.date}</p>
              <div className="report-layout">
                <RadarChart
                  title="Shape"
                  series={
                    previous
                      ? [
                          { name: `Previous ${previous.date}`, scores: previous.scores, tone: 'opponent' },
                          { name: 'This check-in', scores: latest.scores, tone: 'me' },
                        ]
                      : [{ name: 'This check-in', scores: latest.scores, tone: 'me' }]
                  }
                />
                <ScoreBars scores={latest.scores} />
              </div>
              <section className="report-note" aria-label="Notes">
                <h2>Notes</h2>
                <p>{latest.note.trim() || 'No note on this check-in.'}</p>
              </section>
            </div>
            {entries.length > 1 ? (
              <section className="report-section" aria-label="Earlier check-ins">
                <h2>Earlier check-ins</h2>
                {entries.slice(1).map((entry) => (
                  <div key={entry.id}>
                    <p>
                      <strong>
                        {entry.date} · average {assessmentAverage(entry.scores).toFixed(1)}
                      </strong>
                    </p>
                    <p>{ASSESSMENT_AREAS.map((area) => `${area.label} ${entry.scores[area.id]}`).join(', ')}</p>
                    {entry.note.trim() ? <p>{entry.note.trim()}</p> : null}
                  </div>
                ))}
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}

function ScoreBars({ scores }: { scores: AssessmentState['entries'][number]['scores'] }) {
  return (
    <ol className="report-bars" aria-label="Area scores">
      {ASSESSMENT_AREAS.map((area) => (
        <li key={area.id}>
          <span>{area.label}</span>
          <span className="report-bar" aria-hidden="true">
            <span style={{ width: `${(scores[area.id] / 5) * 100}%` }} />
          </span>
          <span>{scores[area.id]}</span>
        </li>
      ))}
    </ol>
  );
}

function ProgressSheet({
  report,
  assessment,
  scouting,
  films,
  issuedOn,
}: {
  report: StudentProgressReport;
  assessment: AssessmentState;
  scouting: readonly ScoutingCard[];
  films: readonly StudentFilm[];
  issuedOn: string;
}) {
  const blocks = progressReportBlocks(report, assessment, { scouting, films });
  return (
    <>
      <ReportHero title="Progress report" report={report} issuedOn={issuedOn} />
      <div className="report-body">
        {blocks.map((block) => (
          <ReportSection key={block.title} block={block} />
        ))}
      </div>
    </>
  );
}

function ReportSection({ block }: { block: ReportBlock }) {
  return (
    <section className="report-section" aria-label={block.title}>
      <h2>{block.title}</h2>
      {block.lines.map((line, index) => (
        <p key={`${block.title}-${index}`} className={line.startsWith('  ') ? 'report-line report-line--sub' : 'report-line'}>
          {line.trim()}
        </p>
      ))}
    </section>
  );
}
