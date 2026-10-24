import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

const YELLOW_FILL =
  /var\(--logo-yellow\)|var\(--gold-2\)|var\(--gold\)|#fcc000|#f6c000|#eeb63a|#d4a017|#f0c24b/i;

/** Destructive confirms may keep a filled yellow. Everything else that is a primary button may not. */
const DESTRUCTIVE = [
  /\.btn--danger\b/,
  /\.tree__confirm\b/,
  /\.notes__confirm\[aria-label\^=['"]Remove['"]\]/,
  /\.roster-card__confirm\b/,
  /\.invite-confirm\b/,
  /\.schedule-edit__confirm\b/,
  /\.white-roster__actions button\[type=['"]button['"]\]/,
  /\.drive-session-confirm\b/,
];

type Rule = { file: string; selector: string; body: string };

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith('.css') || name.endsWith('.tsx') || name.endsWith('.ts')) out.push(path);
  }
  return out;
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function rulesIn(css: string, file: string): Rule[] {
  const out: Rule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const selector = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') depth -= 1;
      j += 1;
    }
    const body = css.slice(open + 1, j - 1);
    if (selector.startsWith('@')) out.push(...rulesIn(body, file));
    else if (selector) out.push({ file, selector, body });
    i = j;
  }
  return out;
}

function splitSelectors(selector: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of selector) {
    if (ch === '(' || ch === '[') depth += 1;
    else if ((ch === ')' || ch === ']') && depth > 0) depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function filledYellowBackground(body: string): boolean {
  return body.split(';').some((decl) => {
    const colon = decl.indexOf(':');
    if (colon < 0) return false;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    if (prop !== 'background' && prop !== 'background-color') return false;
    return YELLOW_FILL.test(decl.slice(colon + 1));
  });
}

function isPrimaryButton(selector: string): boolean {
  if (/(?<![\w-])\.btn(?!-)/.test(selector)) return true;
  if (/\.ink-btn--(?:save|keep)\b/.test(selector)) return true;
  if (/\.(?:sf-buy|store-hero__buy|chip--gold|pad-call--win|bout-call--win)\b/.test(selector)) return true;
  if (/\.home__unlock-form\b/.test(selector)) return true;
  if (/\.drive-connect__/.test(selector)) return true;
  if (/\.drive-handoff\b/.test(selector)) return true;
  if (/\.drive-picker-sheet\b/.test(selector)) return true;
  if (/a\.btn\[target=/.test(selector)) return true;
  return false;
}

function isDestructiveConfirm(selector: string): boolean {
  return DESTRUCTIVE.some((pattern) => pattern.test(selector));
}

test('a filled yellow background is not applied to a primary button', () => {
  const files = walk(SRC);
  const cssRules = files
    .filter((file) => file.endsWith('.css'))
    .flatMap((file) => rulesIn(stripComments(readFileSync(file, 'utf8')), relative(SRC, file)));
  const offenders = cssRules.flatMap((rule) => {
    if (!filledYellowBackground(rule.body)) return [];
    return splitSelectors(rule.selector)
      .filter((selector) => isPrimaryButton(selector) && !isDestructiveConfirm(selector))
      .map((selector) => `${rule.file}: ${selector}`);
  });
  assert.deepEqual(offenders, []);

  const inline = files
    .filter((file) => file.endsWith('.tsx') || file.endsWith('.ts'))
    .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
    .flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return /style=\{\{[^}]*background[^}]*(?:logo-yellow|#fcc000|#f6c000|#eeb63a|#d4a017|#f0c24b)/i.test(text)
        ? [relative(SRC, file)]
        : [];
    });
  assert.deepEqual(inline, []);
});

test('destructive confirms still use the yellow fill', () => {
  const css = stripComments(readFileSync(join(SRC, 'index.css'), 'utf8'));
  const student = stripComments(readFileSync(join(SRC, 'student-edition.css'), 'utf8'));
  const yellowSelectors = rulesIn(css, 'index.css')
    .filter((rule) => filledYellowBackground(rule.body))
    .flatMap((rule) => splitSelectors(rule.selector));
  for (const pattern of DESTRUCTIVE) {
    assert.equal(
      yellowSelectors.some((selector) => pattern.test(selector)),
      true,
      `missing yellow destructive confirm ${pattern}`,
    );
  }
  assert.match(student, /\.drive-session-confirm \.ink-btn--save\.ink-btn--keep[\s\S]*background:\s*var\(--logo-yellow\)/);
  assert.doesNotMatch(student, /\.ink-btn--save\.ink-btn--keep \{[^}]*background:\s*var\(--logo-yellow\)/);
});
