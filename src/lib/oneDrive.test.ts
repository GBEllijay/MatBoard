import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createOneDriveConnector } from './oneDriveConnector.ts';
import {
  GRAPH_ROOT,
  MICROSOFT_CLIENT_ID_KEY,
  ONEDRIVE_CONNECT_FILE_NAME,
  ONEDRIVE_CONNECT_FILE_TEXT,
  ONEDRIVE_SCOPES,
  ONEDRIVE_SETUP_NEEDED,
  ONEDRIVE_SIGN_IN_FAILED,
  applyOwnedMicrosoftClientId,
  classifyOneDriveAuthDetail,
  createOneDriveFolder,
  dismissOneDriveResume,
  graphChildrenUrl,
  graphTextUploadUrl,
  listOneDriveItems,
  markOneDriveResume,
  MSAL_INTERACTION_STATUS_KEY,
  oneDriveFileName,
  oneDriveItemsFromGraph,
  oneDriveOwnerFacingError,
  oneDriveRedirectPending,
  oneDriveRedirectUri,
  oneDriveResumeSnapshot,
  oneDriveSignInAction,
  oneDriveSignInFailureCopy,
  readOneDriveSession,
  resolveOwnedMicrosoftClientId,
  saveOneDriveText,
  takeOneDriveResumeError,
  writeDevMicrosoftClientId,
  writeOneDriveResumeError,
  writeOneDriveSession,
  type MicrosoftClientIdStore,
} from './oneDrive.ts';
import { publicMicrosoftClientIdFromEnv } from './microsoftClientPublic.ts';

function memoryStore(initial?: Record<string, string>): MicrosoftClientIdStore & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

test('owned Microsoft client id comes from the build and a pasted id cannot override it', () => {
  assert.deepEqual(resolveOwnedMicrosoftClientId({ envValue: ' env-id ', storedValue: 'pasted', dev: false }), {
    clientId: 'env-id',
    discardStored: true,
  });
  assert.deepEqual(resolveOwnedMicrosoftClientId({ envValue: '', storedValue: 'pasted', dev: false }), {
    clientId: '',
    discardStored: true,
  });
  assert.deepEqual(resolveOwnedMicrosoftClientId({ envValue: undefined, storedValue: ' pasted ', dev: true }), {
    clientId: 'pasted',
    discardStored: false,
  });

  const production = memoryStore({ [MICROSOFT_CLIENT_ID_KEY]: 'pasted-id' });
  assert.equal(applyOwnedMicrosoftClientId(production, { envValue: 'company-id', dev: false }), 'company-id');
  assert.equal(production.values.has(MICROSOFT_CLIENT_ID_KEY), false);
  writeDevMicrosoftClientId(production, { envValue: 'company-id', dev: false, value: 'another-paste' });
  assert.equal(production.values.has(MICROSOFT_CLIENT_ID_KEY), false);

  const dev = memoryStore();
  writeDevMicrosoftClientId(dev, { envValue: '', dev: true, value: ' local-dev ' });
  assert.equal(dev.values.get(MICROSOFT_CLIENT_ID_KEY), 'local-dev');
  assert.equal(applyOwnedMicrosoftClientId(dev, { envValue: undefined, dev: true }), 'local-dev');
});

test('OneDrive sign-in copy stays plain and the Graph scopes are the two delegated permissions', () => {
  assert.deepEqual([...ONEDRIVE_SCOPES], ['User.Read', 'Files.ReadWrite']);
  assert.equal(classifyOneDriveAuthDetail('AADSTS700016'), 'invalid-client');
  assert.equal(classifyOneDriveAuthDetail('AADSTS50011'), 'invalid-client');
  assert.equal(classifyOneDriveAuthDetail('user_cancelled'), 'cancelled');
  assert.equal(classifyOneDriveAuthDetail('popup_window_error'), 'cancelled');
  assert.equal(
    oneDriveSignInFailureCopy({ code: 'invalid-client', detail: 'AADSTS700016', dev: false }),
    ONEDRIVE_SIGN_IN_FAILED,
  );
  assert.equal(oneDriveSignInFailureCopy({ code: 'missing-client' }), ONEDRIVE_SETUP_NEEDED);
  assert.doesNotMatch(`${ONEDRIVE_SIGN_IN_FAILED} ${ONEDRIVE_SETUP_NEEDED}`, /client id|oauth|azure|client secret/i);
  assert.equal(oneDriveOwnerFacingError(new Error('{"error":"invalid_client"}')), ONEDRIVE_SIGN_IN_FAILED);
  assert.equal(oneDriveOwnerFacingError('OneDrive did not return a file id.'), 'OneDrive did not return a file id.');
  assert.equal(oneDriveOwnerFacingError('Paste a client id from Azure'), 'OneDrive could not be opened.');
});

