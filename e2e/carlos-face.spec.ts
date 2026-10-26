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

async function bubbleClearOfFace(page: Page) {
  return page.evaluate(() => {
    const face = document.querySelector('.kids-carlos__face');
    const bubble = document.querySelector('.kids-carlos__bubble');
    if (!(face instanceof HTMLElement) || !(bubble instanceof HTMLElement)) {
      return { shown: false, tiny: false, hits: ['missing face or bubble'] };
    }
    const fr = face.getBoundingClientRect();
    const br = bubble.getBoundingClientRect();
    const hits: string[] = [];
    if (fr.width < 20 || fr.height < 20) hits.push(`face ${Math.round(fr.width)}x${Math.round(fr.height)}`);
    const ix = Math.min(fr.right, br.right) - Math.max(fr.left, br.left);
    const iy = Math.min(fr.bottom, br.bottom) - Math.max(fr.top, br.top);
    if (ix > 1 && iy > 1) hits.push(`bubble overlaps face by ${Math.round(ix)}x${Math.round(iy)}`);
    const view = { w: window.innerWidth, h: window.innerHeight };
    if (br.left < -1 || br.top < -1 || br.right > view.w + 1 || br.bottom > view.h + 1) {
      hits.push(
        `bubble off screen ${Math.round(br.left)},${Math.round(br.top)} ${Math.round(br.right)}x${Math.round(br.bottom)} in ${view.w}x${view.h}`,
      );
    }
    return { shown: true, tiny: fr.width < 20 || fr.height < 20, hits };
  });
}

async function expectBubbleClear(page: Page) {
  const report = await bubbleClearOfFace(page);
  expect(report.shown, 'Carlos face and bubble').toBe(true);
  expect(report.hits, report.hits.join(' | ')).toEqual([]);
}

async function expectFullscreenClear(page: Page) {
  const hits = await page.evaluate(() => {
    const button = document.querySelector('.play-fs');
    if (!(button instanceof HTMLElement)) return [] as string[];
    const fr = button.getBoundingClientRect();
    if (fr.width < 2 || fr.height < 2) return [] as string[];
    const hits: string[] = [];
    for (const node of document.querySelectorAll('.score, .score__label, .score__value')) {
      if (!(node instanceof HTMLElement)) continue;
      const box = node.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      const ix = Math.min(fr.right, box.right) - Math.max(fr.left, box.left);
      const iy = Math.min(fr.bottom, box.bottom) - Math.max(fr.top, box.top);
      if (ix <= 1 || iy <= 1) continue;
      const text = (node.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 32);
      hits.push(`${text || node.className} ${Math.round(ix)}x${Math.round(iy)}`);
    }
    return hits;
  });
  expect(hits, hits.join(' | ')).toEqual([]);
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
    await expectBubbleClear(board.page);
    await expectFullscreenClear(board.page);
    await board.context.close();

    const kids = await openSeeded(browser, viewport.width, viewport.height, storage);
    await kids.page.goto('/match?from=suite&kids=dinos');
    await expect(kids.page.locator('.kids-carlos__score')).toHaveText('4');
    await expect(kids.page.locator('.display')).toHaveClass(/kids-board--dinos/);
    await expectBubbleClear(kids.page);
    await expectFullscreenClear(kids.page);
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
      await expectBubbleClear(opened.page);
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
    await expectBubbleClear(opened.page);
    await opened.context.close();
  }
});
