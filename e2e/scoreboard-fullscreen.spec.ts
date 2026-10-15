import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const PHONE = { width: 390, height: 844 };

function matchState() {
  return {
    blue: {
      name: 'Kat B.',
      gym: 'Alliance',
      rank: '',
      points: 0,
      advantages: 0,
      disadvantages: 0,
    },
    white: {
      name: 'Sam R.',
      gym: 'Checkmat',
      rank: '',
      points: 0,
      advantages: 0,
      disadvantages: 0,
    },
    round: 'Final',
    division: 'Adult',
    durationMs: 300000,
    remainingMs: 300000,
    running: false,
    startedAt: null,
    startBeep: false,
    warningBeep: false,
    warned: false,
    endBuzzer: false,
    endCue: 'off',
    bracketMatchId: 'final-0',
    autoAnnounce: false,
    skin: 'MOCK_TOURNAMENT',
    carlos: { enabled: false, onWin: false, onPoints: false, pointsThreshold: 8 },
    outcome: null,
    outcomeFlash: null,
    revision: 4,
  };
}

async function installFullscreenMock(page: Page) {
  await page.addInitScript(() => {
    const fs = { element: null as Element | null, exits: 0, enters: 0 };
    (window as unknown as { __fs: typeof fs }).__fs = fs;
    Element.prototype.requestFullscreen = function () {
      fs.enters += 1;
      fs.element = document.documentElement;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    };
    document.exitFullscreen = async () => {
      fs.exits += 1;
      fs.element = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fs.element,
    });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
  });
}

async function seedBoard(page: Page) {
  await page.addInitScript((state) => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('matboard.match.v1', JSON.stringify(state));
    localStorage.setItem('matboard.tvTip.v1', '1');
  }, matchState());
}

async function openBoard(page: Page, viewport: { width: number; height: number }) {
  await installFullscreenMock(page);
  await seedBoard(page);
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/match?from=suite');
  await expect(page.getByRole('link', { name: 'Back to bracket' })).toBeVisible();
  await expect(page.getByText('Kat B.', { exact: true })).toBeVisible();
}

async function enterFullscreen(page: Page) {
  const board = page.locator('main.display');
  if (!(await board.evaluate((el) => el.classList.contains('play--fs')))) {
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  }
  await expect(board).toHaveClass(/play--fs/);
  await expect(page.getByRole('button', { name: 'Exit fullscreen' })).toHaveCount(0);
}

async function topRowMetrics(page: Page) {
  return page.evaluate(() => {
    const row = document.querySelector('.bout--blue');
    const name = document.querySelector('.bout--blue h1 a');
    const back = document.querySelector('.display-back');
    const exit = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim() === 'Exit fullscreen');
    if (!(row instanceof HTMLElement) || !(name instanceof HTMLElement) || !(back instanceof HTMLElement)) {
      return null;
    }
    const rowBox = row.getBoundingClientRect();
    const nameBox = name.getBoundingClientRect();
    const backBox = back.getBoundingClientRect();
    const scores = [...row.querySelectorAll('.score')].map((el) => el.getBoundingClientRect());
    const ix = Math.min(nameBox.right, backBox.right) - Math.max(nameBox.left, backBox.left);
    const iy = Math.min(nameBox.bottom, backBox.bottom) - Math.max(nameBox.top, backBox.top);
    const exitStyle = exit instanceof HTMLElement ? getComputedStyle(exit) : null;
    const exitBox = exit instanceof HTMLElement ? exit.getBoundingClientRect() : null;
    return {
      rowTop: rowBox.top,
      rowLeft: rowBox.left,
      rowRight: rowBox.right,
      paddingTop: getComputedStyle(row).paddingTop,
      nameTop: nameBox.top,
      nameLeft: nameBox.left,
      backTop: backBox.top,
      backLeft: backBox.left,
      backWidth: backBox.width,
      nameHitsBack: ix > 1 && iy > 1,
      scoreCount: scores.length,
      scoresRightOfName: scores.every((box) => box.left >= nameBox.right - 1 || box.top >= nameBox.bottom - 1),
      exitVisible: Boolean(
        exitBox &&
          exitBox.width > 2 &&
          exitBox.height > 2 &&
          exitStyle &&
          exitStyle.display !== 'none' &&
          exitStyle.visibility !== 'hidden',
      ),
    };
  });
}

