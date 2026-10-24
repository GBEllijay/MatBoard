import { expect, test, type Page } from '@playwright/test';

const BUTTON = { name: 'Update to latest' };

const LOCAL: Record<string, string> = {
  'matboard.roster.v1': JSON.stringify({ students: [{ id: 'ava', name: 'Ava Santos', belt: 'Blue' }] }),
  'matboard.studentEdition.v1': JSON.stringify({ journal: [{ note: 'armbar from Tuesday' }] }),
  'matboard.studentEdition.assessment.v1': '{"entries":[{"note":"calm rounds"}]}',
  'matboard.studentEdition.scouting.v1': '{"cards":[{"name":"Rival"}]}',
  'matboard.studentEdition.lastBackupAt.v1': '2026-10-24T03:00:00.000Z',
  'advantage.proUnlocked': '1',
  'advantage.coachUnlocked': '1',
  'advantage.whiteUnlocked': '1',
  'advantage.studentEditionUnlocked': '1',
  'advantage.studentUnlocked': '1',
  'matboard.pro.googleDriveFolder.v1': '{"folderId":"fld-keep","folderName":"Gym"}',
  'matboard.studentEdition.academyDrive.v1': '{"folderId":"academy-keep"}',
  'matboard.studentEdition.personalDrive.v1': '{"folderId":"personal-keep"}',
  'matboard.schedule.v1': '{"title":"Evening Gi"}',
  'matboard.tournament.v1': '{"name":"In-house"}',
  'matboard.coach.techniqueTree.v1': '{"trees":[{"name":"Closed guard"}]}',
  'matboard.gymName.v1': 'Keep Gym',
  'matboard.gymLogo.v1': 'logo-keep',
  'matboard.updateProbe.sentinel': 'do-not-delete',
};

const SESSION: Record<string, string> = {
  'matboard.pro.googleDriveToken': '{"accessToken":"ya29.keep"}',
  // `academy` and `personal` are the app's own OneDrive return flags and send
  // the browser to Connections. A different value still proves this key survives.
  'matboard.studentEdition.oneDriveIntent.v1': 'keep-onedrive-intent',
  'matboard.updateProbe.session': 'session-keep',
};

