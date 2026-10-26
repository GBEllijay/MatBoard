import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadGymLogoFile } from './googleDrive.ts';
import { saveGymLogoToDrive } from './gymLogoDrive.ts';

test('saving the gym logo does nothing when Drive is not connected', async () => {
  let uploads = 0;
  const status = await saveGymLogoToDrive('data:image/png;base64,AAAA', {
    folderId: () => null,
    token: async () => 'token',
    upload: async () => {
      uploads += 1;
    },
  });
  assert.equal(status, 'needs-drive');
  assert.equal(uploads, 0);
});

test('saving the gym logo sends that logo to the connected folder', async () => {
  let seen: { folderId: string; size: number } | null = null;
  const status = await saveGymLogoToDrive('data:image/png;base64,AAAA', {
    folderId: () => 'folder-1',
    token: async () => 'token',
    upload: async ({ folderId, blob }) => {
      seen = { folderId, size: blob.size };
    },
  });
  assert.equal(status, 'saved');
  assert.equal(seen?.folderId, 'folder-1');
  assert.ok((seen?.size ?? 0) > 0);
});

test('the gym logo upload reuses the connected folder and does not call a new sign-in host', async () => {
  const calls: string[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    calls.push(`${init?.method ?? 'GET'} ${href}`);
    if (href.includes('uploadType=resumable')) {
      const body = JSON.parse(String(init?.body)) as { parents?: string[]; appProperties?: { advantage?: string } };
      assert.deepEqual(body.parents, ['folder-9']);
      assert.equal(body.appProperties?.advantage, 'gym-logo');
      return new Response('{}', { status: 200, headers: { Location: 'https://upload.example/session' } });
    }
    if (href.includes('/drive/v3/files?')) {
      return new Response(JSON.stringify({ files: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (href === 'https://upload.example/session') {
      return new Response(JSON.stringify({ id: 'logo-file' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(href);
  }) as typeof fetch;
  const saved = await uploadGymLogoFile({
    token: 'token',
    folderId: 'folder-9',
    bytes: new Blob(['logo']),
    mime: 'image/png',
    fetcher,
  });
  assert.equal(saved.fileId, 'logo-file');
  assert.equal(calls.some((line) => /accounts\.google\.com|oauth/.test(line)), false);
});
