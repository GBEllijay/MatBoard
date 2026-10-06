# Advantage-owned iCloud sign-in

Internal setup for Advantage App, LLC. Gym owners never do these steps. Owner steps are in `docs/owner-connect-google-drive.md`.

Advantage does not host photos or videos, and Advantage does not manage the gym’s Apple account. The gym signs in on Apple’s page. The password stays with Apple. Notes saved through this connection stay in that Apple ID’s iCloud and count against that iCloud storage plan.

Coach Unlimited and Advantage Pro stay in alpha until Google Drive, OneDrive, Google Photos, and iCloud all work. This milestone makes **Connect with → iCloud** a real button. It is not a Coming for launch slot.

## What Apple allows from a website

Apple does not publish an iCloud Drive or iCloud Photos API that a website can use the way Google Drive and Microsoft Graph work. There is no OAuth scope for “this folder in iCloud Drive.”

These are the official web choices, and what this app does with each:

| Apple product | What it gives a website | Used here |
| --- | --- | --- |
| Sign in with Apple (Services ID) | An identity token: a stable user id, and sometimes a name or a private-relay email. No files. | No. A Services ID cannot read or write iCloud. |
| CloudKit web services | Read and write records in **this app’s** CloudKit container, in the signed-in user’s **private database**. Those bytes live in the user’s iCloud and count against their quota. | Yes. This is the storage path. |
| iCloud Drive / iCloud Photos private web endpoints | The endpoints behind icloud.com. They require the Apple ID password and two-factor sign-in. They are undocumented. | No. Advantage will not ask for an Apple ID password or call those endpoints. |

A native app could put files in an iCloud Drive folder (a ubiquity container) that shows up in the Files app. A website cannot. Shipping an iOS or macOS app is not required for the CloudKit path below, but the Apple Developer Program is. An App ID with iCloud turned on is how the container is created. The app does not have to be submitted to the App Store.

### Hard limits

- The gym cannot pick an existing iCloud Drive folder, Desktop, or Documents folder. The list is Advantage folders created in this CloudKit container.
- Notes do not appear in the Files app, Finder, or iCloud Drive.
- iCloud Photos is not read or written. Media Console still plays photos and videos from this phone, Google Drive, and (when that work lands) Google Photos.
- One CloudKit record’s text stays under 1 MB. This build rejects a longer note before it is sent.
- Photos and videos are not uploaded. A CloudKit asset is a different upload, is capped (Apple’s documented asset limit is 50 MB), and still would not show up in the Photos app.
- Lesson day packages, class history, and Media Console libraries still save through Google Drive. iCloud `save` and `open` are the shared text pipe, plus the connect note.
- The web auth token is single-use. Each CloudKit response returns the next token. It expires about 30 minutes after sign-in, or about two weeks if the person checks “Keep me signed in” on Apple’s page. This phone keeps the latest token in `sessionStorage` only.
- If Apple rejects the token, Advantage sends the browser to Apple at most once more per minute, then shows the plain sign-in sentence.

## Build config

Set these on the Cloudflare Pages project for **Production**. Set them on Preview only when that exact origin is also on the CloudKit allowed-origin list. Vite inlines the `VITE_` names when the site is built. `GET /api/icloud-config` also reads the same names, or the names without the `VITE_` prefix, from the Pages environment at request time. The response is empty unless all three values are valid. Changing them requires a new Pages deployment.

Do not commit the values. Do not add a server-to-server private key, a Sign in with Apple `.p8` file, or any Apple client secret to Cloudflare, Vite, or the app.

| Cloudflare / Vite name | Also accepted at request time | Value |
| --- | --- | --- |
| `VITE_APPLE_CLOUDKIT_CONTAINER` | `APPLE_CLOUDKIT_CONTAINER` | Container id, for example `iCloud.com.advantageapp.matboard` |
| `VITE_APPLE_CLOUDKIT_API_TOKEN` | `APPLE_CLOUDKIT_API_TOKEN` | The 64-character hex API token from CloudKit Dashboard. Public, limited to the domains below. |
| `VITE_APPLE_CLOUDKIT_ENVIRONMENT` | `APPLE_CLOUDKIT_ENVIRONMENT` | `development` until the schema is deployed, then `production` |

On the live website a setup saved in `localStorage` by a dev build (`matboard.pro.appleCloudKit`) is deleted and cannot override the company values.

If this deployment has no usable settings, the iCloud button stays on the list, styled as unavailable, and disabled. The owner sees: iCloud is not available on this build yet — contact Advantage. The tap does not open Apple.

`npm run dev` can show dev-only container, web token, and environment fields when the variables are empty. Production builds omit those fields. Local sign-in also needs the dev server, because `npm run dev` serves `GET /api/icloud/callback`.

## Apple Developer portal (once)

Use the Apple Developer account for Advantage App, LLC. The program is paid. A free Apple ID cannot create a CloudKit container.

