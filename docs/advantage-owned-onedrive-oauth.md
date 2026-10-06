# Advantage-owned OneDrive sign-in

Internal setup for Advantage App, LLC. Gym owners never do these steps. Owner steps are in `docs/owner-connect-google-drive.md`.

Advantage does not host photos or videos. File bytes stay in the customer’s own OneDrive. Advantage does not manage that Microsoft account. Coach Unlimited and Advantage Pro stay in alpha until Google Drive, OneDrive, Google Photos, and iCloud all work.

This build signs in with Microsoft, lists folders, and writes one small text file (`advantage-onedrive-connect.txt`) into the folder the gym picks. Lesson day packages still save to Google Drive. Google Photos and iCloud are not connected yet.

The browser uses [MSAL browser](https://github.com/AzureAD/microsoft-authentication-library-for-js) (auth code + PKCE) and Microsoft Graph. Tapping **OneDrive** sends this window to Microsoft sign-in, then Microsoft sends it back to this site to pick a folder. A popup is not used: the installed app and phone browsers block it, so the tap looked like it did nothing. The application id is public in the PWA. **Do not ship a client secret** in the app, in Vite env, or in the owner UI.

## Build config

`VITE_MICROSOFT_CLIENT_ID` is the Azure **Application (client) ID**. CI or Cloudflare Pages injects it. The repo keeps it empty (see `.env.example`). Do not commit a production id.

Set it on the Cloudflare Pages project for **Production** (and Preview only if that exact origin is also on the Azure redirect list). Vite inlines `VITE_MICROSOFT_CLIENT_ID` when the site is built. `GET /api/microsoft-client` also reads `VITE_MICROSOFT_CLIENT_ID` or `MICROSOFT_CLIENT_ID` from the Pages environment at request time, so a name without the `VITE_` prefix still reaches the button. The response is only the public client id, and only when it is a GUID. Changing the variable requires a new Pages deployment.

On the live website an id saved in `localStorage` by a dev build (`matboard.pro.microsoftClientId`) is deleted and cannot override the company id.

The live site built after OneDrive shipped did not contain this id. The OneDrive button was on the Connect with list, styled like the other buttons, and `disabled`, so the tap did not open Microsoft.

`npm run dev` can show a dev-only **OneDrive app id** field when the variable is empty. Production builds omit that field.

## Azure app registration (once)

Do this in the [Microsoft Entra admin center](https://entra.microsoft.com/) (or Azure portal → Microsoft Entra ID → App registrations).

1. **App registrations → New registration.**
2. Name: **Advantage**.
3. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** (any Entra ID tenant + personal accounts). The app uses the `common` authority so a gym can use a personal OneDrive or a work account.
4. Redirect URI:
   - Platform: **Single-page application (SPA)**. Do not choose Web, and do not create a client secret.
   - URI: `https://advantagebjjtimer.com`
5. Register. Copy **Application (client) ID** into `VITE_MICROSOFT_CLIENT_ID` for the hosting build. Leave the client secret empty. This app never uses one.
6. **Authentication → Platform configurations → Single-page application.** Add these redirect URIs exactly, with no path and no trailing slash (they must match `window.location.origin`):
   - `https://advantagebjjtimer.com`
   - `https://www.advantagebjjtimer.com`
   - `http://localhost:5173` if engineers use `npm run dev`
7. Do **not** add `https://matboard.pages.dev`. Do not add other preview hosts unless that exact origin should be allowed to sign in. A host that is not on this list cannot finish OneDrive sign-in.
8. Leave **Access tokens** and **ID tokens** (implicit grant) unchecked. MSAL uses the auth code flow with PKCE.
9. There is no separate “Authorized JavaScript origins” box (that is Google). OneDrive uses the SPA redirect URIs above.
10. **API permissions → Add a permission → Microsoft Graph → Delegated permissions:**
    - `User.Read` (usually already listed)
    - `Files.ReadWrite` (read and write files in the signed-in user’s own OneDrive)
11. Do not add application permissions. Do not grant access to all files in the organization (`Files.ReadWrite.All`) for this milestone.
12. Personal Microsoft accounts (Outlook, Hotmail, Live) can consent themselves when they tap **OneDrive**. A work or school tenant may ask an admin to consent to `Files.ReadWrite` before that tenant can connect. Admin consent is not required for personal OneDrive.

## What the gym owner sees

1. Tap **Connect with**, then **OneDrive**.
2. This window goes to Microsoft. They sign in with the account that owns the gym folder and allow Advantage.
3. Microsoft sends them back to the same Advantage page. They pick a folder, or tap **Create Advantage Lesson Plans**.
4. Advantage writes `advantage-onedrive-connect.txt` in that folder. The file stays in their OneDrive.

If this deployment has no Microsoft client id, the OneDrive button stays disabled and the owner sees: OneDrive is not available on this build yet — contact Advantage.

## Common errors

| What Microsoft shows | What it usually means |
| --- | --- |
| `AADSTS50011` / redirect URI mismatch | The site origin is not on the SPA redirect URI list, or a trailing slash / path does not match `window.location.origin`. |
| `AADSTS700016` / application was not found | `VITE_MICROSOFT_CLIENT_ID` is missing or wrong. |
| Need admin approval | The account is a work or school tenant that has not consented to `Files.ReadWrite`. Personal accounts should not see this. |
| Button does nothing and Microsoft never opens | The deployment has no client id. Set `VITE_MICROSOFT_CLIENT_ID` (or `MICROSOFT_CLIENT_ID`) on Cloudflare Pages and deploy again. |
| `AADSTS50011` on a `*.pages.dev` preview | That preview origin is not a redirect URI. Finish the connection on `https://advantagebjjtimer.com` or `https://www.advantagebjjtimer.com`. |

The gym owner still sees the plain sign-in sentence: Microsoft did not finish sign-in. Try again, or ask whoever set up Advantage to allow this website. A local dev build may add a short hint.

## What this milestone does not do

Lesson JSON, training videos, class photos, class history, and Media Console still use Google Drive. OneDrive `save` and `open` on the storage connector are the shared pipe (text file in, names out). They are not day-package parity.
