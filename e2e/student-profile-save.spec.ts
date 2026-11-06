import { expect, test } from '@playwright/test';

test('save stays on the editable profile card, and Both sticks after reload', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.studentEditionUnlocked', '1');
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/student/profile?student=1');
  await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
  await expect(page.getByText('DEMO MODE')).toHaveCount(0);

  const form = page.getByRole('form', { name: 'My profile' });
  await form.getByLabel('Name').fill('Ada Student');
  await form.getByLabel('Gym').fill('Advantage');

  const training = page.getByRole('radiogroup', { name: 'Training style' });
  const choice = (name: 'Gi' | 'No-Gi' | 'Both') => training.getByRole('radio', { name, exact: true });
  await choice('Gi').click();
  await expect(choice('Gi')).toHaveAttribute('aria-checked', 'true');
  await choice('No-Gi').click();
  await choice('Both').click();
  await expect(choice('Both')).toHaveAttribute('aria-checked', 'true');
  await expect(choice('Gi')).toHaveAttribute('aria-checked', 'false');
  await expect(choice('No-Gi')).toHaveAttribute('aria-checked', 'false');

  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Saved on this phone.')).toBeVisible();
  await expect(page).toHaveURL(/\/student\/profile\?student=1$/);
  await expect(page.getByTestId('student-card-preview')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const face = page.getByTestId('profile-card-face');
  await expect(face).toBeVisible();
  await expect(face.getByRole('button', { name: 'Ada Student' })).toBeVisible();
  await expect(face).toContainText('Trains · Gi and No-Gi');
  await expect(face.getByRole('button', { name: 'Gym · Advantage' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('radiogroup', { name: 'Training style' }).getByRole('radio', { name: 'Both', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByTestId('profile-card-face')).toContainText('Trains · Gi and No-Gi');
  await expect(page.getByTestId('student-card-preview')).toHaveCount(0);
  await expect(page.getByLabel('Name')).toHaveValue('Ada Student');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('matboard.studentEdition.v1') || '{}'));
  expect(stored.profile.trainingStyle).toBe('both');
  expect(stored.profile.displayName).toBe('Ada Student');
});
