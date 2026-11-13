/**
 * Rights checkbox appears only after a file is picked. Use stays disabled until it is checked.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IMAGE_RIGHTS_LABEL } from '../lib/imageRights.ts';
import { ImageRightsConfirm, useImageRightsConfirm } from './ImageRightsConfirm.tsx';

const dom = new Window({ url: 'http://localhost/student/profile?student=1', width: 390, height: 844 });
const view = dom as unknown as Window & typeof globalThis;

function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('HTMLInputElement', view.HTMLInputElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('Event', view.Event);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:image-rights-preview';
  URL.revokeObjectURL = () => {};
}

function reactProps(node: Element): Record<string, (event: unknown) => void> | null {
  const key = Object.keys(node).find((name) => name.startsWith('__reactProps'));
  return key ? (node as unknown as Record<string, Record<string, (event: unknown) => void>>)[key] : null;
}

function Harness() {
  const rights = useImageRightsConfirm();
  const [saved, setSaved] = useState('');
  return (
    <div>
      <input
        id="logo-pick"
        type="file"
        aria-label="Upload a gym logo"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (!file) return;
          rights.request(file, (chosen) => setSaved(chosen.name));
        }}
      />
      <p data-testid="saved">{saved || 'none'}</p>
      <ImageRightsConfirm
        pending={rights.pending}
        preview={rights.preview}
        owned={rights.owned}
        onOwnedChange={rights.setOwned}
        onCancel={rights.cancel}
        onUse={rights.confirm}
      />
    </div>
  );
}

function mount(): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<Harness /> as ReactNode);
  });
  return { root, host };
}

test('report and idle profile sources do not embed the rights checkbox copy', () => {
  const report = readFileSync('src/pages/student/PrintReportPage.tsx', 'utf8');
  const profileReport = readFileSync('src/pages/student/ProfileReport.tsx', 'utf8');
  const identity = readFileSync('src/pages/student/ProfileIdentity.tsx', 'utf8');
  const gymSheet = readFileSync('src/components/GymCharacterSheet.tsx', 'utf8');
  assert.doesNotMatch(report, /I own the rights/);
  assert.doesNotMatch(profileReport, /I own the rights/);
  assert.doesNotMatch(identity, /I own the rights/);
  assert.doesNotMatch(gymSheet, /I own the rights/);
  assert.match(identity, /useImageRightsConfirm/);
  assert.match(gymSheet, /useImageRightsConfirm/);
  assert.match(IMAGE_RIGHTS_LABEL, /I own the rights to this image or have permission to use it/);
});

test('the checkbox is hidden until a file is picked, and Use stays disabled until it is checked', async () => {
  const page = mount();
  try {
    assert.equal(document.querySelector('[data-testid="image-rights-confirm"]'), null);
    assert.equal(page.host.textContent?.includes('I own the rights'), false);

    const input = page.host.querySelector('#logo-pick') as HTMLInputElement;
    const file = new File(['crest'], 'crest.png', { type: 'image/png' });
    await act(async () => {
      const target = { files: [file], value: file.name };
      reactProps(input)?.onChange?.({ target, currentTarget: target });
    });

    const confirm = document.querySelector('[data-testid="image-rights-confirm"]');
    assert.ok(confirm);
    assert.match(confirm?.textContent ?? '', /I own the rights to this image or have permission to use it/);
    const use = document.querySelector('[data-testid="image-rights-use"]') as HTMLButtonElement;
    const box = document.querySelector('[data-testid="image-rights-owned"]') as HTMLInputElement;
    assert.equal(use.disabled, true);
    assert.equal(page.host.querySelector('[data-testid="saved"]')?.textContent, 'none');

    await act(async () => {
      use.click();
    });
    assert.equal(page.host.querySelector('[data-testid="saved"]')?.textContent, 'none');
    assert.ok(document.querySelector('[data-testid="image-rights-confirm"]'));

    await act(async () => {
      box.click();
      reactProps(box)?.onChange?.({ target: { checked: true } });
    });
    assert.equal(box.checked, true);
    assert.equal(use.disabled, false);

    await act(async () => {
      use.click();
    });
    assert.equal(document.querySelector('[data-testid="image-rights-confirm"]'), null);
    assert.equal(page.host.querySelector('[data-testid="saved"]')?.textContent, 'crest.png');
  } finally {
    act(() => page.root.unmount());
    page.host.remove();
  }
});