test('Vite can inline the Microsoft client id and the app never ships a secret', () => {
  const source = readFileSync(new URL('./oneDrive.ts', import.meta.url), 'utf8');
  const auth = readFileSync(new URL('./oneDriveAuth.ts', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8');
  const card = readFileSync(new URL('../components/DriveConnectCard.tsx', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../../functions/api/microsoft-client.ts', import.meta.url), 'utf8');
  assert.match(source, /import\.meta\.env\.VITE_MICROSOFT_CLIENT_ID/);
  assert.doesNotMatch(source, /import\.meta\.env\?\.VITE_MICROSOFT_CLIENT_ID/);
  assert.match(auth, /@azure\/msal-browser/);
  assert.match(auth, /loginRedirect/);
  assert.match(auth, /handleRedirectPromise/);
  assert.match(auth, /settleOneDriveRedirect/);
  assert.doesNotMatch(auth, /loginPopup/);
  assert.match(main, /settleOneDriveRedirect/);
  assert.match(card, /loadMicrosoftClientId/);
  assert.match(card, /reason === 'redirecting'/);
  assert.match(api, /publicMicrosoftClientIdFromEnv/);
  assert.doesNotMatch(`${source}\n${auth}\n${api}`, /client_secret|CLIENT_SECRET|clientSecret/);
  assert.match(auth, /window\.location\.origin/);
  assert.doesNotMatch(`${source}\n${auth}`, /matboard\.pages\.dev/);
});

test('OneDrive sign-in is a redirect to Microsoft, and the public client id is a GUID only', () => {
  assert.equal(oneDriveSignInAction({ clientId: '', hasSession: false }), 'unavailable');
  assert.equal(oneDriveSignInAction({ clientId: 'not-a-guid', hasSession: false }), 'redirect');
  assert.equal(
    oneDriveSignInAction({ clientId: '11111111-1111-1111-1111-111111111111', hasSession: true }),
    'session',
  );
  assert.equal(oneDriveSignInAction({ clientId: '11111111-1111-1111-1111-111111111111', hasSession: false }), 'redirect');
  assert.equal(oneDriveRedirectUri('https://advantagebjjtimer.com'), 'https://advantagebjjtimer.com');
  assert.equal(oneDriveRedirectUri('https://www.advantagebjjtimer.com/'), 'https://www.advantagebjjtimer.com');
  assert.equal(oneDriveRedirectUri('http://localhost:5173'), 'http://localhost:5173');
  assert.equal(oneDriveRedirectUri('https://advantagebjjtimer.com/slideshow'), '');
  assert.equal(oneDriveRedirectUri('https://matboard.pages.dev'), 'https://matboard.pages.dev');
  assert.equal(
    publicMicrosoftClientIdFromEnv({ VITE_MICROSOFT_CLIENT_ID: ' 11111111-1111-1111-1111-111111111111 ' }),
    '11111111-1111-1111-1111-111111111111',
  );
  assert.equal(publicMicrosoftClientIdFromEnv({ MICROSOFT_CLIENT_ID: '22222222-2222-2222-2222-222222222222' }), '22222222-2222-2222-2222-222222222222');
  assert.equal(publicMicrosoftClientIdFromEnv({ VITE_MICROSOFT_CLIENT_ID: 'secret-value' }), '');
  assert.equal(publicMicrosoftClientIdFromEnv({}), '');
});

test('a Microsoft redirect return keeps the session until the gym picks a folder', () => {
  const values = new Map<string, string>();
  const store = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: store });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { hash: '' } },
  });
  try {
    assert.equal(oneDriveRedirectPending(), false);
    values.set(MSAL_INTERACTION_STATUS_KEY, '{"clientId":"11111111-1111-1111-1111-111111111111"}');
    assert.equal(oneDriveRedirectPending(), true);
    values.delete(MSAL_INTERACTION_STATUS_KEY);
    writeOneDriveSession({
      token: 'graph-token',
      expiresAt: Date.now() + 10 * 60 * 1000,
      accountLabel: 'owner@gym.test',
    });
    markOneDriveResume();
    assert.equal(oneDriveResumeSnapshot(), 'token');
    assert.equal(readOneDriveSession()?.token, 'graph-token');
    assert.equal(readOneDriveSession()?.accountLabel, 'owner@gym.test');
    writeOneDriveResumeError('Microsoft did not finish sign-in.');
    assert.equal(oneDriveResumeSnapshot(), 'error');
    assert.equal(takeOneDriveResumeError(), 'Microsoft did not finish sign-in.');
    assert.equal(oneDriveResumeSnapshot(), null);
    markOneDriveResume();
    dismissOneDriveResume();
    assert.equal(oneDriveResumeSnapshot(), null);
    assert.equal(readOneDriveSession()?.token, 'graph-token');
    writeOneDriveSession({ token: 'old', expiresAt: Date.now() - 1000, accountLabel: null });
    assert.equal(readOneDriveSession(), null);
  } finally {
    Reflect.deleteProperty(globalThis, 'sessionStorage');
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('Graph helpers list folders and write a text file in the gym OneDrive', async () => {
  assert.equal(oneDriveFileName('gym:plan/a?.txt'), 'gym-plan-a-.txt');
  assert.equal(graphChildrenUrl(), `${GRAPH_ROOT}/root/children?$top=200&$select=id,name,folder`);
  assert.equal(
    graphTextUploadUrl('folder id', 'note.txt'),
    `${GRAPH_ROOT}/items/${encodeURIComponent('folder id')}:/${encodeURIComponent('note.txt')}:/content`,
  );
  assert.deepEqual(
    oneDriveItemsFromGraph(
      {
        value: [
          { id: 'folder-1', name: 'Gym', folder: { childCount: 1 } },
          { id: 'file-1', name: 'clip.mp4' },
        ],
      },
      true,
    ),
    [{ id: 'folder-1', name: 'Gym' }],
  );

  const calls: { url: string; method: string; body: string; authorization: string }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? init.body : '';
    const headers = new Headers(init?.headers);
    calls.push({ url, method, body, authorization: headers.get('Authorization') ?? '' });
    if (url.includes('/root/children') && method === 'GET') {
      return Response.json({
        value: [{ id: 'folder-1', name: 'Gym', folder: {} }],
      });
    }
    if (method === 'PUT') {
      return Response.json({ id: 'file-9', name: 'note.txt' });
    }
    if (method === 'POST') {
      return Response.json({ id: 'folder-2', name: 'Advantage Lesson Plans' });
    }
    return new Response('missing', { status: 404 });
  };

  const folders = await listOneDriveItems('token', { foldersOnly: true, fetcher });
  assert.deepEqual(folders, [{ id: 'folder-1', name: 'Gym' }]);
  assert.equal(calls[0]?.url, graphChildrenUrl());
  assert.equal(calls[0]?.authorization, 'Bearer token');

  const saved = await saveOneDriveText('token', { name: 'note.txt', text: 'hello' }, 'folder-1', fetcher);
  assert.deepEqual(saved, { id: 'file-9', name: 'note.txt' });
  const put = calls.find((call) => call.method === 'PUT');
  assert.equal(put?.body, 'hello');
  assert.match(put?.url ?? '', /\/items\/folder-1:\/note\.txt:\/content$/);

  const created = await createOneDriveFolder('token', 'Advantage Lesson Plans', fetcher);
  assert.equal(created.id, 'folder-2');
  const post = calls.find((call) => call.method === 'POST');
  const posted = JSON.parse(post?.body ?? '{}') as { name?: string; folder?: unknown };
  assert.equal(posted.name, 'Advantage Lesson Plans');
  assert.deepEqual(posted.folder, {});
});

test('choosing a OneDrive folder writes the connect file in that folder', async () => {
  if (typeof globalThis.localStorage === 'undefined') {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
        removeItem: (key: string) => void values.delete(key),
      },
    });
  }
  const calls: { url: string; method: string; body: string }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? init.body : '';
    calls.push({ url, method, body });
    if (method === 'PUT') return Response.json({ id: 'proof', name: ONEDRIVE_CONNECT_FILE_NAME });
    if (url.includes('/me?')) return Response.json({ userPrincipalName: 'owner@gym.test' });
    return new Response('missing', { status: 404 });
  }) as typeof fetch;
  try {
    const provider = createOneDriveConnector();
    const binding = await provider.pickFolder('token', { id: 'folder-1', name: 'Gym folder' });
    assert.equal(binding.providerId, 'oneDrive');
    assert.equal(binding.folderId, 'folder-1');
    assert.equal(binding.folderName, 'Gym folder');
    assert.equal(binding.accountLabel, 'owner@gym.test');
    assert.equal(provider.isConnected(), true);
    const put = calls.find((call) => call.method === 'PUT');
    assert.equal(put?.body, ONEDRIVE_CONNECT_FILE_TEXT);
    assert.match(put?.url ?? '', /folder-1:\/advantage-onedrive-connect\.txt:\/content/);
    provider.disconnect();
    assert.equal(provider.isConnected(), false);
  } finally {
    globalThis.fetch = original;
  }
});
