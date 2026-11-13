/**
 * Every logo upload point in the app goes through the same rights gate:
 * the checkbox appears only after a file is picked, Use stays disabled until it is checked,
 * and nothing is saved before Use. A new logo writer outside the known lists fails here.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { IMAGE_RIGHTS_LABEL, LOGO_SYNC_WRITERS, LOGO_UPLOAD_SURFACES } from '../lib/imageRights.ts';

const dom = new Window({ url: 'http://localhost/', width: 390, height: 844 });
const view = dom as unknown as Window & typeof globalThis;

function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('localStorage', view.localStorage);
installGlobal('sessionStorage', view.sessionStorage);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('HTMLInputElement', view.HTMLInputElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('Event', view.Event);
installGlobal('CustomEvent', view.CustomEvent);
installGlobal('navigator', view.navigator);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:image-rights-preview';
  URL.revokeObjectURL = () => {};
}

const TINY_PNG = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
);

function reactProps(node: Element): Record<string, (event: unknown) => void> | null {
  const key = Object.keys(node).find((name) => name.startsWith('__reactProps'));
  return key ? (node as unknown as Record<string, Record<string, (event: unknown) => void>>)[key] : null;
}

async function mount(node: ReactNode): Promise<{ root: Root; host: HTMLElement; unmount: () => Promise<void> }> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<MemoryRouter>{node}</MemoryRouter>);
  });
  return {
    root,
    host,
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

async function pick(input: HTMLInputElement | null, file: File) {
  assert.ok(input, 'expected a logo file input');
  const props = reactProps(input);
  await act(async () => {
    const target = { files: [file], value: file.name };
    props?.onChange?.({ target, currentTarget: target });
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

const confirmSheet = () => document.querySelector('[data-testid="image-rights-confirm"]');
const rightsBox = () => document.querySelector('[data-testid="image-rights-owned"]') as HTMLInputElement | null;
const rightsUse = () => document.querySelector('[data-testid="image-rights-use"]') as HTMLButtonElement | null;

async function checkAndUse() {
  const box = rightsBox();
  assert.ok(box);
  await act(async () => {
    box.click();
    reactProps(box)?.onChange?.({ target: { checked: true } });
  });
  assert.equal(rightsUse()?.disabled, false);
  await act(async () => {
    rightsUse()?.click();
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

async function cancelGate() {
  await act(async () => {
    const cancel = [...document.querySelectorAll('.sheet--image-rights button')].find((n) => n.textContent === 'Cancel') as
      | HTMLButtonElement
      | undefined;
    cancel?.click();
  });
}

/** Assert the shared gate is up with the shared copy, and Use is blocked. */
function assertGateBlocks() {
  const sheet = confirmSheet();
  assert.ok(sheet, 'rights sheet should open after a logo is picked');
  assert.match(sheet?.textContent ?? '', new RegExp(IMAGE_RIGHTS_LABEL));
  assert.equal(rightsBox()?.checked, false);
  assert.equal(rightsUse()?.disabled, true, 'Use must stay disabled until the box is checked');
}

const pngFile = () => new File([TINY_PNG], 'crest.png', { type: 'image/png' });

// ---------------------------------------------------------------- inventory guard

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const LOGO_WRITER = /\b(saveGymLogoFile|writeGymLogo|setLogoBlob|saveStudentGymLogoFile|writeStudentGymLogo)\(/;
const DEFINITIONS = new Set(['src/lib/gymLogo.ts', 'src/lib/studentGymMark.ts', 'src/lib/scheduleStore.ts']);

test('every module that saves a logo is either a gated upload surface or a known sync path', () => {
  const gated = new Set<string>(LOGO_UPLOAD_SURFACES.map((s) => s.file));
  const synced = new Set<string>(LOGO_SYNC_WRITERS.map((s) => s.file));
  const writers = walk('src')
    .map((p) => p.replace(/\\/g, '/'))
    .filter((p) => !DEFINITIONS.has(p) && LOGO_WRITER.test(readFileSync(p, 'utf8')));
  for (const file of writers) {
    assert.ok(gated.has(file) || synced.has(file), `${file} saves a logo but is not in LOGO_UPLOAD_SURFACES or LOGO_SYNC_WRITERS`);
  }
  for (const file of [...gated, ...synced]) assert.ok(writers.includes(file), `${file} is listed but no longer saves a logo`);
  for (const file of gated) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /useImageRightsConfirm\(\)/, `${file} must use the shared rights hook`);
    assert.match(src, /<ImageRightsGate rights=\{rights\} \/>/, `${file} must render the shared ImageRightsGate`);
    assert.equal(src.includes(IMAGE_RIGHTS_LABEL), false, `${file} must not copy the checkbox wording`);
  }
});

