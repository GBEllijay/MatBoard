import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isVideoAccept,
  openDeviceMediaPicker,
  VIDEO_CAPTURE,
  VIDEO_LIBRARY_LABEL,
  VIDEO_PICKER_ACCEPT,
  VIDEO_RECORD_ACCEPT,
  VIDEO_RECORD_LABEL,
} from './mediaPicker.ts';

describe('video device picker accept', () => {
  it('uses video/* for gallery picks so the OS photo/files picker stays available', () => {
    assert.equal(VIDEO_PICKER_ACCEPT, 'video/*');
    assert.doesNotMatch(VIDEO_PICKER_ACCEPT, /\.mp4|\.mov|\.webm/);
  });

  it('Record accept prefers video and allows image so Camera can still open', () => {
    assert.equal(VIDEO_RECORD_ACCEPT, 'video/*,image/*');
    assert.match(VIDEO_RECORD_ACCEPT, /video\/\*/);
    assert.match(VIDEO_RECORD_ACCEPT, /image\/\*/);
    assert.equal(VIDEO_CAPTURE, 'environment');
    assert.equal(VIDEO_LIBRARY_LABEL, 'Pick from gallery');
    assert.equal(VIDEO_RECORD_LABEL, 'Record');
  });

  it('treats video accept tokens as video', () => {
    assert.equal(isVideoAccept('video/*'), true);
    assert.equal(isVideoAccept('video/mp4'), true);
    assert.equal(isVideoAccept(VIDEO_RECORD_ACCEPT), true);
    assert.equal(isVideoAccept('image/*'), false);
  });
});

describe('openDeviceMediaPicker', () => {
  function fakeInput() {
    const attrs: Record<string, string> = {};
    const calls: string[] = [];
    const input = {
      accept: 'image/*',
      click() {
        calls.push('click');
      },
      setAttribute(name: string, value: string) {
        attrs[name] = value;
        calls.push(`set:${name}=${value}`);
      },
      removeAttribute(name: string) {
        delete attrs[name];
        calls.push(`remove:${name}`);
      },
    } as unknown as HTMLInputElement;
    return { input, calls, attrs };
  }

  it('Record sets capture=environment then clicks (photo Add still uses this helper)', () => {
    const { input, calls, attrs } = fakeInput();

    openDeviceMediaPicker(input, { accept: VIDEO_PICKER_ACCEPT, mode: 'record' });

    assert.equal(input.accept, 'video/*');
    assert.equal(attrs.capture, VIDEO_CAPTURE);
    assert.deepEqual(calls, ['set:capture=environment', 'click']);
  });

  it('library clears capture and clicks so the OS photo/files picker stays available', () => {
    const { input, calls } = fakeInput();

    openDeviceMediaPicker(input, { accept: VIDEO_PICKER_ACCEPT, mode: 'library' });

    assert.equal(input.accept, 'video/*');
    assert.deepEqual(calls, ['remove:capture', 'click']);
  });

  it('defaults to library (no capture) for photo Add and other non-record taps', () => {
    const { input, calls } = fakeInput();

    openDeviceMediaPicker(input, { accept: 'image/*' });

    assert.equal(input.accept, 'image/*');
    assert.deepEqual(calls, ['remove:capture', 'click']);
  });

  it('no-ops when the input is missing', () => {
    assert.doesNotThrow(() =>
      openDeviceMediaPicker(null, { accept: VIDEO_PICKER_ACCEPT, mode: 'record' }),
    );
  });
});
