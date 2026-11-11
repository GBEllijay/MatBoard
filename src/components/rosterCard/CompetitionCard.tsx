/**
 * Competition card v1 (fight-poster face) for a Competitor Roster card.
 * Draws the competitor card, the imported student progress file, and the coach's
 * latest assessment on the linked Student roster card. Competition Ready links
 * and the game plan use the same stores as Competitor Management.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { READY_ITEMS, linkedRosterStudent, type Student } from '../../lib/rosterStore';
import { followedCompetitorPhoto } from '../../lib/competitorCarryOver';
import { SharedGamePlanFields } from './CompetitorWorkspace';
import type { ImportedCompetitionPlan } from '../../lib/progress/competition';
import { formatWeight, tournamentStatusLabel } from '../../lib/progress/competition';
import type { AssessmentScore } from '../../lib/studentAssessment';
import { ASSESSMENT_AREAS } from '../../lib/studentAssessment';
import { cardDate, initialsOf } from '../../lib/rosterCard';
import { METHOD_LABELS, competitionRecord, latestWeighIn, opponentsFaced, tournamentsIcs, upcomingTournaments } from '../../lib/competitionCard';
import { DEFAULT_CARD_LOOK, type CardLook } from '../../lib/cardLook';
import { RankBelt } from './RankBelt';
import { CardRadar } from './CoachClipboardCard';
import { todayIso } from './fileSave';
import './coachClipboard.css';
import './competitionCard.css';

/** Phones open with Results, Scouting and Archive folded. */
function wideScreen(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(min-width: 601px)').matches;
}

function Section({ num, title, fold, children, testId }: { num: string; title: string; fold?: boolean; children: ReactNode; testId: string }) {
  const [open] = useState(() => !fold || wideScreen());
  const head = (
    <span className="comp-card__sec-head">
      <span className="comp-card__num">{num}</span>
      <span className="comp-card__sec-title">{title}</span>
    </span>
  );
  if (!fold) {
    return (
      <section className="comp-card__sec" aria-label={title} data-testid={testId}>
        <h3 className="comp-card__h">{head}</h3>
        {children}
      </section>
    );
  }
  return (
    <details className="comp-card__sec comp-card__fold" open={open} data-testid={testId}>
      <summary className="comp-card__h comp-card__summary">{head}</summary>
      {children}
    </details>
  );
}

