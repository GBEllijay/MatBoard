import { expect, test, type Browser, type Page } from '@playwright/test';

const VIEWPORTS = [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tv', width: 1920, height: 1080 },
] as const;

function pointsMatch(points: number, extra?: { advantages?: number; disadvantages?: number; remainingMs?: number }) {
  return {
    blue: {
      name: 'Mia Santos',
      gym: 'Alliance',
      rank: '',
      points,
      advantages: extra?.advantages ?? 1,
      disadvantages: extra?.disadvantages ?? 0,
    },
    white: {
      name: 'Leo Park',
      gym: 'Checkmat',
      rank: '',
      points: 0,
      advantages: 0,
      disadvantages: 1,
    },
    round: 'Final',
    division: 'Kids',
    durationMs: 300000,
    remainingMs: extra?.remainingMs ?? 0,
    running: false,
    startedAt: null,
    startBeep: false,
    warningBeep: false,
    warned: true,
    endBuzzer: false,
    endCue: 'off',
    bracketMatchId: null,
    autoAnnounce: false,
    skin: 'mock-tournament',
    carlos: { enabled: true, onWin: false, onPoints: true, pointsThreshold: 1 },
    outcome: null,
    outcomeFlash: null,
    revision: 4,
  };
}

async function seed(page: Page, storage: Record<string, unknown>) {
  await page.addInitScript((bag) => {
    localStorage.setItem('advantage.proUnlocked', '1');
    for (const [key, value] of Object.entries(bag)) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }, storage);
}

async function faceHits(page: Page) {
  return page.evaluate(() => {
    const face = document.querySelector('.kids-carlos__face');
    if (!(face instanceof HTMLElement)) return { shown: false, tiny: false, hits: [] as string[] };
    const fr = face.getBoundingClientRect();
    if (fr.width < 20 || fr.height < 20) {
      return { shown: true, tiny: true, hits: [`face ${Math.round(fr.width)}x${Math.round(fr.height)}`] };
    }
    const selectors = [
      '.kids-carlos__bubble',
      '.kids-carlos__cheer',
      '.kids-carlos__name',
      '.kids-carlos__score',
      '.score',
      '.score__value',
      '.score__label',
      '.bout__who h1',
      '.bout__who p',
      '.clock-btn',
      '.display__clock-hint',
      '.display__meta',
      '.chip',
      '.display-back',
      '.display-splash__name',
      '.display-splash__line',
      '.kids-banner',
      '.kids-live',
      '.kids-champ-score',
      '.tournament__actions button',
      '.bracket button',
      'input',
    ];
    const hits: string[] = [];
    const seen = new Set<string>();
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.closest('.kids-carlos__portrait')) continue;
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
        const box = node.getBoundingClientRect();
        if (box.width < 2 || box.height < 2) continue;
        const text = (node.innerText || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const ix = Math.min(fr.right, box.right) - Math.max(fr.left, box.left);
        const iy = Math.min(fr.bottom, box.bottom) - Math.max(fr.top, box.top);
        if (ix <= 1 || iy <= 1) continue;
        const label = `${selector}: ${text.slice(0, 48)}`;
        if (seen.has(label)) continue;
        seen.add(label);
        hits.push(label);
      }
    }
    return { shown: true, tiny: false, hits };
  });
}

async function expectFaceClear(page: Page) {
  const report = await faceHits(page);
  expect(report.shown, 'Carlos face marker').toBe(true);
  expect(report.tiny, report.hits.join(' | ')).toBe(false);
  expect(report.hits, report.hits.join(' | ')).toEqual([]);
}

async function openSeeded(browser: Browser, width: number, height: number, storage: Record<string, unknown>) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, storage);
  return { context, page };
}

