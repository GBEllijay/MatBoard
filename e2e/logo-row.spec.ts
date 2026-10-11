import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const BACK = 'Back. Hold for Home.';
const WIDTHS = [360, 390, 412] as const;
const CLIP = path.join(process.cwd(), 'e2e/fixtures/tiny-lesson.mp4');

const PAGES: { path: string; home: boolean }[] = [
  { path: '/notes?from=coach', home: false },
  { path: '/notes?plan=unlimited', home: false },
  { path: '/techniques?from=coach', home: true },
  { path: '/techniques?from=unlimited', home: true },
  { path: '/technique-tree?from=coach', home: true },
  { path: '/technique-tree?from=unlimited', home: true },
  { path: '/roster?from=students', home: true },
  { path: '/roster?from=unlimited', home: true },
  { path: '/roster?from=competitors', home: true },
  { path: '/tournament?from=coach', home: true },
  { path: '/tournament?from=suite', home: true },
  { path: '/competition-curriculum', home: true },
  { path: '/competition-curriculum?plan=unlimited', home: true },
  { path: '/coach-unlimited', home: true },
  { path: '/instructors', home: true },
  { path: '/suite', home: true },
  { path: '/schedule', home: true },
  { path: '/game-plan', home: true },
  { path: '/competition-ready', home: true },
  { path: '/rankings', home: true },
  { path: '/competitors', home: true },
  { path: '/class-history?from=unlimited', home: true },
  { path: '/white/roster', home: true },
  { path: '/coaching-tools', home: true },
  { path: '/review', home: true },
];

async function unlock(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('advantage.whiteUnlocked', '1');
    localStorage.setItem('advantage.coachUnlocked', '1');
    localStorage.setItem('advantage.proUnlocked', '1');
  });
}

async function leaveFullscreen(page: Page) {
  await page.evaluate(async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
  });
  try {
    const session = await page.context().newCDPSession(page);
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
  } catch {
    /* Headless builds have no window to restore. */
  }
}

test('center Home logo misses headings, kickers, and buttons at phone widths', async ({ page }) => {
  await unlock(page);
  for (const width of WIDTHS) {
    await leaveFullscreen(page);
    await page.setViewportSize({ width, height: 844 });
    for (const entry of PAGES) {
      await page.goto(entry.path);
      const home = page.getByRole('link', { name: 'Home', exact: true });
      if (!entry.home) {
        await expect(home).toHaveCount(0);
        await expect(page.getByRole('link', { name: BACK, exact: true })).toBeVisible();
        continue;
      }
      await expect(home).toBeVisible();
      const hits = await home.evaluate((mark) => {
        const box = mark.getBoundingClientRect();
        const hits: string[] = [];
        const nodes = document.querySelectorAll('h1, h2, h3, button, [class*="eyebrow"], [class*="kicker"]');
        for (const node of nodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (mark.contains(node) || node.contains(mark)) continue;
          const style = getComputedStyle(node);
          if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
          const rect = node.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) continue;
          const overlaps =
            box.left < rect.right - 1 &&
            box.right > rect.left + 1 &&
            box.top < rect.bottom - 1 &&
            box.bottom > rect.top + 1;
          if (overlaps) hits.push((node.textContent || node.getAttribute('aria-label') || node.tagName).trim().slice(0, 80));
        }
        return hits;
      });
      expect(hits, `${entry.path} at ${width}px`).toEqual([]);
    }
  }
});

test('saving a lesson video returns to that Daily Lesson Plan day', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 844 });
  await unlock(page);

  const hubs = [
    { hub: '/coach-unlimited', lesson: '/notes?plan=unlimited', back: '/coach-unlimited' },
    { hub: '/coach', lesson: '/notes?from=coach', back: '/coach' },
  ] as const;

  for (const entry of hubs) {
    await page.goto(entry.hub);
    await page.getByRole('link', { name: 'Daily Lesson Plan', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(entry.lesson.replace('?', '\\?')));
    await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0);
    const day = new URL(page.url()).searchParams.get('date');

    await page.getByRole('button', { name: 'Open Daily Training Videos for Warm-up' }).click();
    await expect(page.getByRole('heading', { name: 'Daily Training Videos' })).toBeVisible();
    await page.getByRole('button', { name: '+ Add video' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Add video' })).toBeVisible();
    await page.locator('#techniques-video-library').setInputFiles(CLIP);
    await expect(page.getByRole('dialog', { name: 'Add video' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Replace' }).first()).toBeVisible();

    await page.getByRole('link', { name: BACK, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Daily Lesson Plan' })).toBeVisible();
    const returned = new URL(page.url());
    expect(returned.pathname).toBe('/notes');
    if (entry.hub === '/coach-unlimited') {
      expect(returned.searchParams.get('plan')).toBe('unlimited');
      expect(returned.searchParams.get('from')).toBe('unlimited');
    } else {
      expect(returned.searchParams.get('from')).toBe('coach');
    }
    expect(returned.searchParams.get('date')).toBeTruthy();
    if (day) expect(returned.searchParams.get('date')).toBe(day);

    await page.getByRole('link', { name: BACK, exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(entry.back);
    await expect(page.getByRole('link', { name: 'Daily Lesson Plan', exact: true })).toBeVisible();
  }
});
