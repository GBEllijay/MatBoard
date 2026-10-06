import assert from 'node:assert/strict';
import test from 'node:test';
import { ICLOUD_SIGN_IN_FAILED } from '../lib/iCloud.ts';
import { icloudCallbackHtml, icloudCallbackResponse } from './icloudCallback.ts';

const token = `web.${'D'.repeat(40)}`;

test('the Apple callback keeps the web auth token in the browser and rejects markup', async () => {
  const html = icloudCallbackHtml({ token, failure: null });
  assert.match(html, /sessionStorage\.setItem/);
  assert.match(html, /matboard\.icloud\.webAuthToken/);
  assert.match(html, /location\.replace/);
  assert.doesNotMatch(html, /<script>alert/);

  const evil = await icloudCallbackResponse(
    new Request('https://advantagebjjtimer.com/api/icloud/callback?ckWebAuthToken=%3Cscript%3Ealert(1)%3C/script%3E&error=%3Cimg%3E'),
  );
  assert.equal(evil.status, 200);
  assert.equal(evil.headers.get('cache-control'), 'no-store');
  assert.match(evil.headers.get('content-security-policy') ?? '', /default-src 'none'/);
  const body = await evil.text();
  assert.doesNotMatch(body, /<script>alert|ckAPIToken|<img>/);
  assert.match(body, new RegExp(ICLOUD_SIGN_IN_FAILED.replace(/[.]/g, '\\.')));

  const ok = await icloudCallbackResponse(
    new Request(`https://advantagebjjtimer.com/api/icloud/callback?ckWebAuthToken=${encodeURIComponent(token)}`),
  );
  const okBody = await ok.text();
  assert.match(okBody, new RegExp(token));
  assert.match(okBody, /safeReturn/);
  assert.equal(ok.headers.get('referrer-policy'), 'no-referrer');
});
