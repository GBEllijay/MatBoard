import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { exportProgressPacket, parseProgressPacket } from '../src/lib/progress/format.ts';
import type { StudentChecklistEntry } from '../src/lib/progress/types.ts';
import { extractPdfText, pdfPageCount } from '../src/lib/simplePdf.ts';
import { ASSESSMENT_STORAGE_KEY } from '../src/lib/studentAssessment.ts';
import { addBracketNote, addCompetitionMatch, addCompetitionResult, addWeighIn } from '../src/lib/studentCompetition.ts';
import { addJournalClip, blankStudentReport, setStudentProfile, STUDENT_EDITION_STORAGE_KEY } from '../src/lib/studentEdition.ts';
import { FILM_STORAGE_KEY } from '../src/lib/studentFilm.ts';
import { SCOUTING_STORAGE_KEY } from '../src/lib/studentScouting.ts';
import { withStarterRubric } from '../src/lib/studentTools.ts';

function checklistRow(name: string, level: 0 | 1 | 2 | 3 | 4 | 5): StudentChecklistEntry {
  return {
    id: `check.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    catalogItemId: '',
    categoryId: '',
    name,
    displayName: '',
    hidden: false,
    learnedOn: '',
    level,
    note: '',
    updatedAt: 1,
  };
}

function samplePacket(): string {
  let report = setStudentProfile(
    blankStudentReport(10),
    { displayName: 'Ada Student', gymName: 'GB Ellijay', startedOn: '2014-03-01' },
    11,
  );
  report = withStarterRubric(report, 12);
  report = addJournalClip(report, 'https://example.com/armbar', 'Armbar link', 13);
  report = addCompetitionResult(report, { tournamentId: '', tournamentName: 'Austin Spring Open', division: 'Black / Light' }, 14);
  const id = report.competition?.results[0]?.id ?? '';
  report = addCompetitionMatch(
    report,
    id,
    { opponent: 'Kenji Morrow', result: 'win', method: 'sub', note: 'armbar', date: '2026-04-11' },
    15,
  );
  report = addCompetitionMatch(
    report,
    id,
    { opponent: 'Rafael Quinn', result: 'loss', method: 'advantage', note: 'final', date: '2026-04-12' },
    16,
  );
  report = addBracketNote(report, id, 'Final', 'Rafael Quinn', 17);
  report = addWeighIn(report, { date: '2026-04-10', weight: '179.4', unit: 'lb', note: 'On track' }, 18);
  report = {
    ...report,
    checklist: [checklistRow('Armbar', 5), checklistRow('Knee cut', 4)],
    journal: [
      {
        id: 'card.1',
        date: '2026-09-02',
        gameTag: '',
        body: 'Class: \nTechniques: Knee slice\nTraining partners: \nDrills: \nRolls: \nNotes:\ncollar grip deeper',
        techniqueRefs: [{ id: 'tech.1', name: 'Knee slice' }],
        amendments: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
  return exportProgressPacket(report);
}

async function seed(page: Page) {
  const packet = samplePacket();
  await page.addInitScript(
    ({ packet: journal, assessmentKey, filmKey, scoutKey, journalKey }) => {
      localStorage.setItem(journalKey, journal);
      localStorage.setItem(
        assessmentKey,
        JSON.stringify({
          entries: [
            {
              id: 'earlier',
              date: '2026-09-01',
              note: 'earlier pass',
              scores: { guard: 2, passing: 2, takedowns: 2, escapes: 2, submissions: 2, conditioning: 2, mindset: 2 },
            },
            {
              id: 'latest',
              date: '2026-10-23',
              note: 'calm rounds — keep the grip',
              scores: { guard: 5, passing: 4, takedowns: 3, escapes: 5, submissions: 4, conditioning: 3, mindset: 5 },
            },
          ],
        }),
      );
      localStorage.setItem(
        scoutKey,
        JSON.stringify({
          version: 1,
          cards: [
            {
              id: 'scout.1',
              name: 'Dario Kent',
              gym: 'Atos',
              belt: 'Black',
              weightClass: 'Light',
              group: 'weight',
              style: 'Wrestler',
              notes: 'Beat him on points',
              ratings: { guard: 4, passing: 3, takedowns: 2, escapes: 5, submissions: 4, conditioning: 3, mindset: 5 },
              strengths: '',
              weaknesses: '',
            },
          ],
        }),
      );
      localStorage.setItem(
        filmKey,
        JSON.stringify({
          version: 1,
          films: [
            {
              id: 'film.1',
              fileName: 'berimbolo.mp4',
              date: '2026-10-23',
              technique: 'Berimbolo to back take',
              note: 'partner',
              mime: 'video/mp4',
              size: 4,
              createdAt: 3,
              updatedAt: 3,
              where: 'phone',
              provider: '',
              driveFileId: '',
              dateFolder: '',
            },
          ],
        }),
      );
    },
    {
      packet,
      assessmentKey: ASSESSMENT_STORAGE_KEY,
      filmKey: FILM_STORAGE_KEY,
      scoutKey: SCOUTING_STORAGE_KEY,
      journalKey: STUDENT_EDITION_STORAGE_KEY,
    },
  );
}

function browserPdfPages(bytes: Buffer): number {
  const raw = bytes.toString('latin1');
  return raw.match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0;
}

test('print reports at 390px stay on two pages and the download keeps the new sections', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);

  const seeded = parseProgressPacket(samplePacket());
  if (!seeded.ok) throw new Error(seeded.errors.join('\n'));
  await page.goto('/student/print/assessment?student=1');
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeVisible();
  await expect(page.locator('main.student')).toHaveCSS('font-family', /Inter/);
  const assessment = page.getByRole('article', { name: 'Self-assessment' });
  await expect(assessment).toContainText('Student: Ada Student');
  await expect(assessment).toContainText('Gym: GB Ellijay');
  await expect(assessment).toContainText('Started: 2014-03-01');
  await expect(assessment).toContainText('calm rounds — keep the grip');
  await expect(assessment).toContainText('Notes');
  await expect(assessment).toContainText('Earlier check-ins');
  await expect(assessment.locator('.assess-visual')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(assessment.locator('.assess-chart__shape:not(.assess-chart__shape--opponent)')).toHaveCSS('stroke', 'rgb(12, 35, 68)');
  await page.screenshot({ path: '/opt/cursor/artifacts/student_assessment_print_390.png', fullPage: true });

  const assessmentDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const assessmentFile = await (await assessmentDownload).path();
  const assessmentPdf = readFileSync(assessmentFile ?? '');
  const assessmentText = extractPdfText(assessmentPdf);
  expect(assessmentText).toContain('Student: Ada Student');
  expect(assessmentText).toContain('Gym: GB Ellijay');
  expect(assessmentText).toContain('Started: 2014-03-01');
  expect(assessmentText).toContain('calm rounds -- keep the grip');
  expect(assessmentText).toContain('Notes');
  expect(assessmentText.replaceAll('What?', '')).not.toContain('?');
  expect(pdfPageCount(assessmentPdf)).toBeLessThanOrEqual(2);

  await page.emulateMedia({ media: 'print' });
  const assessmentPaper = await page.pdf({ format: 'Letter', printBackground: true });
  expect(browserPdfPages(assessmentPaper)).toBeLessThanOrEqual(2);
  expect(browserPdfPages(assessmentPaper)).toBeGreaterThan(0);
  await page.screenshot({ path: '/opt/cursor/artifacts/student_assessment_paper_390.png', fullPage: true });

  await page.emulateMedia({ media: 'screen' });
  await page.goto('/student/print/progress?student=1');
  const progress = page.getByRole('article', { name: 'Progress report' });
  await expect(progress).toContainText('Student: Ada Student');
  await expect(progress).toContainText('Gym: GB Ellijay');
  await expect(progress).toContainText('Started: 2014-03-01');
  for (const title of [
    'Rank and stripes',
    'Belt progress',
    'Fundamentals proficiency',
    'Journal summary',
    'Competition and weight',
    'Self-assessment',
    'Opponent scouting',
    'Video library',
  ]) {
    await expect(progress.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await expect(progress).toContainText('Average 4.5');
  await expect(progress).toContainText('1 win, 1 loss');
  await expect(progress).not.toContainText('1 losses');
  await expect(progress).not.toContainText('1 wins');
  await expect(progress).toContainText('2026-04-12');
  await expect(progress).toContainText('Rafael Quinn');
  await expect(progress.getByRole('region', { name: 'Competition and weight' })).toContainText('Bracket notes');
  await expect(progress.getByRole('region', { name: 'Competition and weight' })).toContainText('Final');
  await expect(progress.getByRole('region', { name: 'Opponent scouting' })).toContainText('Dario Kent');
  await expect(progress.getByRole('region', { name: 'Video library' })).toContainText('Berimbolo to back take');
  await expect(progress.getByRole('region', { name: 'Video library' })).toContainText('https://example.com/armbar');
  await expect(progress.getByRole('region', { name: 'Video library' })).not.toContainText('video/mp4');
  await expect(progress).toContainText('collar grip deeper');
  await page.screenshot({ path: '/opt/cursor/artifacts/student_progress_print_390.png', fullPage: true });

  const progressDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const progressFile = await (await progressDownload).path();
  const progressPdf = readFileSync(progressFile ?? '');
  const progressText = extractPdfText(progressPdf);
  expect(progressText).toContain('Student: Ada Student');
  expect(progressText).toContain('Gym: GB Ellijay');
  expect(progressText).toContain('Started: 2014-03-01');
  expect(progressText).toContain('Opponent scouting');
  expect(progressText).toContain('Dario Kent');
  expect(progressText).toContain('2026-04-12 -- Loss vs Rafael Quinn');
  expect(progressText).toContain('Bracket notes');
  expect(progressText).toContain('Final -- Rafael Quinn');
  expect(progressText).toContain('Berimbolo to back take');
  expect(progressText).toContain('https://example.com/armbar');
  expect(progressText).toContain('Average 4.5');
  expect(progressText).toContain('1 win, 1 loss');
  expect(progressText).not.toContain('1 losses');
  expect(progressText).not.toContain('?');
  expect(progressPdf.toString('latin1')).not.toContain('\\227');

  await page.emulateMedia({ media: 'print' });
  const progressPaper = await page.pdf({ format: 'Letter', printBackground: true });
  const progressPages = browserPdfPages(progressPaper);
  expect(progressPages).toBeGreaterThan(0);
  expect(progressPages).toBeLessThanOrEqual(2);
  await page.screenshot({ path: '/opt/cursor/artifacts/student_progress_paper_390.png', fullPage: true });
});