test('fullscreen scoreboard drops Exit fullscreen and sits the top row on the screen', async ({ page }) => {
  mkdirSync('/opt/cursor/artifacts', { recursive: true });
  await openBoard(page, PHONE);
  await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toBeVisible();
  await enterFullscreen(page);

  const metrics = await topRowMetrics(page);
  expect(metrics, 'blue scorecard metrics').not.toBeNull();
  expect(metrics!.exitVisible).toBe(false);
  expect(metrics!.rowTop).toBeLessThanOrEqual(1);
  expect(metrics!.paddingTop).toBe('0px');
  expect(metrics!.nameHitsBack).toBe(false);
  expect(metrics!.backTop).toBeLessThanOrEqual(8);
  expect(metrics!.backLeft).toBeLessThanOrEqual(8);
  expect(metrics!.scoreCount).toBe(3);

  const blue = page.getByRole('region', { name: 'Blue competitor' });
  await expect(page.getByRole('button', { name: 'Start or pause match clock' })).toBeVisible();
  await expect(blue.getByRole('button', { name: /Points 0/ })).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/scoreboard-fullscreen-390.png' });

  await page.addStyleTag({ content: ':root { --safe-t: 24px; }' });
  const notched = await topRowMetrics(page);
  expect(notched!.rowTop).toBeLessThanOrEqual(1);
  expect(notched!.paddingTop).toBe('24px');
  expect(notched!.nameHitsBack).toBe(false);

  await blue.getByRole('button', { name: /Points 0/ }).click();
  await expect(blue.getByRole('button', { name: /Points 1/ })).toBeVisible();
  await page.getByRole('button', { name: 'Start or pause match clock' }).click();
  await expect(page.getByRole('button', { name: 'Pause match clock', exact: true })).toBeVisible();

  await page.evaluate(() => {
    window.addEventListener('keydown', (event) => {
      const fs = (window as unknown as { __fs: { element: Element | null } }).__fs;
      if (event.key !== 'Escape' || event.defaultPrevented || !fs.element) return;
      fs.element = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
  });
  await page.keyboard.press('Escape');
  await expect(page.locator('main.display')).not.toHaveClass(/play--fs/);
  await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toBeVisible();

  await enterFullscreen(page);
  const exitsBefore = await page.evaluate(() => (window as unknown as { __fs: { exits: number } }).__fs.exits);
  await page.getByRole('link', { name: 'Back to bracket' }).click();
  await expect(page).toHaveURL(/\/tournament\?from=suite/);
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __fs: { exits: number } }).__fs.exits)).toBeGreaterThan(exitsBefore);
});

test('landscape fullscreen keeps the clock and the score pads beside the name', async ({ page }) => {
  await openBoard(page, { width: 844, height: 390 });
  await enterFullscreen(page);

  const metrics = await topRowMetrics(page);
  expect(metrics).not.toBeNull();
  expect(metrics!.exitVisible).toBe(false);
  expect(metrics!.rowTop).toBeLessThanOrEqual(1);
  expect(metrics!.paddingTop).toBe('0px');
  expect(metrics!.nameHitsBack).toBe(false);
  expect(metrics!.scoresRightOfName).toBe(true);
  const scoreLeft = await page.locator('.bout--blue .score').first().evaluate((el) => el.getBoundingClientRect().left);
  const nameRight = await page.locator('.bout--blue h1 a').evaluate((el) => el.getBoundingClientRect().right);
  expect(scoreLeft).toBeGreaterThan(nameRight - 1);
  await expect(page.getByRole('button', { name: 'Start or pause match clock' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to bracket' })).toBeVisible();
});
