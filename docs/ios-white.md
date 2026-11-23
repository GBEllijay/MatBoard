# Advantage White iOS (Capacitor)

Draft wrap of the existing React / Vite White edition for the App Store.
The website and Cloudflare Pages production builds are unchanged. Only a
build with `VITE_APP_TARGET=white` (see `npm run build:white-ios`) opens as
the native White app.

## Bundle ID

`com.advantagebjjtimer.white`

That spelling is locked: advantage + bjj (two j's) + timer + `.white`.
It cannot be changed once the app is in App Store Connect. The display
name is "Advantage White" and can be changed later without changing the
bundle ID.

Do not use `com.advantageapp.white` or `com.advantagebjtimer` (one j).

## What this draft includes

- Capacitor 8 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`) and
  `capacitor.config.ts` (`appId` as above, `appName` Advantage White,
  `webDir` `dist`).
- Native entry: the app opens on `/white`. The round timer is free.
  Scoreboard, brackets, Bracket Roster, and skins stay gated.
- Web Stripe checkout and email restore are hidden. `/buy` is an IAP
  stub with Unlock and Restore Purchases buttons that are not wired to
  StoreKit yet.
- `codemagic.yaml` workflow `ios-white`: manual trigger, `mac_mini_m2`,
  `npm ci`, White build, `npx cap sync ios`, signing profiles, IPA,
  upload to App Store Connect. Capacitor 8 uses an Xcode project with
  Swift Package Manager (no CocoaPods workspace). Integration and
  environment group names are placeholders.

## Owner steps before a first TestFlight build

1. Register the App ID `com.advantagebjjtimer.white` in [Apple Developer](https://developer.apple.com/account/resources/identifiers/list).
2. Create the app record in App Store Connect with that exact bundle ID.
   English store metadata is enough to ship; a Brazilian Portuguese
   store page can be added later.
3. Create the $15.99 non-consumable in-app purchase and a Restore path
   (StoreKit is not implemented in this draft).
4. Add an App Store Connect API key integration in Codemagic named
   `ADVANTAGE_APP_STORE_CONNECT`, and App Store distribution signing for
   this bundle ID. Optional environment group: `ADVANTAGE_IOS_SIGNING`.
5. Set the App Store Connect Apple ID (`APP_STORE_APPLE_ID`) in
   Codemagic if automatic build numbers are wanted.
6. Replace the placeholder iOS icons and fill App Store screenshots.
7. Confirm export compliance (`ITSAppUsesNonExemptEncryption` is set
   to `false` on the assumption that only HTTPS is used).
8. Trigger the `ios-white` workflow manually in Codemagic. Do not
   enable push or PR triggers until that is intentional.

## What is not done yet

- StoreKit 2 / the Capacitor IAP plugin
- The 1-free-match / 1-free-mock-tournament counters
- App Store Connect records, signing certificates, or a Codemagic account
- Android, Portuguese (pt-BR) localizations, or other editions
- A change to the public website

If `ios/` is not in this branch, `npx cap add ios` runs on Codemagic's
Mac before `cap sync`.
