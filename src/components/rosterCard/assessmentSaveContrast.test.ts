/**
 * Save assessment sits on the white Advantage .btn. .clipboard button { color: inherit }
 * is more specific, so the label was the clipboard's near-white ink.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';

const clipboardCss = readFileSync('src/components/rosterCard/coachClipboard.css', 'utf8');
const indexCss = readFileSync('src/index.css', 'utf8');
const sheet = readFileSync('src/components/rosterCard/RosterCardSheet.tsx', 'utf8');

function channel(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const linear = channel(hex).map((value) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(ink: string, fill: string): number {
  const a = luminance(ink);
  const b = luminance(fill);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function hexOf(color: string): string {
  const text = color.trim().toLowerCase();
  if (text.startsWith('#')) {
    if (text.length === 4) return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
    return text;
  }
  const match = text.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  assert.ok(match, `unparsed color ${JSON.stringify(color)}`);
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
}

function paint(markup: string, mutate?: (button: HTMLButtonElement) => void): CSSStyleDeclaration {
  const dom = new Window({ url: 'http://localhost/roster' });
  const style = dom.document.createElement('style');
  style.textContent = `${indexCss}\n${clipboardCss}`;
  dom.document.head.appendChild(style);
  dom.document.body.innerHTML = markup;
  const button = dom.document.querySelector('button') as HTMLButtonElement;
  mutate?.(button);
  return dom.window.getComputedStyle(button);
}

test('Save assessment uses the Advantage CTA ink, not the clipboard ink', () => {
  assert.match(sheet, /className="clipboard clipboard--form"/);
  assert.match(sheet, /<button type="submit" className="btn">\s*Save assessment/);
  assert.match(clipboardCss, /\.clipboard button \{\s*font: inherit;\s*color: inherit;/);
  assert.match(indexCss, /--cta-bg:\s*#fff;/);
  assert.match(indexCss, /--cta-ink:\s*#0e1726;/);
  assert.match(clipboardCss, /--cb-ink:\s*#eef2f8;/);
  assert.ok(contrast('#eef2f8', '#ffffff') < 1.5, 'the inherited ink is the bug');
  assert.ok(contrast('#0e1726', '#ffffff') >= 7, 'CTA ink on the white button');
  assert.ok(contrast('#0e1726', '#f4f7fb') >= 7, 'hover fill');
  assert.ok(contrast('#334155', '#e4ebf4') >= 4.5, 'disabled ink');

  assert.match(
    clipboardCss,
    /\.clipboard button\.btn:not\(\.btn--ghost\):not\(\.btn--blue\):not\(\.btn--danger\):not\(:disabled\) \{[^}]*color:\s*var\(--cta-ink\);[^}]*-webkit-text-fill-color:\s*var\(--cta-ink\);/,
  );
  const enabled = paint('<form class="clipboard clipboard--form"><button class="btn" type="submit">Save assessment</button></form>');
  assert.equal(hexOf(enabled.color), '#0e1726');
  assert.equal(hexOf(enabled.backgroundColor), '#ffffff');

  for (const look of ['clipboard', 'fighter'] as const) {
    for (const skin of ['dark', 'light'] as const) {
      const painted = paint(
        `<form class="clipboard clipboard--form" data-style="${look}" data-skin="${skin}"><button class="btn" type="submit">Save assessment</button></form>`,
      );
      assert.equal(hexOf(painted.color), '#0e1726', `${look} ${skin}`);
      assert.equal(hexOf(painted.backgroundColor), '#ffffff', `${look} ${skin}`);
    }
  }

  const disabled = paint(
    '<form class="clipboard clipboard--form"><button class="btn" type="submit" disabled>Save assessment</button></form>',
  );
  assert.equal(hexOf(disabled.color), '#334155');
  assert.equal(hexOf(disabled.backgroundColor), '#e4ebf4');

  const focused = paint('<form class="clipboard clipboard--form"><button class="btn" type="submit">Save assessment</button></form>', (button) => {
    button.focus();
  });
  assert.equal(hexOf(focused.color), '#0e1726');
  assert.match(indexCss, /\.btn:focus-visible[\s\S]*?outline:\s*3px solid var\(--cta-focus\)/);
});
