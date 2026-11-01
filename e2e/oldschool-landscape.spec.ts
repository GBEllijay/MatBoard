import { expect, test, type Page } from '@playwright/test';

/** Old School flip cards in phone landscape fill the POINTS panel like portrait. */
function matchState() {
  return {
    blue: { name: 'Competitor 1', gym: '', rank: '', points: 0, advantages: 0, disadvantages: 0 },
    white: { name: 'Competitor 2', gym: '', rank: '', points: 0, advantages: 0, disadvantages: 0 },
    round: '',
    division: 'Open',
    durationMs: 300000,
    remainingMs: 291000,
    running: false,
    startedAt: null,
    startBeep: false,
    warningBeep: false,
    warned: false,
    endBuzzer: false,
    endCue: 'off',
    bracketMatchId: null,
    autoAnnounce: false,
    skin: 'OLD_SCHOOL',
    carlos: { enabled: false, onWin: false, onPoints: false, pointsThreshold: 8 },
    outcome: null,
    outcomeFlash: null,
    revision: 4,
  };
}

async function openOldSchool(page: Page, width: number, height: number) {
  await page.addInitScript((state) => {
    localStorage.setItem('advantage.proUnlocked', '1');
    localStorage.setItem('advantage.legacyNoticeDismissed', '1');
    localStorage.setItem('matboard.tvTip.v1', '1');
    localStorage.setItem('matboard.match.v1', JSON.stringify(state));
  }, matchState());
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/match?from=suite');
  await expect(page.locator('.scoreboard-skin--old-school .bout--blue .flap__card').first()).toBeVisible();
}

async function metrics(page: Page) {
  return page.evaluate(() => {
    const bout = document.querySelector('.bout--blue') as HTMLElement;
    const box = (sel: string) => (bout.querySelector(sel) as HTMLElement).getBoundingClientRect();
    const label = (kind: string) => {
      const el = [...bout.querySelectorAll<HTMLElement>(`.score--${kind} .score__label`)].find(
        (node) => getComputedStyle(node).display !== 'none',
      );
      return el ? { text: (el.textContent || '').trim(), clipped: el.scrollWidth > el.clientWidth + 1 } : null;
    };
    const panel = box('.bout__scores');
    const points = box('.score--points .flap__card');
    const adv = box('.score--advantages .flap__card');
    const pen = box('.score--disadvantages .flap__card');
    return {
      panelH: panel.height,
      pointsH: points.height,
      pointsGapAbove: points.top - panel.top,
      advH: adv.height,
      penH: pen.height,
      face: parseFloat(getComputedStyle(bout.querySelector('.score--points .flap__face') as HTMLElement).fontSize),
      labels: [label('points'), label('advantages'), label('disadvantages')],
    };
  });
}

for (const [width, height] of [
  [915, 412],
  [844, 390],
  [740, 360],
] as const) {
  test(`Old School landscape ${width}x${height}: cards fill the panel, short labels`, async ({ page }) => {
    await openOldSchool(page, width, height);
    const m = await metrics(page);
    // Before the fix points cards were under half the panel (72 of 154 at 915x412).
    expect(m.pointsH / m.panelH).toBeGreaterThan(0.58);
    expect(m.pointsGapAbove).toBeLessThan(m.panelH * 0.32);
    expect(m.face).toBeGreaterThan(m.panelH * 0.38);
    // Adv and Pen stay proportionally smaller than points, like portrait.
    expect(m.advH / m.pointsH).toBeGreaterThan(0.65);
    expect(m.advH).toBeLessThan(m.pointsH);
    expect(m.penH / m.pointsH).toBeGreaterThan(0.48);
    expect(m.penH).toBeLessThan(m.advH);
    expect(m.labels.map((l) => l?.text.toUpperCase())).toEqual(['POINTS', 'ADV', 'PEN']);
    expect(m.labels.every((l) => l && !l.clipped)).toBe(true);
  });
}

test('Old School portrait keeps big cards and short labels', async ({ page }) => {
  await openOldSchool(page, 412, 915);
  const m = await metrics(page);
  expect(m.pointsH / m.panelH).toBeGreaterThan(0.6);
  expect(m.labels.map((l) => l?.text.toUpperCase())).toEqual(['POINTS', 'ADV', 'PEN']);
});

test('Old School TV keeps the wide headers', async ({ page }) => {
  await openOldSchool(page, 1920, 1080);
  const m = await metrics(page);
  expect(m.pointsH / m.panelH).toBeGreaterThan(0.7);
  expect(m.labels.map((l) => l?.text.toUpperCase())).toEqual(['POINTS', 'ADVANTAGES', 'PENALTIES']);
  expect(m.labels.every((l) => l && !l.clipped)).toBe(true);
});
