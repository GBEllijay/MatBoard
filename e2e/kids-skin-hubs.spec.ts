import { expect, test, type Page } from '@playwright/test';

async function seed(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('advantage.whiteUnlocked', '1');
    localStorage.setItem('matboard.kidsScoreboard.v1', JSON.stringify({ enabled: true, skin: 'dinos', mascot: true }));
    localStorage.setItem('matboard.bracketTheme.v1', 'bright');
    localStorage.setItem(
      'matboard.tournament.v1',
      JSON.stringify({
        version: 2,
        activeId: 'bracket-1',
        saved: [
          {
            id: 'bracket-1',
            name: 'Kids Gi',
            updatedAt: 1,
            board: {
              version: 1,
              size: 4,
              placement: 'ibjjf',
              title: 'Kids Gi',
              entries: {
                'sf-0-a': 'Cam Diaz',
                'sf-0-b': 'Zoe Park',
                'sf-1-a': 'Noa Kim',
                'sf-1-b': 'Dee Ortiz',
              },
              results: {},
            },
          },
        ],
      }),
    );
  });
}

function skinButton(page: Page) {
  return page.getByRole('button', { name: /^Skin/ });
}

test('Skin picker shows on Coach Unlimited and Pro, and stays hidden on plain Coach', async ({ page }) => {
  test.setTimeout(60_000);
  await seed(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/tournament?from=unlimited');
  await expect(page.getByLabel('Division or class name')).toHaveValue('Kids Gi');
  await expect(page.locator('main')).toHaveClass(/tournament--kids-dinos/);
  await expect(skinButton(page)).toBeVisible();
  await skinButton(page).click();
  const picker = page.locator('.kids-skin__picker');
  await expect(picker).toBeVisible();
  await expect(picker.locator('.kids-skin__thumb')).toHaveCount(6);
  await page.screenshot({
    path: '/opt/cursor/artifacts/coach-unlimited-kids-skin-390.png',
    fullPage: false,
  });
  await picker.getByRole('radio', { name: 'Ocean' }).click();
  await expect(picker).toBeHidden();
  await expect(page.locator('main')).toHaveClass(/tournament--kids-ocean/);
  await expect(skinButton(page)).toHaveAttribute('aria-label', 'Skin, Ocean');

  await page.getByRole('button', { name: 'Open Semifinals on scoreboard' }).first().click();
  await expect(page).toHaveURL(/from=unlimited/);
  await expect(page).toHaveURL(/kids=ocean/);
  await page.getByRole('link', { name: 'Back to bracket' }).click();
  await expect(page).toHaveURL(/\/tournament\?from=unlimited/);
  await expect(page.locator('main')).toHaveClass(/tournament--kids-ocean/);
  await expect(skinButton(page)).toBeEnabled();
  await skinButton(page).click();
  await expect(page.locator('.kids-skin__picker')).toBeVisible();
  await page.locator('.tournament__roundline').click();
  await expect(page.locator('.kids-skin__picker')).toBeHidden();

  await page.goto('/tournament?from=suite');
  await expect(page.locator('main')).toHaveClass(/tournament--kids-dinos/);
  await expect(skinButton(page)).toBeVisible();
  await skinButton(page).click();
  await expect(page.locator('.kids-skin__picker')).toBeVisible();
  await expect(page.locator('.kids-skin__thumb')).toHaveCount(6);
  await page.locator('.kids-skin__thumb').filter({ hasText: 'Robots' }).click();
  await expect(page.locator('main')).toHaveClass(/tournament--kids-robots/);

  await page.goto('/tournament?from=coach');
  await expect(skinButton(page)).toHaveCount(0);
  await expect(page.locator('.kids-skin__picker')).toHaveCount(0);
  await expect(page.locator('main')).not.toHaveClass(/tournament--kids/);
  await expect(page.getByRole('heading', { name: 'Mock Tournament' })).toBeVisible();
});
