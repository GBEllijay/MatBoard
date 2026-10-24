import { expect, test, type Page } from '@playwright/test';

const SEAT = {
  id: 'seat-coach',
  gymId: 'gym-1',
  email: 'coach-bot@example.com',
  status: 'active',
  issuedAt: 1,
  presetId: 'coach',
  permissions: {
    galleryUpload: false,
    dailyLessonPlanAccess: true,
    rosterSubmit: true,
    rosterPull: true,
    downloadTodaysVideos: true,
    uploadForDistribution: true,
    eventsAccess: false,
    proShopAccess: false,
  },
  inviteToken: 'tok',
};

async function seed(page: Page) {
  await page.addInitScript((seat) => {
    localStorage.setItem(
      'matboard.pro.instructorSeats.v1',
      JSON.stringify({ version: 1, deviceGymId: 'gym-1', seats: [seat] }),
    );
    localStorage.setItem(
      'matboard.pro.instructorSeatSession.v1',
      JSON.stringify({ version: 1, seatId: seat.id }),
    );
    localStorage.setItem(
      'matboard.studentEdition.assessment.v1',
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
            note: 'calm rounds',
            scores: { guard: 5, passing: 4, takedowns: 3, escapes: 5, submissions: 4, conditioning: 3, mindset: 5 },
          },
        ],
      }),
    );
    localStorage.setItem(
      'matboard.studentEdition.scouting.v1',
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
      'matboard.studentEdition.films.v1',
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
  }, SEAT);
}

test('print reports hide the seat bar, save a profile, and download matching PDF names', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seed(page);

  await page.goto('/coach');
  await expect(page.getByRole('heading', { name: 'Advantage - Coach' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out of seat' })).toBeVisible();
  await expect(page.getByText('coach-bot@example.com')).toBeVisible();

  await page.goto('/student?student=1');
  await expect(page.getByRole('heading', { name: 'Advantage – Student Edition' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out of seat' })).toHaveCount(0);
  await expect(page.getByText('coach-bot@example.com')).toHaveCount(0);

  await page.goto('/student/journal?student=1');
  await page.getByRole('textbox', { name: 'Class', exact: true }).fill('Fundamentals');
  await page.getByRole('textbox', { name: 'Drill notes' }).fill('collar grip deeper');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByText('collar grip deeper')).toBeVisible();

  await page.goto('/student/print/assessment?student=1');
  await expect(page.getByRole('button', { name: 'Sign out of seat' })).toHaveCount(0);
  await expect(page.getByText('Signed in as')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeVisible();
  await expect(page.locator('main.student')).toHaveCSS('font-family', /Inter/);

  const prompt = page.getByRole('form', { name: 'Student profile' });
  await expect(prompt).toBeVisible();
  await prompt.getByLabel('Student name').fill('Ada Student');
  await prompt.getByLabel('Student name').blur();
  await prompt.getByLabel('Gym name').fill('GB Ellijay');
  await prompt.getByLabel('Gym name').blur();
  await prompt.getByLabel('Start date').fill('2014-03-01');
  await prompt.getByLabel('Start date').blur();
  await expect(prompt).toHaveCount(0);

  const sheet = page.getByRole('article', { name: 'Self-assessment' });
  await expect(sheet).toContainText('Ada Student');
  await expect(sheet).toContainText('GB Ellijay');
  await expect(sheet).toContainText('2014-03-01');
  await expect(sheet.getByRole('img', { name: /This check-in/ })).toBeVisible();
  await expect(sheet).toContainText('calm rounds');
  await expect(sheet).toContainText('Earlier check-ins');
  await expect(sheet).toContainText('4.1');
  await expect(sheet.getByRole('list', { name: 'Area scores' })).toContainText('Guard');
  await page.screenshot({ path: '/opt/cursor/artifacts/student-print-assessment.png', fullPage: true });

  const assessmentDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  expect((await assessmentDownload).suggestedFilename()).toMatch(/^advantage-student-self-assessment-\d{4}-\d{2}-\d{2}\.pdf$/);

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.student-print-toolbar')).toBeHidden();
  await expect(page.locator('.report-prompt')).toHaveCount(0);
  await expect(page.locator('main.student')).toHaveCSS('overflow', 'visible');
  await expect(page.locator('main.student')).toHaveCSS('max-height', 'none');
  await expect(sheet).toContainText('Ada Student');
  await page.screenshot({ path: '/opt/cursor/artifacts/student-print-assessment-paper.png', fullPage: true });
  await page.emulateMedia({ media: 'screen' });

  await page.goto('/student/rubric?student=1');
  await expect(page.getByRole('heading', { name: 'Belt progress' })).toBeVisible();
  await expect(page.getByRole('paragraph').filter({ hasText: /^White$/ })).toBeVisible();

  await page.goto('/student/print/progress?student=1');
  await expect(page.getByRole('button', { name: 'Sign out of seat' })).toHaveCount(0);
  await expect(page.getByText('Signed in as')).toHaveCount(0);
  const progress = page.getByRole('article', { name: 'Progress report' });
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
  const belts = progress.getByRole('region', { name: 'Belt progress' });
  await expect(belts).toContainText('White');
  await expect(belts).toContainText('Blue');
  await expect(belts).toContainText('Coral');
  await expect(belts.getByText('Grey', { exact: true })).toHaveCount(0);
  await expect(belts.getByText('Yellow', { exact: true })).toHaveCount(0);
  const journal = progress.getByRole('region', { name: 'Journal summary' });
  await expect(journal).toContainText('Fundamentals');
  await expect(journal).toContainText('collar grip deeper');
  await expect(journal).not.toContainText('Class:');
  await expect(progress.getByRole('region', { name: 'Opponent scouting' })).toContainText('Dario Kent');
  await expect(progress.getByRole('region', { name: 'Opponent scouting' })).toContainText('Guard 4');
  await expect(progress.getByRole('region', { name: 'Video library' })).toContainText('Berimbolo to back take');
  await expect(progress).toContainText('Ada Student');
  await page.screenshot({ path: '/opt/cursor/artifacts/student-print-progress.png', fullPage: true });

  const progressDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  expect((await progressDownload).suggestedFilename()).toMatch(/^advantage-student-progress-\d{4}-\d{2}-\d{2}\.pdf$/);

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.student-print-toolbar')).toBeHidden();
  await expect(page.locator('main.student')).toHaveCSS('overflow', 'visible');
  await expect(page.locator('main.student')).toHaveCSS('max-height', 'none');
  await expect(progress.getByRole('heading', { name: 'Video library', exact: true })).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/student-print-progress-paper.png', fullPage: true });

  await page.emulateMedia({ media: 'screen' });
  await page.goto('/student/rank?student=1');
  const profile = page.getByRole('region', { name: 'Profile' });
  await expect(profile.getByLabel('Student name')).toHaveValue('Ada Student');
  await expect(profile.getByLabel('Gym name')).toHaveValue('GB Ellijay');
  await expect(profile.getByLabel('Start date')).toHaveValue('2014-03-01');
  await expect(page.getByRole('button', { name: 'White', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out of seat' })).toHaveCount(0);
});
