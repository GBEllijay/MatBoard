import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ICLOUD_CALLBACK_PATH,
  ICLOUD_CONFIG_API,
  isAppleSignInUrl,
  isICloudWebAuthToken,
  parseAppleCloudKitConfig,
  publicAppleCloudKitConfigFromEnv,
  safeICloudReturnPath,
} from './appleCloudKitPublic.ts';
import { createICloudConnector } from './iCloudConnector.ts';
import {
  ICLOUD_CONNECT_FILE_NAME,
  ICLOUD_CONNECT_FILE_TEXT,
  ICLOUD_FILE_RECORD,
  ICLOUD_FOLDER_RECORD,
  ICLOUD_SETUP_NEEDED,
  ICLOUD_SIGN_IN_FAILED,
  ICLOUD_TEXT_LIMIT,
  ICLOUD_TEXT_TOO_BIG,
  cloudKitPrivateUrl,
  cloudKitRedirectUrl,
  createICloudFolder,
  fetchICloudSignInUrl,
  iCloudAccountLabel,
  iCloudFileOperation,
  iCloudFilesInFolder,
  iCloudItemsFromRecords,
  iCloudOwnerFacingError,
  iCloudSignInAction,
  iCloudSignInFailureCopy,
  listICloudFolders,
  nextWebAuthToken,
  primeICloudConfig,
  resolveOwnedICloudConfig,
  saveICloudText,
  settleICloudRedirect,
} from './iCloud.ts';

const container = 'iCloud.com.advantageapp.matboard';
const apiToken = 'a'.repeat(64);
const config = { container, apiToken, environment: 'development' as const };
const webToken = `web.${'B'.repeat(40)}`;
const rotated = `web.${'C'.repeat(40)}`;

