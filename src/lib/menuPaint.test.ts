import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync('src/index.css', 'utf8');
const mediaCss = readFileSync('src/pages/mediaEdition.css', 'utf8');
const rankPage = readFileSync('src/pages/student/RankPage.tsx', 'utf8');

function channel(hex: string, index: number): number {
  const value = parseInt(hex.slice(index, index + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrast(foreground: string, background: string): number {
  const lum = (hex: string) => {
    const body = hex.slice(1);
    return 0.2126 * channel(body, 0) + 0.7152 * channel(body, 2) + 0.0722 * channel(body, 4);
  };
  const lighter = Math.max(lum(foreground), lum(background));
  const darker = Math.min(lum(foreground), lum(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test('hub menu buttons use a matte navy fill and keep the shared white primary', () => {
  const start = css.indexOf('Menu paint for the plain white hub buttons');
  const paint = css.slice(start, css.indexOf('.rankings__rows', start));
  assert.match(paint, /\.pro-hub,\s*\n\.competitor-hub__header/);
  assert.match(paint, /background:\s*#0c2344/);
  assert.match(paint, /border:\s*1\.5px solid #004eba/);
  assert.match(paint, /color:\s*#f5f1e8/);
  assert.doesNotMatch(paint, /linear-gradient|radial-gradient/);
  assert.match(paint, /button\.btn:not\(\.btn--ghost\):not\(:disabled\)/);
  assert.match(css, /\.btn \{\s*background:\s*var\(--cta-bg\)/);
  assert.match(css, /\.home--ladder \.mode-card__actions \.btn--white \{\s*background:\s*var\(--cta-bg\)/);
  assert.match(mediaCss, /\.home--media-hub \.pro-hub__sub \{[^}]*color:\s*#d7e6ff/);
});

test('menu ink stays readable on the navy fill and focus stays visible', () => {
  assert.ok(contrast('#f5f1e8', '#0c2344') >= 7);
  assert.ok(contrast('#d7e6ff', '#0c2344') >= 7);
  assert.ok(contrast('#6ea8ff', '#12243a') >= 4.5);
  assert.match(css, /\.pro-hub:focus-visible,\s*\n\.competitor-hub__link:focus-visible[\s\S]*outline:\s*3px solid #6ea8ff/);
});

test('this paint does not move into RankPage or drop belt rails from the hub menus', () => {
  assert.doesNotMatch(rankPage, /#0c2344|menu paint|pro-hub/);
  for (const file of [
    'src/pages/Coach.tsx',
    'src/pages/CoachingTools.tsx',
    'src/pages/CompetitionManagement.tsx',
    'src/components/SuiteMenuLinks.tsx',
    'src/components/ProToolboxCard.tsx',
    'src/pages/CompetitorManagement.tsx',
    'src/pages/ComingSoon.tsx',
  ]) {
    assert.match(readFileSync(file, 'utf8'), /BeltRail/);
  }
  assert.match(readFileSync('src/pages/ComingSoon.tsx', 'utf8'), /btn btn--ghost/);
});
