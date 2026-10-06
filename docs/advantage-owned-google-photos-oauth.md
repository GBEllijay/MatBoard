# Advantage-owned Google Photos sign-in

Internal setup for Advantage App, LLC. Gym owners never do these steps. Owner steps are in `docs/owner-connect-google-drive.md`.

Advantage does not host photos or videos. Bytes stay in the customer’s Google Photos library. Media Console copies a chosen photo or video onto the phone or computer only so the TV can play it. Lesson plans still save in the connected Google Drive or OneDrive folder. This app does not write lesson files into Google Photos.

The browser uses the same **Web application** OAuth client as Google Drive, and the same public client id (`VITE_GOOGLE_CLIENT_ID`). **Do not ship a client secret.** Do not create a second OAuth client for Photos.

## Build config

No new Vite or Cloudflare variable. Photos reads `VITE_GOOGLE_CLIENT_ID`, the same value Drive already uses.

- Cloudflare Pages → Settings → Environment variables → the production (and preview, if you use it) build must already have `VITE_GOOGLE_CLIENT_ID`.
- That name is inlined at **build** time. Changing it requires a new deployment. Turning on the Photos API in Google Cloud does **not** require a new Cloudflare variable or a new deploy if this id is already on the live build.
- Leave the repo value empty (see `.env.example`). Do not commit a production client id.
- There is no `VITE_GOOGLE_PHOTOS_CLIENT_ID`. Do not add a client secret under any name.

`npm run dev` can show the existing dev-only **App id** field when `VITE_GOOGLE_CLIENT_ID` is empty. That field is the shared Google client id. Production builds omit it.

## Why this is not `photoslibrary.readonly`

On 31 March 2025 Google removed these scopes:

- `https://www.googleapis.com/auth/photoslibrary.readonly`
- `https://www.googleapis.com/auth/photoslibrary`
- `https://www.googleapis.com/auth/photoslibrary.sharing`

Calls that rely on them return `403 PERMISSION_DENIED`. The Library API can no longer list a customer’s existing albums. Do not add those scopes to the consent screen for this app.

Media Console uses the [Google Photos Picker API](https://developers.google.com/photos/picker/guides/get-started-picker). The owner signs in, then Google’s own picker opens. They search for an album or collection, select the photos or videos, and tap Done. Advantage receives only that selection.

Scope the app requests:

- `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`

That scope is sensitive. While the consent screen stays in **Testing**, only listed test users can connect. To let any Google account connect, submit the app for Google verification and move the consent screen to **In production**.

## Company Google Cloud setup (once, on the existing Advantage project)

1. Open the same Google Cloud project that already has the Drive Web client.
2. Enable **Google Photos Picker API** (APIs & Services → Library). Do not rely on the old Photos Library API for this feature.
3. OAuth consent screen → Data access / Scopes → add:
   - `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`
   - Keep the existing Drive scopes (`drive.file`, `drive.readonly`).
   - Do not add `photoslibrary.readonly` or the other removed Library scopes.
4. The OAuth client stays one **Web application** client. Copy its client id only if `VITE_GOOGLE_CLIENT_ID` is not already set. Do not create a client secret.
5. Authorized JavaScript origins (this is what this sign-in checks). Include, with no path and no trailing slash:
   - `https://advantagebjjtimer.com`
   - `https://www.advantagebjjtimer.com`
   - Any Cloudflare Pages or preview origin that still serves the beta PWA
   - `http://localhost:5173` if engineers use `npm run dev`
6. Authorized redirect URIs: **leave this empty for this client.** Google Photos uses the same browser token client as Google Drive (Google Identity Services). The site does not receive an OAuth redirect. OneDrive is different: Microsoft requires SPA redirect URIs. Do not copy the OneDrive redirect list onto this Google client, and do not add `https://matboard.pages.dev` unless that exact origin is also a JavaScript origin you intend to allow.
7. The Google Photos window itself is a Google URL (`pickerUri`). You do not register that URL.
8. Consent screen publishing status: **Testing** while beta gyms are onboarding. Test users: add each beta gym Google account (the account that owns the Photos library).
9. Put **only the existing client id** in `VITE_GOOGLE_CLIENT_ID` if it is not there already. Cloudflare Pages build environment. No secret.

## What the gym owner sees

1. Tap **Connect with**, then **Google Photos**.
2. Google opens. They sign in with the account that owns the gym library and allow Advantage. While the app is unverified they may need **Continue**, or **Advanced** then **Continue**.
3. Confirm **Google Photos**. This does not pick files yet. Drive or OneDrive can stay connected at the same time. Photos is the library, not a replacement lesson folder.
4. In **Media Console**, tap **Pick from Google Photos** (Gallery, Pro Shop, or Events).
5. Google Photos opens. Recent items are shown. Albums are not listed as folders. Search for the album or collection name, select up to 50 items, then tap **Done**.
6. This phone keeps a copy so the TV can play them. The originals stay in Google Photos. **Pick from gallery** is still the phone’s own camera roll.

If this build has no `VITE_GOOGLE_CLIENT_ID`, the Google Photos button stays disabled and the owner sees: Google Photos is not available on this build yet — contact Advantage.

## Common errors

| What Google shows | What it usually means |
| --- | --- |
| `invalid_client`, deleted client, or “client was not found” | `VITE_GOOGLE_CLIENT_ID` is missing or wrong, or this site’s JavaScript origin is not on that Web client. |
| Access blocked / app not verified, while status is Testing | That Google account is not listed under Test users. |
| `403` mentioning `photoslibrary` | A removed Library scope was requested. Remove it. This build requests only `photospicker.mediaitems.readonly`. |
| Sign-in window closes with no library confirmation | The owner closed the window, or Google denied the grant. |
| Picker opens but Done never returns items | The Photos Picker API is not enabled on the project, or the test user has not granted the Picker scope. |

The gym owner still sees a plain sentence: Google did not finish sign-in. Try again, or ask whoever set up Advantage to allow this website. A local dev build may add a short hint.

## What this milestone does not do

iCloud is not in this change. Lesson JSON, training videos, and class history still use Google Drive. Google Photos `save` and `open` on the storage connector do not write lesson files. Picking is Media Console only, through Google’s picker, up to 50 items at a time.
