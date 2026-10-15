import { expect, test, type Page } from '@playwright/test';

const BACK = 'Back. Hold for Home.';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png`, fullPage: true });
}

test('calendar marks a journal day, stores an event, and can show the gym schedule', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem(
      'matboard.schedule.v1',
      JSON.stringify({
        version: 1,
        classes: [{ id: 'c1', kind: 'class', day: 'mon', time: '06:00', title: 'Morning Gi', location: 'MAT 1', subtitle: '' }],
        specials: [],
      }),
    );
  });
  await page.goto('/student/journal?student=1');
  await page.getByRole('textbox', { name: 'Class', exact: true }).fill('Fundamentals');
  await page.getByRole('textbox', { name: 'Notes' }).fill('grip the collar deeper');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByText('grip the collar deeper')).toBeVisible();

  await page.goto('/student/calendar?student=1');
  const marked = page.getByRole('button', { name: /journal entry/ });
  await expect(marked).toBeVisible();
  await expect(marked).toHaveAttribute('data-journal', 'true');
  await shot(page, 'student-calendar-390');

  await page.getByLabel('Event title').fill('Saturday open mat');
  await page.getByRole('button', { name: 'Open mat', exact: true }).click();
  await page.getByRole('button', { name: 'Add event', exact: true }).click();
  await expect(page.getByRole('button', { name: /Saturday open mat|calendar event/ })).toBeVisible();

  await page.getByRole('checkbox', { name: 'Show gym class schedule' }).check();
  await expect(page.getByText('Monday · 6:00 AM · Morning Gi')).toBeVisible();
  await expect(page.getByText('It is not saved in your progress file.')).toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem('matboard.studentEdition.v1') ?? '');
  expect(stored).not.toContain('Morning Gi');
  expect(stored).toContain('Saturday open mat');
  expect(stored).toContain('"kind":"training"');

  await marked.click();
  await expect(page.getByText('grip the collar deeper')).toBeVisible();
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveAttribute('href', /\/student\/calendar\?student=1/);
});

test('belt checkpoints, goals, coach suggestions, and the share file', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student/fundamentals?student=1');
  await page.getByRole('region', { name: 'Sweeps' }).getByRole('button', { name: 'Mark Scissor sweep learned' }).click();
  await page.goto('/student/rubric?student=1');
  await expect(page.getByRole('heading', { name: 'Belt progress' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'White', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('paragraph').filter({ hasText: /^Blue$/ })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Guard, open' })).toBeVisible();
  await expect(page.getByText('Counted from your fundamentals.')).toBeVisible();
  await expect(page.getByText(/stripe/i)).toHaveCount(0);

  await page.getByRole('button', { name: 'Mark Hold closed guard. met' }).click();
  await expect(page.getByRole('listitem', { name: 'Guard, filled' })).toBeVisible();
  await expect(page.getByText('1 of 3 checkpoints filled.')).toBeVisible();
  await page.locator('.student-paper').evaluate((el) => {
    el.scrollTop = 0;
  });
  await shot(page, 'student-belt-390');
  await page.getByLabel('Goal name').fill('Compete in the spring');
  await page.getByLabel('Goal note').fill('local');
  await page.getByRole('button', { name: 'Add goal', exact: true }).click();
  await page.getByLabel('Edit Compete in the spring').fill('Compete in May');
  await page.getByRole('button', { name: 'Save Compete in the spring' }).click();
  await page.getByRole('button', { name: 'Mark Compete in May met' }).click();
  await expect(page.getByRole('button', { name: 'Compete in May met' })).toBeVisible();

  const before = await page.evaluate(() => localStorage.getItem('matboard.studentEdition.v1'));
  await page.getByRole('link', { name: 'Import from coach', exact: true }).click();
  await expect(page).toHaveURL(/\/student\/share\?/);
  await expect(page.getByRole('link', { name: BACK, exact: true })).toHaveAttribute('href', /\/student\/rubric\?student=1/);
  await page.getByLabel('Import from coach').setInputFiles({
    name: 'advantage-handoff-coach-plan-plan-1-50.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'coach-plan',
        id: 'plan-1',
        studentId: 'student-local',
        updatedAt: 50,
        plan: {
          title: 'Work on before next promotion',
          issuedOn: '2026-10-01',
          note: 'Suggest clearing the guard checkpoint.',
          focus: [
            {
              id: 'focus-1',
              criterionId: 'rubric.white.closed-guard',
              catalogItemId: 'sweep.scissor',
              name: 'Scissor sweep',
              note: 'Finish the angle.',
            },
          ],
        },
      }),
    ),
  });
  await expect(page.getByText('Your rubric, journal, and goals were not changed.')).toBeVisible();
  const afterPlan = await page.evaluate(() => localStorage.getItem('matboard.studentEdition.v1'));
  expect(afterPlan).toBe(before);

  await page.getByLabel('Import from coach').setInputFiles({
    name: 'advantage-handoff-coach-feedback-feedback-1-70.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'coach-feedback',
        id: 'feedback-1',
        studentId: 'student-local',
        updatedAt: 70,
        feedback: {
          planId: 'plan-1',
          issuedOn: '2026-10-02',
          synopsis: 'The scissor sweep is closer.',
          suggestions: [{ id: 'note-1', targetId: 'checkpoint.white.guard', note: 'Showing up in live rounds.' }],
        },
      }),
    ),
  });
  await expect(page.getByText('Coach feedback is on this phone.')).toBeVisible();

  await page.getByRole('link', { name: BACK, exact: true }).click();
  const coach = page.getByRole('region', { name: 'From my coach' });
  await coach.scrollIntoViewIfNeeded();
  await expect(coach.getByRole('heading', { name: 'Work on before next promotion' })).toBeVisible();
  await expect(coach.getByText('The scissor sweep is closer.')).toBeVisible();
  await expect(coach.getByText('Showing up in live rounds.')).toBeVisible();
  await coach.screenshot({ path: '/opt/cursor/artifacts/student-coach-390.png' });
  await page.getByRole('button', { name: 'Copy Scissor sweep to my goals' }).click();
  await page.getByRole('button', { name: 'Copy Showing up in live rounds. to my goals' }).click();
  await expect(page.getByLabel('Edit Scissor sweep')).toBeVisible();
  const report = await page.evaluate(() => JSON.parse(localStorage.getItem('matboard.studentEdition.v1') || '{}'));
  const guard = report.rubric.levels.find((level: { belt: string }) => level.belt === 'white').checkpoints.find(
    (row: { id: string }) => row.id === 'checkpoint.white.guard',
  );
  expect(guard.criteria.find((row: { id: string }) => row.id === 'rubric.white.closed-guard').met).toBe(true);
  expect(guard.met).toBe(null);
  expect(report.goals.some((goal: { name: string }) => goal.name === 'Scissor sweep')).toBe(true);
  expect(report.journal).toEqual([]);

  await page.getByRole('link', { name: 'Send to coach', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Email the file' })).toHaveAttribute('href', /subject=Advantage%20progress%20report/);
  await expect(page.getByRole('checkbox', { name: 'Also include the spreadsheet' })).toBeVisible();
  await shot(page, 'student-share-390');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Send to coach', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('advantage-handoff-student-progress-report-');
  const body = await download.createReadStream().then(
    (stream) =>
      new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        stream.on('error', reject);
      }),
  );
  const packet = JSON.parse(body);
  expect(packet.kind).toBe('student-progress-report');
  expect(packet.schemaVersion).toBe(2);
  expect(packet.competition.weightUnit).toBe('lb');
  expect(packet.competition.tournaments).toEqual([]);
  const exportedGuard = packet.rubric.levels
    .find((level: { belt: string }) => level.belt === 'white')
    .checkpoints.find((row: { id: string }) => row.id === 'checkpoint.white.guard');
  expect(exportedGuard.criteria.find((row: { id: string }) => row.id === 'rubric.white.closed-guard').met).toBe(true);
  expect(packet.goals.some((goal: { name: string }) => goal.name === 'Compete in May' && goal.met === true)).toBe(true);
});
