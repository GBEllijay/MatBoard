import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('my profile saves name, gym, and an optional start date at 390px', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/student?student=1');
  await expect(page.getByRole('link', { name: 'Rank & Progress', exact: true })).toContainText('White');
  await expect(page.getByText('Pan Pacific')).toHaveCount(0);
  await expect(page.getByText('(mock)')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'My profile', exact: true })).toContainText('Name, gym, and start date');

  await page.goto('/student/print/progress?student=1');
  const progress = page.getByRole('article', { name: 'Progress report' });
  await expect(progress).toContainText('Student: Not named');
  await expect(progress).toContainText('Gym: Not named');
  await expect(progress).toContainText('Started: Not set');

  await page.goto('/student/print/assessment?student=1');
  const assessment = page.getByRole('article', { name: 'Self-assessment' });
  await expect(assessment).toContainText('Student: Not named');
  await expect(assessment).toContainText('Gym: Not named');
  await expect(assessment).toContainText('Started: Not set');

  await page.goto('/student/progress?student=1');
  await page.getByRole('link', { name: 'My profile', exact: true }).click();
  await expect(page).toHaveURL(/\/student\/profile\?student=1$/);
  await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
  await expect(page.locator('main.student')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByRole('link', { name: 'Back. Hold for Home.' })).toHaveAttribute('href', /\/student\/progress\?student=1$/);

  const form = page.getByRole('form', { name: 'My profile' });
  await expect(form.getByLabel('Name')).toHaveValue('');
  await expect(form.getByLabel('Gym')).toHaveValue('');
  await expect(form.getByLabel('Training start date')).toHaveValue('');
  await form.getByLabel('Name').fill('Ada Student');
  await form.getByLabel('Gym').fill('GB Ellijay');
  await form.getByRole('button', { name: 'Save profile' }).click();
  await expect(form.getByRole('status')).toHaveText('Saved on this phone.');

  await page.goto('/student/print/progress?student=1');
  await expect(page.getByRole('article', { name: 'Progress report' })).toContainText('Student: Ada Student');
  await expect(page.getByRole('article', { name: 'Progress report' })).toContainText('Gym: GB Ellijay');
  await expect(page.getByRole('article', { name: 'Progress report' })).toContainText('Started: Not set');

  await page.goto('/student/profile?student=1');
  await form.getByLabel('Training start date').fill('2014-03-01');
  await form.getByRole('button', { name: 'Save profile' }).click();
  await expect(form.getByRole('status')).toHaveText('Saved on this phone.');
  await page.reload();
  await expect(form.getByLabel('Name')).toHaveValue('Ada Student');
  await expect(form.getByLabel('Gym')).toHaveValue('GB Ellijay');
  await expect(form.getByLabel('Training start date')).toHaveValue('2014-03-01');
  await page.screenshot({ path: '/opt/cursor/artifacts/student_profile_390.png', fullPage: true });

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('matboard.studentEdition.v1') || '{}'));
  expect(stored.profile.displayName).toBe('Ada Student');
  expect(stored.profile.gymName).toBe('GB Ellijay');
  expect(stored.profile.startedOn).toBe('2014-03-01');
  expect(stored.profile.belt).toBe('white');
  expect(stored.journal).toEqual([]);
  expect(stored.competition.tournaments).toEqual([]);

  await page.goto('/student/print/progress?student=1');
  const filledProgress = page.getByRole('article', { name: 'Progress report' });
  await expect(filledProgress).toContainText('Student: Ada Student');
  await expect(filledProgress).toContainText('Gym: GB Ellijay');
  await expect(filledProgress).toContainText('Started: 2014-03-01');
  await expect(filledProgress).not.toContainText('Not named');
  await expect(filledProgress).not.toContainText('Not set');

  await page.goto('/student/print/assessment?student=1');
  const filledAssessment = page.getByRole('article', { name: 'Self-assessment' });
  await expect(filledAssessment).toContainText('Student: Ada Student');
  await expect(filledAssessment).toContainText('Gym: GB Ellijay');
  await expect(filledAssessment).toContainText('Started: 2014-03-01');
  await expect(filledAssessment).not.toContainText('Not named');
  await expect(filledAssessment).not.toContainText('Not set');

  await page.goto('/student/journal?student=1');
  await expect(page.locator('main.student')).toHaveCSS('font-family', /Patrick Hand/);

  const backupPath = '/tmp/student-profile-backup.json';
  page.on('download', async (download) => {
    if (download.suggestedFilename().startsWith('advantage-student-backup-')) await download.saveAs(backupPath);
  });
  await page.goto('/student/backup?student=1');
  await page.getByRole('button', { name: 'Back up my journal' }).click();
  await expect.poll(async () => {
    try {
      const text = await readFile(backupPath, 'utf8');
      return text.includes('Ada Student') && text.includes('GB Ellijay') && text.includes('2014-03-01');
    } catch {
      return false;
    }
  }).toBe(true);

  await page.goto('/student/share?student=1');
  const coachDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Make a file for my coach', exact: true }).click();
  const coachFile = await coachDownload;
  expect(coachFile.suggestedFilename()).toContain('advantage-handoff-student-progress-report-');
  const coachBody = await readFile(await coachFile.path(), 'utf8');
  const coachJson = JSON.parse(coachBody) as { profile?: { displayName?: string; gymName?: string; startedOn?: string; belt?: string } };
  expect(coachJson.profile?.displayName).toBe('Ada Student');
  expect(coachJson.profile?.gymName).toBe('GB Ellijay');
  expect(coachJson.profile?.startedOn).toBe('2014-03-01');
  expect(coachJson.profile?.belt).toBe('white');

  await page.evaluate(() => localStorage.removeItem('matboard.studentEdition.v1'));
  await page.goto('/student/print/progress?student=1');
  await expect(page.getByRole('article', { name: 'Progress report' })).toContainText('Student: Not named');
  await expect(page.getByRole('article', { name: 'Progress report' })).toContainText('Gym: Not named');
  await expect(page.getByRole('article', { name: 'Progress report' })).toContainText('Started: Not set');

  await page.goto('/student/backup?student=1');
  await page.getByLabel('Restore from backup').setInputFiles(backupPath);
  await page.getByRole('button', { name: 'Replace this phone' }).click();
  await expect(page.getByRole('status')).toContainText('The backup replaced the journal on this phone.');

  await page.goto('/student/profile?student=1');
  await expect(page.getByLabel('Name')).toHaveValue('Ada Student');
  await expect(page.getByLabel('Gym')).toHaveValue('GB Ellijay');
  await expect(page.getByLabel('Training start date')).toHaveValue('2014-03-01');
  await page.goto('/student?student=1');
  await expect(page.getByRole('link', { name: 'Rank & Progress', exact: true })).toContainText('White');
  await expect(page.getByRole('link', { name: 'My profile', exact: true })).toContainText('Ada Student');
  await expect(page.getByText('Pan Pacific')).toHaveCount(0);
  await expect(page.getByText('(mock)')).toHaveCount(0);
});