function memoryStore(initial?: Record<string, string>) {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

test('CloudKit settings come from the build and a pasted setup cannot override them', () => {
  assert.equal(parseAppleCloudKitConfig({ container, apiToken, environment: 'production' })?.environment, 'production');
  assert.equal(parseAppleCloudKitConfig({ container: 'com.example', apiToken, environment: 'production' }), null);
  assert.equal(parseAppleCloudKitConfig({ container, apiToken: 'not-a-token', environment: 'production' }), null);
  assert.equal(parseAppleCloudKitConfig({ container, apiToken, environment: 'staging' }), null);
  assert.deepEqual(
    publicAppleCloudKitConfigFromEnv({
      APPLE_CLOUDKIT_CONTAINER: container,
      APPLE_CLOUDKIT_API_TOKEN: apiToken,
      APPLE_CLOUDKIT_ENVIRONMENT: 'development',
    }),
    config,
  );
  assert.deepEqual(
    publicAppleCloudKitConfigFromEnv({
      VITE_APPLE_CLOUDKIT_CONTAINER: '-----BEGIN PRIVATE KEY-----',
      APPLE_CLOUDKIT_API_TOKEN: apiToken,
      APPLE_CLOUDKIT_ENVIRONMENT: 'production',
    }),
    { container: '', apiToken: '', environment: '' },
  );

  const stored = JSON.stringify({ container, apiToken, environment: 'development' });
  assert.equal(
    resolveOwnedICloudConfig({
      envContainer: container,
      envToken: apiToken,
      envEnvironment: 'production',
      storedRaw: stored,
      dev: false,
    }).discardStored,
    true,
  );
  assert.equal(
    resolveOwnedICloudConfig({
      envContainer: '',
      envToken: '',
      envEnvironment: '',
      storedRaw: stored,
      dev: false,
    }).config,
    null,
  );
  assert.equal(
    resolveOwnedICloudConfig({
      envContainer: undefined,
      envToken: undefined,
      envEnvironment: undefined,
      storedRaw: stored,
      dev: true,
    }).config?.environment,
    'development',
  );
});

test('iCloud sign-in stays on Apple and owner copy does not mention setup secrets', () => {
  assert.equal(iCloudSignInAction({ configured: false, hasToken: false }), 'unavailable');
  assert.equal(iCloudSignInAction({ configured: true, hasToken: false }), 'redirect');
  assert.equal(iCloudSignInAction({ configured: true, hasToken: true }), 'session');
  assert.equal(isAppleSignInUrl('https://cdn.apple-cloudkit.com/ck/2/1/authorize'), true);
  assert.equal(isAppleSignInUrl('https://evil.example/phish'), false);
  assert.equal(isAppleSignInUrl('javascript:alert(1)'), false);
  assert.equal(safeICloudReturnPath('/slideshow?folder=gallery'), '/slideshow?folder=gallery');
  assert.equal(safeICloudReturnPath('https://evil.example'), '/');
  assert.equal(safeICloudReturnPath('//evil.example'), '/');
  assert.equal(isICloudWebAuthToken(webToken), true);
  assert.equal(isICloudWebAuthToken('<script>'), false);
  assert.equal(
    cloudKitRedirectUrl({
      serverErrorCode: 'AUTHENTICATION_REQUIRED',
      redirectURL: 'https://cdn.apple-cloudkit.com/ck/2/1/authorize?x=1',
    }),
    'https://cdn.apple-cloudkit.com/ck/2/1/authorize?x=1',
  );
  assert.equal(
    cloudKitRedirectUrl({
      serverErrorCode: 'AUTHENTICATION_REQUIRED',
      redirectURL: 'https://evil.example/steal',
    }),
    null,
  );
  assert.equal(iCloudSignInFailureCopy({ code: 'missing-config' }), ICLOUD_SETUP_NEEDED);
  assert.equal(iCloudSignInFailureCopy({ code: 'failed', dev: false }), ICLOUD_SIGN_IN_FAILED);
  assert.equal(
    iCloudSignInFailureCopy({ code: 'failed', detail: ICLOUD_SIGN_IN_FAILED, dev: true }),
    ICLOUD_SIGN_IN_FAILED,
  );
  assert.doesNotMatch(`${ICLOUD_SIGN_IN_FAILED} ${ICLOUD_SETUP_NEEDED}`, /api token|cloudkit|container|oauth|secret|services id/i);
  assert.equal(iCloudOwnerFacingError(new Error('{"ckAPIToken":"secret"}')), 'iCloud could not be opened.');
  assert.equal(iCloudOwnerFacingError(new Error('QUOTA_EXCEEDED')), 'iCloud storage is full.');
  assert.equal(iCloudOwnerFacingError(new Error(ICLOUD_TEXT_TOO_BIG)), ICLOUD_TEXT_TOO_BIG);
  assert.equal(iCloudAccountLabel({ nameComponents: { givenName: 'Ada', familyName: 'Lovelace' } }), 'Ada Lovelace');
  assert.equal(iCloudAccountLabel({ userRecordName: '_abc123' }), null);
});

test('Vite can inline the CloudKit settings and the app never ships a private key', () => {
  const source = readFileSync(new URL('./iCloud.ts', import.meta.url), 'utf8');
  const auth = readFileSync(new URL('./iCloudAuth.ts', import.meta.url), 'utf8');
  const callback = readFileSync(new URL('../server/icloudCallback.ts', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../../functions/api/icloud-config.ts', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../functions/api/icloud/callback.ts', import.meta.url), 'utf8');
  assert.match(source, /import\.meta\.env\.VITE_APPLE_CLOUDKIT_CONTAINER/);
  assert.match(source, /import\.meta\.env\.VITE_APPLE_CLOUDKIT_API_TOKEN/);
  assert.match(source, /import\.meta\.env\.VITE_APPLE_CLOUDKIT_ENVIRONMENT/);
  assert.doesNotMatch(source, /import\.meta\.env\?\.VITE_APPLE_CLOUDKIT/);
  assert.match(auth, /beginICloudSignIn/);
  assert.match(auth, /location\.assign/);
  assert.doesNotMatch(`${source}\n${auth}\n${callback}\n${api}\n${page}`, /client_secret|BEGIN PRIVATE KEY|\.p8|serverToServer|services id/i);
  assert.match(api, /publicAppleCloudKitConfigFromEnv/);
  assert.match(page, /icloudCallbackResponse/);
  assert.equal(ICLOUD_CONFIG_API, '/api/icloud-config');
  assert.equal(ICLOUD_CALLBACK_PATH, '/api/icloud/callback');
});

test('a return from Apple drops the web auth token from the address', () => {
  const params = new URLSearchParams({ ckWebAuthToken: webToken, folder: 'gallery' });
  let replaced = '';
  const location = {
    search: `?${params.toString()}`,
    pathname: '/slideshow',
    hash: '',
  } as Location;
  const values = new Map<string, string>();
  const storage = memoryStore();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? storage.getItem(key),
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
  });
  const original = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location, history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => void (replaced = url) } },
  });
  try {
    assert.equal(settleICloudRedirect(location), true);
    assert.match(replaced, /^\/slideshow\?folder=gallery$/);
    assert.doesNotMatch(replaced, /ckWebAuthToken/);
    assert.equal(values.get('matboard.icloud.webAuthToken'), webToken);
    assert.equal(values.get('matboard.icloud.resume'), '1');
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', { configurable: true, value: original });
    else delete (globalThis as { window?: unknown }).window;
  }
});

