import { expect, test, devices, type Page } from '@playwright/test';

test.use({ ...devices['iPhone 13'] });

async function seed(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    if (!localStorage.getItem('matboard.roster.v1')) {
      localStorage.setItem(
        'matboard.roster.v1',
        JSON.stringify({
          version: 1,
          students: [
            {
              id: 'mia',
              name: 'Mia Santos',
              belt: 'White',
              division: '',
              gym: '',
              photo: '',
              lastPromotion: '',
              lastPromotionDetail: '',
              note: '',
              checkedIn: false,
            },
          ],
          ready: {},
          gamePlans: {},
        }),
      );
    }
    if (!localStorage.getItem('matboard.tournament.v1')) {
      localStorage.setItem(
        'matboard.tournament.v1',
        JSON.stringify({
          version: 2,
          activeId: 'bracket-1',
          saved: [
            {
              id: 'bracket-1',
              name: 'Open',
              updatedAt: 1,
              board: {
                version: 1,
                size: 4,
                placement: 'ibjjf',
                title: '',
                entries: {},
                results: {},
                lastOutcomeMatchId: null,
              },
            },
          ],
        }),
      );
    }
  });
}

test('a free-typed iPhone bracket name sticks and roster suggestions still fill', async ({ page }) => {
  await seed(page);
  await page.goto('/tournament?from=suite');
  const top = page.getByRole('textbox', { name: 'Semifinals, top competitor' }).first();
  await top.click();
  const typed = page.getByRole('textbox', { name: 'Competitor name' });
  await typed.fill('Jordan Hale');
  await typed.evaluate((input) => {
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    proto?.set?.call(input, '');
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(typed).toHaveValue('Jordan Hale');
  await typed.blur();
  await expect(top).toHaveValue('Jordan Hale');
  await page.getByRole('checkbox', { name: 'Add Competitor to Roster?' }).check();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(top).toHaveValue('Jordan Hale');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Semifinals, top competitor' }).first()).toHaveValue('Jordan Hale');

  const bottom = page.getByRole('textbox', { name: 'Semifinals, bottom competitor' }).first();
  await bottom.click();
  await page.getByRole('textbox', { name: 'Competitor name' }).fill('mi');
  await page.getByRole('button', { name: /Mia Santos/ }).click();
  await expect(bottom).toHaveValue('Mia Santos');

  const other = page.getByRole('textbox', { name: 'Semifinals, top competitor' }).nth(1);
  await other.click();
  await page.getByRole('textbox', { name: 'Competitor name' }).fill('Casey Ng');
  await page.getByRole('textbox', { name: 'Competitor name' }).press('Enter');
  await expect(other).toHaveValue('Casey Ng');

  await page.getByRole('button', { name: 'Win', exact: true }).first().click();
  await page.getByRole('button', { name: /Submission/ }).click();
  await expect(page.getByRole('textbox', { name: 'Final, top competitor' })).toHaveValue('Jordan Hale');
  await page.getByRole('button', { name: 'Undo last result' }).click();
  await expect(page.getByRole('textbox', { name: 'Semifinals, top competitor' }).first()).toHaveValue('Jordan Hale');
  await expect(page.getByRole('textbox', { name: 'Final, top competitor' })).toHaveValue('');

  const roster = await page.evaluate(() => localStorage.getItem('matboard.roster.v1') ?? '');
  expect(roster).not.toContain('Jordan Hale');
  expect(roster).not.toContain('Casey Ng');
  expect(roster).toContain('Mia Santos');
});