export function CompetitionCard({
  student,
  plan,
  look = DEFAULT_CARD_LOOK,
  gymName,
  coachScores,
  coachScoredOn,
  checkIn,
  onChangeDetails,
  today = todayIso(),
}: {
  student: Student;
  plan?: ImportedCompetitionPlan | null;
  look?: CardLook;
  gymName: string;
  /** Latest coach assessment on the linked Student roster card, or null. */
  coachScores: Record<string, AssessmentScore> | null;
  coachScoredOn?: string;
  checkIn: { checkedIn: boolean; onToggle: () => void };
  /** Opens the card editor (name, belt, division, photo, notes). */
  onChangeDetails: () => void;
  today?: string;
}) {
  const linked = linkedRosterStudent(student.id);
  const photo = followedCompetitorPhoto(student, linked);
  const noPhotos = Boolean(student.noPhotos || linked?.noPhotos);
  const record = competitionRecord(plan);
  const upcoming = upcomingTournaments(plan, today);
  const opponents = opponentsFaced(plan);
  const weigh = latestWeighIn(plan);
  const results = [...(plan?.results ?? [])].reverse();
  const history = plan?.rank?.history ?? [];
  const info = [student.division, student.gym || gymName].filter(Boolean).join(' · ');
  const [calNote, setCalNote] = useState('');

  const saveCalendar = () => {
    if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;
    const blob = new Blob([tournamentsIcs(student.name, upcoming)], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${student.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'competitor'}-tournaments.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setCalNote('Calendar file saved on this phone. Open it to add the events.');
  };

  return (
    <div className="clipboard comp-card" data-style={look.style} data-skin={look.skin} data-testid="competition-card">
      <article className="comp-card__sheet" aria-label={`${student.name} Competition card`}>
        <header className="comp-card__poster">
          <div className="comp-card__photo">
            {photo && !noPhotos ? (
              <img src={photo} alt={`${student.name} photo`} />
            ) : (
              <span className="comp-card__initials" aria-label="No photo yet">
                {initialsOf(student.name)}
              </span>
            )}
            {noPhotos ? <span className="clipboard__nophotos">No photos</span> : null}
          </div>
          <div className="comp-card__who">
            <p className="comp-card__kicker">Competition card</p>
            <h3 className="comp-card__name">{student.name}</h3>
            {info ? <p className="comp-card__info">{info}</p> : null}
            <div className="comp-card__beltline">
              <RankBelt student={student} />
            </div>
            <div className="comp-card__controls">
              <button
                type="button"
                className={`comp-card__btn${checkIn.checkedIn ? ' comp-card__btn--on' : ''}`}
                aria-pressed={checkIn.checkedIn}
                onClick={checkIn.onToggle}
              >
                {checkIn.checkedIn ? 'Checked in' : 'Check in'}
              </button>
              <button type="button" className="comp-card__btn comp-card__btn--ghost" onClick={onChangeDetails}>
                Change details
              </button>
            </div>
          </div>
        </header>

        <section className="comp-card__sec comp-card__ready" aria-label="Competition Ready" data-testid="comp-ready">
          <h3 className="comp-card__h">
            <span className="comp-card__sec-head">
              <span className="comp-card__sec-title">Competition Ready</span>
            </span>
          </h3>
          <div className="comp-card__ready-links">
            {READY_ITEMS.map((item) => (
              <Link
                key={item.id}
                className="comp-card__btn comp-card__btn--ghost"
                data-ready-item={item.id}
                to={`/competition-ready?id=${encodeURIComponent(student.id)}&item=${item.id}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>

        <dl className="comp-card__facts">
          <div>
            <dt>Division</dt>
            <dd>{student.division || '—'}</dd>
          </div>
          <div>
            <dt>Weight</dt>
            <dd>{weigh ? formatWeight(weigh.weight, weigh.unit) : '—'}</dd>
            {weigh ? <small>{cardDate(weigh.date)}</small> : null}
          </div>
          <div>
            <dt>Goal weight</dt>
            <dd>{plan?.goalWeight != null ? formatWeight(plan.goalWeight, plan.goalUnit === 'kg' ? 'kg' : 'lb') : '—'}</dd>
            {plan?.weighDate ? <small>Weigh-in {cardDate(plan.weighDate)}</small> : null}
          </div>
          <div>
            <dt>Last promotion</dt>
            <dd>{student.lastPromotion ? cardDate(student.lastPromotion) : '—'}</dd>
            {student.lastPromotionDetail ? <small>{student.lastPromotionDetail}</small> : null}
          </div>
        </dl>

        <Section num="01" title="Record" testId="comp-record">
          {record.total ? (
            <div className="comp-card__record">
              <p className="comp-card__score" aria-label={`${record.wins} wins, ${record.losses} losses${record.draws ? `, ${record.draws} draws` : ''}`}>
                <span className="comp-card__w">{record.wins}</span>
                <span aria-hidden="true">–</span>
                <span className="comp-card__l">{record.losses}</span>
                {record.draws ? (
                  <>
                    <span aria-hidden="true">–</span>
                    <span>{record.draws}</span>
                  </>
                ) : null}
              </p>
              {record.winRate !== null ? <p className="comp-card__rate">{record.winRate}% win rate</p> : null}
              <ul className="comp-card__methods" aria-label="How it ends">
                {record.methods.map((row) => (
                  <li key={row.method}>
                    <span>{row.label}</span>
                    <b>
                      {row.wins} W · {row.losses} L
                    </b>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="comp-card__quiet">No matches yet. Results arrive with the student&apos;s progress file.</p>
          )}
        </Section>

        <Section num="02" title="Upcoming" testId="comp-upcoming">
          {upcoming.length ? (
            <ul className="comp-card__list">
              {upcoming.map((row) => (
                <li key={row.id}>
                  <span className="comp-card__date">{cardDate(row.date)}</span>
                  <span className="comp-card__event">
                    <b>{row.name}</b>
                    {[row.division, row.weightClass, row.location].filter(Boolean).join(' · ')}
                  </span>
                  <span className={`comp-card__tag${row.status === 'entered' ? ' comp-card__tag--on' : ''}`}>
                    {row.status === 'entered' ? 'Registered' : tournamentStatusLabel(row.status)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="comp-card__quiet">No upcoming tournaments on this card.</p>
          )}
        </Section>

        <Section num="03" title="Assessment" testId="comp-assessment">
          {coachScores ? (
            <>
              <CardRadar coach={coachScores} self={null} />
              <ul className="comp-card__scores">
                {ASSESSMENT_AREAS.map((area) => (
                  <li key={area.id}>
                    <span>{area.label}</span>
                    <b>{coachScores[area.id] ?? '—'}/5</b>
                  </li>
                ))}
              </ul>
              <p className="comp-card__quiet">Coach assessment{coachScoredOn ? ` · ${cardDate(coachScoredOn)}` : ''}, from the Student roster card.</p>
            </>
          ) : (
            <p className="comp-card__quiet">No assessment yet. Add one on the Student roster card.</p>
          )}
        </Section>

        <Section num="04" title="Results" fold testId="comp-results">
          {results.length ? (
            <ul className="comp-card__list" aria-label="Results">
              {results.map((result) => (
                <li key={result.id} className="comp-card__result">
                  <span className="comp-card__event">
                    <b>{result.tournamentName}</b>
                    {result.division}
                  </span>
                  <span className="comp-card__matches">
                    {result.matches.map((match) => `${match.result === 'win' ? 'W' : match.result === 'loss' ? 'L' : 'D'} ${match.opponent}${match.method ? ` · ${METHOD_LABELS[match.method]}` : ''}`).join(', ') || 'No matches noted'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="comp-card__quiet">No results yet.</p>
          )}
        </Section>

        <Section num="05" title="Scouting" fold testId="comp-scouting">
          {opponents.length ? (
            <ul className="comp-card__list" aria-label="Opponents faced">
              {opponents.map((row) => (
                <li key={row.opponent}>
                  <span className="comp-card__event">
                    <b>{row.opponent}</b>
                    Last met at {row.last}
                  </span>
                  <span className="comp-card__tag">
                    {row.wins}–{row.losses}
                    {row.draws ? `–${row.draws}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="comp-card__quiet">No opponents faced yet.</p>
          )}
        </Section>

        {history.length ? (
          <Section num="06" title="Archive" fold testId="comp-archive">
            <ul className="comp-card__list" aria-label="Belt history">
              {history.map((row, index) => (
                <li key={`${row.belt}-${index}`}>
                  <span className="comp-card__event">
                    <b>{row.belt.charAt(0).toUpperCase() + row.belt.slice(1)}</b>
                    {row.awardedOn ? cardDate(row.awardedOn) : 'No date'}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section num="07" title="Game plan" testId="comp-game">
          <SharedGamePlanFields key={student.id} competitorId={student.id} />
        </Section>

        <footer className="comp-card__foot">
          <p className="comp-card__infoline">
            {plan
              ? `Progress file from ${plan.displayName || student.name}, imported ${cardDate(new Date(plan.importedAt).toISOString().slice(0, 10))}. Stays on this phone.`
              : 'Import the student progress file to fill in results and upcoming events. Stays on this phone.'}
          </p>
          <button type="button" className="comp-card__btn" onClick={saveCalendar} disabled={!upcoming.length}>
            Calendar
          </button>
          {calNote ? (
            <p className="comp-card__quiet" role="status">
              {calNote}
            </p>
          ) : null}
        </footer>
      </article>
    </div>
  );
}
