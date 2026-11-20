import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync('src/index.css', 'utf8');
const competeCss = readFileSync('src/pages/student/competeNavy.css', 'utf8');
const hubCss = readFileSync('src/pages/student/hub.css', 'utf8');
const archiveCss = readFileSync('src/pages/student/archive.css', 'utf8');
const competitorPage = readFileSync('src/pages/student/CompetitorPage.tsx', 'utf8');
const resultsPage = readFileSync('src/pages/student/ResultsPage.tsx', 'utf8');
const weightPage = readFileSync('src/pages/student/WeightPage.tsx', 'utf8');
const calendarPages = readFileSync('src/pages/student/CalendarPages.tsx', 'utf8');
const rosterPage = readFileSync('src/pages/Roster.tsx', 'utf8');

function channel(hex: string, index: number): number {
  const value = parseInt(hex.slice(index, index + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrast(foreground: string, background: string): number {
  const lum = (hex: string) => {
    const body = hex.slice(1);
    return 0.2126 * channel(body, 0) + 0.7152 * channel(body, 2) + 0.0722 * channel(body, 4);
  };
  const lighter = Math.max(lum(foreground), lum(background));
  const darker = Math.min(lum(foreground), lum(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test('Competitor Management screens use matte navy cards instead of cream titles and white actions', () => {
  const start = css.indexOf('Competitor Management working screens.');
  assert.ok(start >= 0);
  const paint = css.slice(start, css.indexOf('.buy {', start));
  assert.match(paint, /\.cms \.roster__brand \{[\s\S]*background:\s*#0c2344/);
  assert.match(paint, /\.cms \.btn:not\(\.btn--ghost\):not\(\.btn--blue\) \{[\s\S]*background:\s*#0c2344/);
  assert.match(paint, /\.cms \.roster-card,[\s\S]*background:\s*#0c2344/);
  assert.doesNotMatch(paint, /Cream title, white actions/);
  assert.doesNotMatch(paint, /\.cms \.roster__brand \{[\s\S]*background:\s*var\(--white\)/);
});

test('dark Tournament Software chrome uses navy pills and leaves Bright and Kids alone', () => {
  assert.match(css, /\.tournament--dark:not\(\.tournament--kids\) \{[\s\S]*background-color:\s*#071422/);
  assert.match(css, /\.tournament--dark:not\(\.tournament--kids\) \.bracket-headline__pill \{[\s\S]*background:\s*#0c2344/);
  assert.match(css, /\.tournament--bright > \.belt-rail/);
  assert.doesNotMatch(css, /\.tournament--bright[^{]*\{[^}]*background:\s*#0c2344/);
});

test('suite and competition rosters get the cms navy paint without changing coach roster behavior', () => {
  assert.match(rosterPage, /const competitorPaint = fromCompetitors \|\| fromCompetitionSuite/);
  assert.match(rosterPage, /competitorPaint \? 'roster cms'/);
  assert.match(
    rosterPage,
    /!fromCompetitors &&\s*\(searchParams\.get\('from'\) === 'coach' \|\| \(coachUnlocked && !proUnlocked\)\)/,
  );
});

test('student compete working screens take the navy class, weigh-ins and calendar do not', () => {
  assert.match(competitorPage, /student--arena student--compete/);
  assert.match(resultsPage, /student--arena student--compete/);
  assert.doesNotMatch(weightPage, /student--compete/);
  assert.doesNotMatch(calendarPages, /student--compete/);
  assert.match(competeCss, /\.student\.student--arena\.student--compete/);
  assert.match(competeCss, /background:\s*#0c2344/);
  assert.match(competeCss, /\.ink-btn--save[\s\S]*background:\s*#004eba/);
  assert.match(competeCss, /\.arena-journal/);
});

test('Competitor menu add-tournament and scouting save drop the white CTA', () => {
  const addStart = hubCss.indexOf('.s-score__add {');
  const addBlock = hubCss.slice(addStart, hubCss.indexOf('.s-score b', addStart));
  assert.match(addBlock, /background:\s*#0c2344/);
  assert.doesNotMatch(addBlock, /var\(--cta-bg\)/);
  const saveStart = archiveCss.indexOf('.student.student--arena.student--archive .ink-btn--save {');
  const saveBlock = archiveCss.slice(saveStart, archiveCss.indexOf('}', saveStart) + 1);
  assert.match(saveBlock, /background:\s*#0c2344/);
  assert.doesNotMatch(saveBlock, /#ffffff/);
});

test('navy card ink stays readable', () => {
  assert.ok(contrast('#f5f1e8', '#0c2344') >= 7);
  assert.ok(contrast('#d7e6ff', '#0c2344') >= 7);
  assert.ok(contrast('#f5f1e8', '#004eba') >= 4.5);
  assert.ok(contrast('#f5f1e8', '#071422') >= 7);
  assert.ok(contrast('#6ea8ff', '#0c2344') >= 4.5);
});