test('custom skin uploads stay full-screen backgrounds, not logo uploads', () => {
  const src = readFileSync('src/hooks/useCustomSkinSection.tsx', 'utf8');
  assert.equal(/logo/i.test(src), false);
});

// ---------------------------------------------------------------- per-surface

test('Media Console gym logo: Use stays off until the rights box is checked, then the logo saves', async () => {
  const { GymLogoControl } = await import('./GymLogoControl.tsx');
  const { clearGymLogo, readGymLogo } = await import('../lib/gymLogo.ts');
  localStorage.clear();
  clearGymLogo();
  const view = await mount(<GymLogoControl />);
  assert.equal(confirmSheet(), null);
  await pick(document.getElementById('gym-logo-library') as HTMLInputElement, pngFile());
  assertGateBlocks();
  assert.equal(readGymLogo(), null);
  await cancelGate();
  assert.equal(confirmSheet(), null);
  assert.equal(readGymLogo(), null, 'Cancel saves nothing');
  await pick(document.getElementById('gym-logo-library') as HTMLInputElement, pngFile());
  await checkAndUse();
  assert.match(readGymLogo() ?? '', /^data:image\/png;base64,/);
  await view.unmount();
  clearGymLogo();
});

test('Round timer Background & logo: gym logo upload is gated, background picture is not', async () => {
  const { applyOwnerTestGrant, clearOwnerTestGrant } = await import('../lib/ownerTestGrant.ts');
  const { TimerBackdropOptions } = await import('./TimerBackdropOptions.tsx');
  const { clearGymLogo, readGymLogo } = await import('../lib/gymLogo.ts');
  localStorage.clear();
  clearGymLogo();
  assert.equal(applyOwnerTestGrant({ grants: ['media'], expiresAt: '2099-01-01T00:00:00.000Z', tier: 'media' }), true);
  const view = await mount(<TimerBackdropOptions />);
  await pick(document.getElementById('timer-bg-library') as HTMLInputElement, new File([TINY_PNG], 'mat.png', { type: 'image/png' }));
  assert.equal(confirmSheet(), null, 'the timer background picture is not a logo and is not gated');
  await pick(document.getElementById('timer-logo-library') as HTMLInputElement, pngFile());
  assertGateBlocks();
  assert.equal(readGymLogo(), null);
  await checkAndUse();
  assert.match(readGymLogo() ?? '', /^data:image\/png;base64,/);
  await view.unmount();
  clearOwnerTestGrant();
  clearGymLogo();
});

test('Class board logo in Edit class schedule: Use stays off until the rights box is checked', async () => {
  const schedule = await import('../lib/scheduleStore.ts');
  const { ScheduleEditor } = await import('../pages/Schedule.tsx');
  localStorage.clear();
  const view = await mount(
    <ScheduleEditor open onClose={() => {}} logoUrl="" qrImageUrl="" qrBuilt="" qrNote="" />,
  );
  const logoInput = [...document.querySelectorAll('input[type="file"][accept="image/*"]')][0] as HTMLInputElement;
  await pick(logoInput, pngFile());
  assertGateBlocks();
  assert.equal(schedule.getScheduleAssets().logo, null);
  await cancelGate();
  assert.equal(confirmSheet(), null);
  await view.unmount();
});
