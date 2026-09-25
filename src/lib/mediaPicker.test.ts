import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  emptyChangeWasCancel,
  isImageAccept,
  isVideoAccept,
  openDeviceMediaPicker,
  PHOTO_CAPTURE_LABEL,
  PHOTO_PICKER_ACCEPT,
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

  it('Record accept is video only so Chrome honors capture and opens the camera', () => {
    assert.equal(VIDEO_RECORD_ACCEPT, 'video/*');
    assert.equal(VIDEO_RECORD_ACCEPT, VIDEO_PICKER_ACCEPT);
    assert.doesNotMatch(VIDEO_RECORD_ACCEPT, /image/);
    assert.doesNotMatch(VIDEO_RECORD_ACCEPT, /,/);
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

describe('photo device picker accept', () => {
  it('Take photo and Pick from gallery share image/*; capture is only on Take photo', () => {
    assert.equal(PHOTO_PICKER_ACCEPT, 'image/*');
    assert.equal(PHOTO_CAPTURE_LABEL, 'Take photo');
    assert.equal(VIDEO_LIBRARY_LABEL, 'Pick from gallery');
    assert.equal(VIDEO_CAPTURE, 'environment');
  });

  it('treats image accept tokens as photos, not videos', () => {
    assert.equal(isImageAccept(PHOTO_PICKER_ACCEPT), true);
    assert.equal(isImageAccept('image/jpeg'), true);
    assert.equal(isImageAccept(VIDEO_PICKER_ACCEPT), false);
    assert.equal(isImageAccept(VIDEO_RECORD_ACCEPT), false);
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

  it('Record sets capture=environment then clicks', () => {
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

  it('defaults to library (no capture) when mode is omitted', () => {
    const { input, calls } = fakeInput();

    openDeviceMediaPicker(input, { accept: PHOTO_PICKER_ACCEPT });

    assert.equal(input.accept, 'image/*');
    assert.deepEqual(calls, ['remove:capture', 'click']);
  });

  it('no-ops when the input is missing', () => {
    assert.doesNotThrow(() =>
      openDeviceMediaPicker(null, { accept: VIDEO_PICKER_ACCEPT, mode: 'record' }),
    );
  });
});

describe('empty picker versus cancel', () => {
  it('treats a cancel just before or just after an empty change as a dismiss', () => {
    const changeAt = 1_000;
    assert.equal(emptyChangeWasCancel(0, changeAt, changeAt + 80), false);
    assert.equal(emptyChangeWasCancel(changeAt - 40, changeAt, changeAt + 80), true);
    assert.equal(emptyChangeWasCancel(changeAt + 30, changeAt, changeAt + 80), true);
    assert.equal(emptyChangeWasCancel(changeAt - 500, changeAt, changeAt + 80), false);
  });
});