test('CloudKit helpers list folders and write a note in the gym iCloud', async () => {
  assert.equal(
    cloudKitPrivateUrl(config, 'users/current', null),
    `https://api.apple-cloudkit.com/database/1/${encodeURIComponent(container)}/development/private/users/current?ckAPIToken=${apiToken}`,
  );
  assert.match(cloudKitPrivateUrl(config, 'records/query', webToken), /ckWebAuthToken=/);
  assert.equal(nextWebAuthToken({ ckWebAuthToken: rotated }, webToken), rotated);
  assert.deepEqual(
    iCloudItemsFromRecords(
      {
        records: [
          { recordName: 'folder-1', recordType: ICLOUD_FOLDER_RECORD, fields: { name: { value: 'Gym' } } },
          { recordName: 'file-1', recordType: ICLOUD_FILE_RECORD, fields: { name: { value: 'note.txt' } } },
        ],
      },
      ICLOUD_FOLDER_RECORD,
    ),
    [{ id: 'folder-1', name: 'Gym' }],
  );
  assert.deepEqual(
    iCloudFilesInFolder(
      {
        records: [
          {
            recordName: 'file-1',
            recordType: ICLOUD_FILE_RECORD,
            fields: { name: { value: ICLOUD_CONNECT_FILE_NAME }, folderRecordName: { value: 'folder-1' } },
          },
          {
            recordName: 'file-2',
            recordType: ICLOUD_FILE_RECORD,
            fields: { name: { value: 'other.txt' }, folderRecordName: { value: 'folder-2' } },
          },
        ],
      },
      'folder-1',
    ),
    [{ id: 'file-1', name: ICLOUD_CONNECT_FILE_NAME }],
  );

  const calls: { url: string; method: string; body: string }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? init.body : '';
    calls.push({ url, method, body });
    if (url.includes('/users/current') && !url.includes('ckWebAuthToken')) {
      return Response.json({
        serverErrorCode: 'AUTHENTICATION_REQUIRED',
        redirectURL: 'https://cdn.apple-cloudkit.com/ck/2/1/authorize',
      });
    }
    if (url.includes('/records/query') && body.includes(ICLOUD_FOLDER_RECORD)) {
      return Response.json({
        records: [{ recordName: 'folder-1', recordType: ICLOUD_FOLDER_RECORD, fields: { name: { value: 'Gym', type: 'STRING' } } }],
        ckWebAuthToken: rotated,
      });
    }
    if (url.includes('/records/modify') && body.includes(ICLOUD_FOLDER_RECORD)) {
      return Response.json({
        records: [
          {
            recordName: 'folder-2',
            recordType: ICLOUD_FOLDER_RECORD,
            fields: { name: { value: 'Advantage Lesson Plans', type: 'STRING' } },
          },
        ],
        ckWebAuthToken: rotated,
      });
    }
    if (url.includes('/records/modify')) {
      return Response.json({
        records: [
          {
            recordName: 'file-9',
            recordType: ICLOUD_FILE_RECORD,
            fields: { name: { value: 'note.txt', type: 'STRING' } },
          },
        ],
        ckWebAuthToken: rotated,
      });
    }
    return new Response('missing', { status: 404 });
  };

  assert.equal(await fetchICloudSignInUrl(config, fetcher), 'https://cdn.apple-cloudkit.com/ck/2/1/authorize');
  const signIn = calls[0];
  assert.match(signIn?.url ?? '', /\/private\/users\/current\?/);
  assert.doesNotMatch(signIn?.url ?? '', /ckWebAuthToken/);

  primeICloudConfig(config);
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
  });

  const folders = await listICloudFolders(webToken, fetcher);
  assert.deepEqual(folders.folders, [{ id: 'folder-1', name: 'Gym' }]);
  assert.equal(folders.token, rotated);
  const query = calls.find((call) => call.url.includes('/records/query'));
  assert.match(query?.url ?? '', /ckAPIToken=/);
  assert.match(query?.body ?? '', /AdvantageFolder/);

  const saved = await saveICloudText(rotated, { name: 'note.txt', text: 'hello' }, 'folder-1', fetcher);
  assert.deepEqual(saved, { id: 'file-9', name: 'note.txt' });
  const posted = calls.find((call) => call.body.includes('note.txt'));
  const body = JSON.parse(posted?.body ?? '{}') as { operations?: { record?: { fields?: { body?: { value?: string }; folderRecordName?: { value?: string } } } }[] };
  assert.equal(body.operations?.[0]?.record?.fields?.body?.value, 'hello');
  assert.equal(body.operations?.[0]?.record?.fields?.folderRecordName?.value, 'folder-1');

  await assert.rejects(
    () => saveICloudText(rotated, { name: 'big.txt', text: 'x'.repeat(ICLOUD_TEXT_LIMIT + 1) }, 'folder-1', fetcher),
    /under 1 MB/,
  );

  const created = await createICloudFolder(rotated, 'Advantage Lesson Plans', fetcher);
  assert.equal(created.name, 'Advantage Lesson Plans');
  const operation = iCloudFileOperation({ name: 'a.txt', text: 'b' }, 'folder-1');
  const record = operation.operations[0] as { record?: { fields?: { folderRecordName?: { value?: string } } } };
  assert.equal(record.record?.fields?.folderRecordName?.value, 'folder-1');
  primeICloudConfig(null);
});