test('points-scored cheer keeps text off Carlos’s face', async ({ browser }) => {
  const storage = {
    'matboard.match.v1': pointsMatch(4),
    'matboard.kidsScoreboard.v1': { enabled: true, skin: 'dinos', mascot: true },
  };

  for (const viewport of VIEWPORTS) {
    const board = await openSeeded(browser, viewport.width, viewport.height, storage);
    await board.page.goto('/match?from=suite');
    await expect(board.page.locator('.kids-carlos__score')).toHaveText('4');
    await expect(board.page.locator('.kids-carlos__cheer')).toHaveText('Bom trabalho!');
    await expect(board.page.locator('.kids-carlos__name')).toHaveText('Mia Santos');
    await expectFaceClear(board.page);
    await board.context.close();

    const kids = await openSeeded(browser, viewport.width, viewport.height, storage);
    await kids.page.goto('/match?from=suite&kids=dinos');
    await expect(kids.page.locator('.kids-carlos__score')).toHaveText('4');
    await expect(kids.page.locator('.display')).toHaveClass(/kids-board--dinos/);
    await expectFaceClear(kids.page);
    await kids.context.close();
  }
});

test('2-point and 3-point cheers use the same points trigger', async ({ browser }) => {
  for (const points of [2, 3]) {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1920, height: 1080 },
    ]) {
      const opened = await openSeeded(browser, viewport.width, viewport.height, {
        'matboard.match.v1': pointsMatch(points),
      });
      await opened.page.goto('/match?from=suite');
      await expect(opened.page.locator('.kids-carlos__score')).toHaveText(String(points));
      await expectFaceClear(opened.page);
      await opened.context.close();
    }
  }
});

test('advantages and penalties do not bring Carlos out', async ({ browser }) => {
  const opened = await openSeeded(browser, 1280, 800, {
    'matboard.match.v1': pointsMatch(0, { advantages: 4, disadvantages: 3 }),
  });
  await opened.page.goto('/match?from=suite');
  await expect(opened.page.locator('.score--advantages .score__value').first()).toHaveText('4');
  await expect(opened.page.locator('.score--disadvantages .score__value').first()).toHaveText('3');
  await expect(opened.page.locator('.kids-carlos')).toHaveCount(0);
  await opened.context.close();
});

test('points over the threshold stay hidden until the match ends', async ({ browser }) => {
  const opened = await openSeeded(browser, 1280, 800, {
    'matboard.match.v1': pointsMatch(4, { remainingMs: 120000 }),
  });
  await opened.page.goto('/match?from=suite');
  await expect(opened.page.locator('.clock-btn')).toHaveText('02:00');
  await expect(opened.page.locator('.kids-carlos')).toHaveCount(0);
  await opened.context.close();
});

test('post-champion corner keeps text off Carlos’s face', async ({ browser }) => {
  const storage = {
    'matboard.kidsScoreboard.v1': { enabled: true, skin: 'dinos', mascot: true },
    'matboard.match.v1': pointsMatch(0, { remainingMs: 300000 }),
    'matboard.tournament.v1': {
      version: 2,
      activeId: 'bracket-1',
      saved: [
        {
          id: 'bracket-1',
          name: 'Kids Finals',
          updatedAt: 1,
          board: {
            version: 1,
            size: 4,
            placement: 'ibjjf',
            title: 'Kids Finals',
            entries: {
              'sf-0-a': 'Mia Santos',
              'sf-0-b': 'Bea Ortiz',
              'sf-1-a': 'Leo Park',
              'sf-1-b': 'Dee Kim',
              champion: 'Mia Santos',
            },
            results: {
              'sf-0': { winnerSide: 'a', call: 'win', method: 'points' },
              'sf-1': { winnerSide: 'a', call: 'win', method: 'points' },
              'final-0': {
                winnerSide: 'a',
                call: 'win',
                method: 'points',
                points: { winner: 4, loser: 2 },
              },
            },
            lastOutcomeMatchId: 'final-0',
          },
        },
      ],
    },
  };

  for (const viewport of VIEWPORTS) {
    const opened = await openSeeded(browser, viewport.width, viewport.height, storage);
    await opened.page.goto('/tournament?from=suite');
    await expect(opened.page.locator('.kids-carlos--corner .kids-carlos__cheer')).toHaveText('Bom trabalho!');
    await expect(opened.page.locator('.kids-carlos--corner .kids-carlos__name')).toHaveText('Mia Santos');
    await expect(opened.page.locator('.kids-carlos--corner .kids-carlos__score')).toHaveText('4-2');
    await expectFaceClear(opened.page);
    await opened.context.close();
  }
});