async function shot(page: Page, name: string) {
  const button = page.getByRole('button', BUTTON);
  await button.evaluate((element) => {
    let node: HTMLElement | null = element.parentElement;
    while (node) {
      const style = getComputedStyle(node);
      const scrollable = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 8;
      if (scrollable) {
        const top = element.getBoundingClientRect().top - node.getBoundingClientRect().top + node.scrollTop;
        node.scrollTop = Math.max(0, top - node.clientHeight / 2 + element.offsetHeight / 2);
        return;
      }
      node = node.parentElement;
    }
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
  });
  await expect(button).toBeVisible();
  await expect(button).toBeInViewport({ ratio: 0.9 });
  const box = await button.boundingBox();
  if (!box) throw new Error('missing update button box');
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png` });
  await page.screenshot({
    path: `/opt/cursor/artifacts/${name}-context.png`,
    clip: {
      x: 0,
      y: Math.max(0, box.y - 90),
      width: 390,
      height: Math.min(320, box.height + 180),
    },
  });
  await button.screenshot({ path: `/opt/cursor/artifacts/${name}-button.png` });
}

async function seedSavedData(page: Page) {
  await page.evaluate(
    async ({ local, session }) => {
      for (const [key, value] of Object.entries(local)) localStorage.setItem(key, value);
      for (const [key, value] of Object.entries(session)) sessionStorage.setItem(key, value);
      document.cookie = 'advantage_update_probe=kept; path=/';

      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('matboard', 3);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs');
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('photos', 'readwrite');
          tx.objectStore('photos').put({ id: 'keep-photo', folderId: 'gallery', name: 'Ava photo' });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });

      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('matboard-schedule', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets');
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('assets', 'readwrite');
          tx.objectStore('assets').put(new Blob(['schedule-logo-keep'], { type: 'text/plain' }), 'logo');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });

      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('matboard-student-films', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('blobs', 'readwrite');
          tx.objectStore('blobs').put(new Blob(['journal-clip-keep'], { type: 'text/plain' }), 'film-keep');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });

      const keyPathPuts: { name: string; store: string; value: { id: string; name: string } }[] = [
        { name: 'matboard-techniques', store: 'clips', value: { id: 'clip-keep', name: 'armbar clip' } },
        { name: 'matboard-class-photo-promotions', store: 'items', value: { id: 'class-photo-keep', name: 'promotion' } },
        { name: 'matboard-curriculum-media', store: 'clips', value: { id: 'old-clip-keep', name: 'drill' } },
      ];
      for (const item of keyPathPuts) {
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(item.name, 1);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(item.store)) db.createObjectStore(item.store, { keyPath: 'id' });
            if (item.name === 'matboard-techniques' && !db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs');
          };
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction(item.store, 'readwrite');
            tx.objectStore(item.store).put(item.value);
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        });
      }

      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('matboard.googleDriveFiles', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('files', 'readwrite');
          tx.objectStore('files').put('{"files":["keep-drive-list"]}', 'list');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });

      const cache = await caches.open('matboard-stale-shell');
      await cache.put('/stale-shell.html', new Response('<html>old build</html>', { headers: { 'content-type': 'text/html' } }));
    },
    { local: LOCAL, session: SESSION },
  );
}

async function readSavedData(page: Page) {
  return page.evaluate(async () => {
    const local: Record<string, string> = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key) local[key] = localStorage.getItem(key) ?? '';
    }
    const session: Record<string, string> = {};
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key) session[key] = sessionStorage.getItem(key) ?? '';
    }
    const read = (name: string, store: string, key: IDBValidKey) =>
      new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(store, 'readonly');
          const get = tx.objectStore(store).get(key);
          get.onsuccess = () => {
            const value = get.result;
            db.close();
            if (value instanceof Blob) {
              void value.text().then(resolve);
              return;
            }
            resolve(value);
          };
          get.onerror = () => reject(get.error);
        };
      });
    const databases =
      typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map((row) => row.name ?? '') : [];
    return {
      local,
      session,
      cookie: document.cookie,
      caches: await caches.keys(),
      workers: (await navigator.serviceWorker.getRegistrations()).map((registration) => registration.scope),
      databases,
      photo: await read('matboard', 'photos', 'keep-photo'),
      scheduleLogo: await read('matboard-schedule', 'assets', 'logo'),
      film: await read('matboard-student-films', 'blobs', 'film-keep'),
      technique: await read('matboard-techniques', 'clips', 'clip-keep'),
      classPhoto: await read('matboard-class-photo-promotions', 'items', 'class-photo-keep'),
      curriculum: await read('matboard-curriculum-media', 'clips', 'old-clip-keep'),
      driveList: await read('matboard.googleDriveFiles', 'files', 'list'),
      navigation: performance.getEntriesByType('navigation').map((entry) => entry.name),
    };
  });
}

async function installProbeWorker(page: Page) {
  await page.context().route('**/e2e-update-sw.js', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      headers: { 'cache-control': 'no-store', 'service-worker-allowed': '/' },
      body: `
        self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
        self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
      `,
    }),
  );
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/e2e-update-sw.js');
    await navigator.serviceWorker.ready;
    return registration.scope;
  });
}

async function tapUpdate(page: Page) {
  const button = page.getByRole('button', BUTTON);
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(160);
  await Promise.all([page.waitForURL(/[?&]mbv=\d+/), button.click()]);
  await expect(button).toBeVisible();
}

test.describe('update to latest', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('shows the current build on the storefront, product menu, and Backup & Print', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', BUTTON)).toBeVisible();
    await expect(page.getByText(/This build: \S+ · \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/)).toBeVisible();
    await expect(page.getByText('Saved data on this device stays.')).toBeVisible();
    await expect(page.getByText('Newer build is ready')).toHaveCount(0);
    await shot(page, 'update-latest-storefront-390');

    await page.route('**/version.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'cache-control': 'no-store' },
        body: JSON.stringify({ version: 'newer', builtAt: '2099-01-01T00:00:00.000Z' }),
      }),
    );
    await page.reload();
    await expect(page.getByText('Newer build is ready')).toBeVisible();
    await page.unroute('**/version.json');

    await page.goto('/products');
    await expect(page.getByRole('button', BUTTON)).toBeVisible();
    await expect(page.getByText(/This build: \S+ · \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/)).toBeVisible();
    await shot(page, 'update-latest-products-390');

    await page.goto('/student/backup?student=1');
    await expect(page.getByRole('heading', { name: 'Backup & Print' })).toBeVisible();
    await expect(page.getByRole('button', BUTTON)).toBeVisible();
    await shot(page, 'update-latest-backup-390');
  });

  test('the product-menu button reloads and keeps saved data', async ({ page }) => {
    await page.goto('/products');
    await installProbeWorker(page);
    await seedSavedData(page);
    const before = await readSavedData(page);
    expect(before.caches).toContain('matboard-stale-shell');
    expect(before.workers.length).toBeGreaterThan(0);

    await tapUpdate(page);

    const after = await readSavedData(page);
    for (const [key, value] of Object.entries(LOCAL)) expect(after.local[key], key).toBe(value);
    for (const [key, value] of Object.entries(SESSION)) expect(after.session[key], key).toBe(value);
    expect(after.cookie).toContain('advantage_update_probe=kept');
    expect(after.caches).toEqual([]);
    expect(after.workers).toEqual([]);
    expect(after.databases).toEqual(
      expect.arrayContaining([
        'matboard',
        'matboard-schedule',
        'matboard-student-films',
        'matboard-techniques',
        'matboard-class-photo-promotions',
        'matboard-curriculum-media',
        'matboard.googleDriveFiles',
      ]),
    );
    expect(after.photo).toMatchObject({ id: 'keep-photo', name: 'Ava photo' });
    expect(after.scheduleLogo).toBe('schedule-logo-keep');
    expect(after.film).toBe('journal-clip-keep');
    expect(after.technique).toMatchObject({ id: 'clip-keep', name: 'armbar clip' });
    expect(after.classPhoto).toMatchObject({ id: 'class-photo-keep', name: 'promotion' });
    expect(after.curriculum).toMatchObject({ id: 'old-clip-keep', name: 'drill' });
    expect(after.driveList).toBe('{"files":["keep-drive-list"]}');
    expect(after.navigation.some((name) => /[?&]mbv=\d+/.test(name))).toBe(true);
    expect(Object.keys(after.local).length).toBeGreaterThanOrEqual(Object.keys(before.local).length);
    expect(new URL(page.url()).pathname).toBe('/products');
    expect(page.url()).not.toContain('mbv=');
  });

  test('the Backup & Print button reloads and keeps saved data', async ({ page }) => {
    await page.goto('/student/backup?student=1');
    await installProbeWorker(page);
    await seedSavedData(page);
    await tapUpdate(page);
    const after = await readSavedData(page);
    expect(after.local['matboard.studentEdition.v1']).toContain('armbar from Tuesday');
    expect(after.local['matboard.roster.v1']).toContain('Ava Santos');
    expect(after.local['advantage.proUnlocked']).toBe('1');
    expect(after.local['advantage.studentEditionUnlocked']).toBe('1');
    expect(after.local['matboard.pro.googleDriveFolder.v1']).toContain('fld-keep');
    expect(after.session['matboard.pro.googleDriveToken']).toContain('ya29.keep');
    expect(after.cookie).toContain('advantage_update_probe=kept');
    expect(after.film).toBe('journal-clip-keep');
    expect(after.caches).toEqual([]);
    expect(after.workers).toEqual([]);
    expect(page.url()).toContain('/student/backup');
    expect(page.url()).toContain('student=1');
    expect(page.url()).not.toContain('mbv=');
  });

  test('the storefront button reloads and keeps saved data', async ({ page }) => {
    await page.goto('/');
    await seedSavedData(page);
    await tapUpdate(page);
    const after = await readSavedData(page);
    expect(after.local['matboard.roster.v1']).toContain('Ava Santos');
    expect(after.local['matboard.studentEdition.v1']).toContain('armbar from Tuesday');
    expect(after.local['advantage.whiteUnlocked']).toBe('1');
    expect(after.local['advantage.coachUnlocked']).toBe('1');
    expect(after.session['matboard.studentEdition.oneDriveIntent.v1']).toBe('keep-onedrive-intent');
    expect(after.scheduleLogo).toBe('schedule-logo-keep');
    expect(after.driveList).toBe('{"files":["keep-drive-list"]}');
    expect(after.caches).toEqual([]);
    expect(after.navigation.some((name) => /[?&]mbv=\d+/.test(name))).toBe(true);
    expect(new URL(page.url()).pathname).toBe('/');
    expect(page.url()).not.toContain('mbv=');
  });
});