test('choosing an iCloud folder writes the connect note in that folder', async () => {
  primeICloudConfig(config);
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
  });
  const calls: { url: string; body: string }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? init.body : '';
    calls.push({ url, body });
    if (url.includes('/records/modify')) {
      return Response.json({
        records: [
          {
            recordName: 'proof',
            recordType: ICLOUD_FILE_RECORD,
            fields: { name: { value: ICLOUD_CONNECT_FILE_NAME, type: 'STRING' } },
          },
        ],
        ckWebAuthToken: rotated,
      });
    }
    if (url.includes('/users/current')) {
      return Response.json({
        userRecordName: '_hidden',
        nameComponents: { givenName: 'Gym', familyName: 'Owner' },
        ckWebAuthToken: rotated,
      });
    }
    return new Response('missing', { status: 404 });
  }) as typeof fetch;
  try {
    const provider = createICloudConnector();
    const binding = await provider.pickFolder(webToken, { id: 'folder-1', name: 'Gym folder' });
    assert.equal(binding.providerId, 'iCloud');
    assert.equal(binding.folderId, 'folder-1');
    assert.equal(binding.folderName, 'Gym folder');
    assert.equal(binding.accountLabel, 'Gym Owner');
    assert.equal(provider.isConnected(), true);
    const post = calls.find((call) => call.body.includes(ICLOUD_CONNECT_FILE_NAME));
    assert.match(post?.body ?? '', new RegExp(ICLOUD_CONNECT_FILE_TEXT.replace(/[.]/g, '\\.')));
    provider.disconnect();
    assert.equal(provider.isConnected(), false);
  } finally {
    primeICloudConfig(null);
    globalThis.fetch = original;
  }
});
