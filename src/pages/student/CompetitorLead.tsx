import { Link } from 'react-router-dom';
import type { StudentProgressReport } from '../../lib/progress/types';
import { rankBeltLabel, rankOf } from '../../lib/studentRank';
import { viewJournalEntry } from '../../lib/studentEdition';

export function RankHero({ report, to }: { report: StudentProgressReport; to: (path: string) => string }) {
  const rank = rankOf(report);
  const belt = report.profile.belt;
  const stripes = rank.tapeCount === 1 ? '1 stripe' : `${rank.tapeCount} stripes`;
  return (
    <section className={`arena-rank arena-rank--${belt}`} aria-label="Belt rank">
      <p className="arena-kicker">Belt rank</p>
      <p className="arena-rank__name">{rankBeltLabel(belt)}</p>
      <p className="arena-rank__meta">
        {stripes}
        {rank.awardedOn ? ` · since ${rank.awardedOn}` : ''}
      </p>
      <div className="arena-stripes" aria-hidden="true">
        {[0, 1, 2, 3].map((slot) => (
          <span key={slot} className={slot < rank.tapeCount ? 'is-on' : undefined} />
        ))}
      </div>
      <Link className="arena-rank__link" to={to('/student/rank')}>
        Open: My rank
      </Link>
    </section>
  );
}

export function JournalGate({ report, to }: { report: StudentProgressReport; to: (path: string) => string }) {
  const latest = [...report.journal].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)[0];
  const view = latest ? viewJournalEntry(latest) : null;
  const technique = view?.techniques.find((item) => item.name.trim())?.name ?? '';
  return (
    <section className="arena-journal" aria-label="Jiu-Jitsu Journal">
      <span className="arena-node" aria-hidden="true" />
      <h2>Jiu-Jitsu Journal</h2>
      <p>Today&apos;s page stays in the notebook.</p>
      {view ? (
        <p>
          {view.date}
          {view.className ? ` · ${view.className}` : ''}
          {technique ? ` · ${technique}` : ''}
        </p>
      ) : (
        <p>No journal cards yet.</p>
      )}
      <div className="arena-journal__actions">
        <Link to={to('/student/journal')}>Today&apos;s page</Link>
        <Link to={to('/student/cards')}>Journal cards</Link>
      </div>
    </section>
  );
}