1. **Certificates, Identifiers & Profiles → Identifiers → App IDs → +**. Register an explicit App ID, for example `com.advantageapp.matboard`. Description: **Advantage**.
2. Enable **iCloud**, then **CloudKit**. Create a container, for example `iCloud.com.advantageapp.matboard`. You do not have to upload a build or submit the app.
3. Do **not** turn on Sign in with Apple for this connection. If the portal still asks you to create a Services ID before it will save something else, see the next section and do not point that login at the CloudKit callback.
4. Open [CloudKit Dashboard](https://icloud.developer.apple.com/) and choose that container. Stay in **Development** until the schema below is saved.
5. **Schema → Record Types.** Add:
   - `AdvantageFolder` with a String field named `name`.
   - `AdvantageFile` with String fields named `name`, `body`, and `folderRecordName`.
6. Leave indexes off unless a query error asks for one. This app lists records by type and filters notes in the browser. If Apple requires it, mark `name` and `folderRecordName` Queryable.
7. **Deploy Schema Changes** to Production only after a development sign-in has created a folder and the connect note. Then set `VITE_APPLE_CLOUDKIT_ENVIRONMENT` to `production` and deploy the site again. Development and production each need their own API token.
8. **API Access → API Tokens → +**. Name: **Advantage Web**.
   - **Sign In Callback**: `https://advantagebjjtimer.com/api/icloud/callback`  
     CloudKit allows one callback URL on a token. Do not add a path other than `/api/icloud/callback`. Do not add a trailing slash.
   - **Allowed Origins**: specific domains, with no path:
     - `https://advantagebjjtimer.com`
     - `https://www.advantagebjjtimer.com`
     - `http://localhost:5173` if engineers use `npm run dev`
   - Do **not** add `https://matboard.pages.dev`. A host that is not on this list cannot call CloudKit.
9. Save. Copy the container id, the API token, and `development` or `production` into the Cloudflare variables above. Rebuild.

`https://www.advantagebjjtimer.com` can be an allowed origin on the same token, but the sign-in callback is only the apex URL. Gym owners should connect from `https://advantagebjjtimer.com`. A second API token is required only if www must be the callback host itself. This app does not register `https://matboard.pages.dev`.

The callback is a Pages Function. `public/_routes.json` already includes `/api/*`, so `/api/icloud/callback` and `/api/icloud-config` run as functions. The function does not store the token. It puts the token in the browser’s session storage and sends the window back to the page that started the tap. The service worker does not swallow `/api/*`.

## Services ID and Return URLs (not used for files)

Sign in with Apple uses a **Services ID** and **Return URLs**. That is a different product from the CloudKit API token. This website does not read a Services ID, does not load Apple’s Sign in with Apple JS, and does not exchange an authorization code. Do not create a Sign in with Apple key, and do not upload a `.p8` file to Cloudflare.

If a portal screen forces a Services ID to exist before you can leave Identifiers, use these values and then leave Sign in with Apple disabled on the web app:

| Field | Value |
| --- | --- |
| Description | Advantage |
| Identifier | `com.advantageapp.matboard.web` |
| Domain | `advantagebjjtimer.com` |
| Return URLs | `https://advantagebjjtimer.com` and `https://www.advantagebjjtimer.com` |

Those Return URLs are **not** the CloudKit callback. Do not set a Services ID Return URL to `https://advantagebjjtimer.com/api/icloud/callback`. That address only accepts CloudKit’s `ckWebAuthToken` query on a GET. Sign in with Apple posts a form body, and this function ignores that body.

Domain verification for Sign in with Apple (`/.well-known/apple-developer-domain-association.txt`) is not part of this connection. Add that file only if Advantage later turns on Sign in with Apple itself.

## What the gym owner sees

1. Tap **Connect with**, then **iCloud**.
2. This window goes to Apple. They sign in with the Apple ID that should hold the gym notes and allow Advantage.
3. Apple sends them back to Advantage. They pick an Advantage folder, or tap **Create Advantage Lesson Plans**.
4. Advantage writes a note named `advantage-icloud-connect.txt` in that folder. The note stays in their iCloud. It does not show up as a file in iCloud Drive.

## Common errors

| What you see | What it usually means |
| --- | --- |
| Button does nothing and Apple never opens | The deployment is missing the container, the API token, or the environment. Set the three variables and deploy again. |
| Apple opens, then Advantage says sign-in did not finish | The Sign In Callback on the API token is not `https://advantagebjjtimer.com/api/icloud/callback`, or the origin is not on Allowed Origins. |
| `AUTHENTICATION_REQUIRED` keeps coming back | The token’s environment (`development` or `production`) does not match `VITE_APPLE_CLOUDKIT_ENVIRONMENT`. |
| Record type was not found | `AdvantageFolder` or `AdvantageFile` is missing in that environment, or the schema was not deployed to Production. |
| iCloud storage is full | The gym’s iCloud plan has no room left. Advantage does not add storage. |
| Works on localhost and fails on the live site | The live origin is not an allowed origin, or the production token was never created. |

The gym owner still sees the plain sentence: Apple did not finish sign-in. Try again, or ask whoever set up Advantage to allow this website. A local dev build may add a short hint.

## What this milestone does not do

Lesson JSON, training videos, class photos, class history, and Media Console libraries still use Google Drive. iCloud does not browse the gym’s existing iCloud Drive. Google Photos is still Coming for launch.
