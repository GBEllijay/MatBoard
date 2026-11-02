import { expect, test } from '@playwright/test';

test('/products title is centered on the card column at phone width and stays left on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/products');
  const centers = async () =>
    page.evaluate(() => {
      const h1 = document.querySelector('.home__mark h1');
      const modes = document.querySelector('.home__modes');
      const tag = document.querySelector('.home__mark > p');
      if (!h1 || !modes || !tag) return null;
      const range = document.createRange();
      range.selectNodeContents(h1);
      const ink = range.getBoundingClientRect();
      const cards = modes.getBoundingClientRect();
      const line = tag.getBoundingClientRect();
      return {
        title: ink.x + ink.width / 2,
        tag: line.x + line.width / 2,
        cards: cards.x + cards.width / 2,
        align: getComputedStyle(h1).textAlign,
      };
    });
  const phone = await centers();
  expect(phone).not.toBeNull();
  expect(phone!.align).toBe('center');
  expect(Math.abs(phone!.title - phone!.cards)).toBeLessThan(8);
  expect(Math.abs(phone!.tag - phone!.cards)).toBeLessThan(8);

  await page.setViewportSize({ width: 1440, height: 900 });
  const wide = await centers();
  expect(wide!.align).toBe('left');
  expect(wide!.title).toBeLessThan(wide!.cards - 80);
});

test('/products locked cards: Media Learn more, Student demo stays, no Pro Plus checkout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/products');
  const media = page.locator('.mode-card--media');
  await expect(media.getByRole('link', { name: 'Learn more about Media Edition' })).toHaveAttribute('href', '/editions/media');
  await expect(page.getByRole('link', { name: 'Try the demo' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Pro Cloud Plus Console' })).toHaveCount(0);
  await expect(page.locator('.mode-card--cloud')).toContainText('$5.99/month');
  await expect(page.getByRole('link', { name: 'Advantage Pro + Cloud, coming soon' })).toBeVisible();
});
