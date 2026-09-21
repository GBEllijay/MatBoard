import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { openDeviceMediaPicker, VIDEO_PICKER_ACCEPT } from './mediaPicker.ts';

describe('video device picker accept', () => {
  it('uses video/* so phones can offer camera, not a documents-only list', () => {
    assert.equal(VIDEO_PICKER_ACCEPT, 'video/*');
    assert.doesNotMatch(VIDEO_PICKER_ACCEPT, /\.mp4|\.mov|\.webm/);
  });
});

describe('openDeviceMediaPicker', () => {
  it('sets accept, clears capture, and clicks so the OS can offer camera or library', () => {
    const calls: string[] = [];
    const input = {
      accept: 'image/*',
      click() {
        calls.push('click');
      },
      removeAttribute(name: string) {
        calls.push(`remove:${name}`);
      },
    } as unknown as HTMLInputElement;

    openDeviceMediaPicker(input, { accept: VIDEO_PICKER_ACCEPT });

    assert.equal(input.accept, 'video/*');
    assert.deepEqual(calls, ['remove:capture', 'click']);
  });

  it('no-ops when the input is missing', () => {
    assert.doesNotThrow(() => openDeviceMediaPicker(null, { accept: VIDEO_PICKER_ACCEPT }));
  });
});
