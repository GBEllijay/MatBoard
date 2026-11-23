import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hideWebCheckout,
  isNativeWhiteApp,
  nativeTimerAllowed,
  nativeWhiteHomePath,
  readAppTarget,
} from './appTarget.ts';

test('an unset or unknown VITE_APP_TARGET stays on the website', () => {
  assert.equal(readAppTarget(undefined), 'web');
  assert.equal(readAppTarget(''), 'web');
  assert.equal(readAppTarget('web'), 'web');
  assert.equal(readAppTarget('production'), 'web');
  assert.equal(isNativeWhiteApp('web'), false);
  assert.equal(hideWebCheckout('web'), false);
  assert.equal(nativeTimerAllowed('web'), false);
  assert.equal(nativeWhiteHomePath('web'), '/');
});

test('VITE_APP_TARGET=white selects the native White app', () => {
  assert.equal(readAppTarget('white'), 'white');
  assert.equal(isNativeWhiteApp('white'), true);
  assert.equal(hideWebCheckout('white'), true);
  assert.equal(nativeTimerAllowed('white'), true);
  assert.equal(nativeWhiteHomePath('white'), '/white');
});

test('the default export follows the build flag, which is unset in unit tests', () => {
  assert.equal(readAppTarget(), 'web');
  assert.equal(isNativeWhiteApp(), false);
});
