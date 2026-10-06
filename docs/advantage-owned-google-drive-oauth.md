# Advantage-owned Google Drive sign-in

Internal setup for Advantage App, LLC. Gym owners never do these steps. Owner steps are in `docs/owner-connect-google-drive.md`.

Advantage does not host photos or videos. File bytes stay in the customer’s Google Drive. Adding a photo still uses Google Photos or the phone gallery. Google Drive is an additional folder. The app stores lesson text plus Drive file ids.

The browser uses Google Identity Services with one **Web application** OAuth client. The client id is public in the PWA. **Do not ship a client secret** in the app, in Vite env, or in the owner UI.

## Build config

`VITE_GOOGLE_CLIENT_ID` is read at build time. CI or Cloudflare Pages injects the real company client id. The repo keeps it empty (see `.env.example`). Do not commit a production client id.

On the live website the id always comes from that variable. A client id saved in `localStorage` by an older build (`matboard.pro.googleClientId`) is deleted and cannot override the company client.

`npm run dev` can show a dev-only **App id** field when the variable is empty. Production builds omit that field.

## Company Google Cloud setup (once)

1. Create one Google Cloud project for Advantage.
2. Enable the Google Drive API.
3. OAuth consent screen:
   - App name: **Advantage**
   - User type: **External**
   - Publishing status: **Testing** while beta gyms are onboarding
   - Test users: add each beta gym Google account (the account that owns the gallery folder)
4. Create one **Web application** OAuth client.
5. Authorized JavaScript origins:
   - `https://advantagebjjtimer.com`
   - `https://www.advantagebjjtimer.com`
   - Any Cloudflare Pages or preview origin that still serves the beta PWA
   - `http://localhost:5173` if engineers use `npm run dev`
6. This flow is the browser token client. A redirect URI is not required for it.
7. Put **only the client id** in `VITE_GOOGLE_CLIENT_ID` for the hosting build.

Scopes used by the app:

- `https://www.googleapis.com/auth/drive.file` — lesson JSON the app creates
- `https://www.googleapis.com/auth/drive.readonly` — list the chosen folder, thumbnails, and download a video the owner stored

`drive.readonly` is a restricted scope. While the consent screen stays in **Testing**, only listed test users can sign in. To let any Google account connect, submit the app for **Google verification** (sensitive / restricted Drive scopes) and move the consent screen to **In production**. Expect a verification review, and a security assessment if Google requires one for the restricted scope.

## Common errors

| What Google shows | What it usually means |
| --- | --- |
| `invalid_client`, deleted client, or “client was not found” | The build’s `VITE_GOOGLE_CLIENT_ID` is missing or wrong, or the JavaScript origin of this site is not on that Web client. |
| Access blocked / app not verified, while status is Testing | That Google account is not listed under Test users. |
| Sign-in window closes with no folder list | The owner closed the window, or Google denied the grant. |

The gym owner still sees the plain sign-in sentence (`DRIVE_SIGN_IN_FAILED`): Google did not finish sign-in. Try again, or ask whoever set up Advantage to allow this website. A local dev build may add a short hint. If the build has no client id, the owner sees: Google Drive is not available on this build yet — contact Advantage.

## Connectors

The owner screen is a **Connect with** list, not a Google-only button. `src/lib/cloudStorage.ts` is the interface: id, display name, `phase` (`live`, `coming-for-launch`, or `reserved`), `connect`, `save`, `open`, `isConnected`, binding snapshot, `pickFolder`, `openFolderUrl`, and `disconnect`. `cloudStorageChoices()` is that list. Coach Unlimited and Advantage Pro call that interface. They do not call Drive or Graph themselves.

Coach Unlimited and Advantage Pro stay in alpha until Google Drive, OneDrive, Google Photos, and iCloud all work.

Google Drive (`googleDrive`) is `live`. OneDrive (`oneDrive`) is `live` in code and connects when `VITE_MICROSOFT_CLIENT_ID` is set (see `docs/advantage-owned-onedrive-oauth.md`). Google Photos (`googlePhotos`) is `live` in code and connects with this same client id when the Photos Picker API is enabled (see `docs/advantage-owned-google-photos-oauth.md`). `iCloud` is `coming-for-launch`: same interface, disabled, not implemented. Dropbox is a reserved slot from an earlier note. It is not half-built and it is not on the launch list.
