/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_PRO_UNLOCK_CODE?: string;
  readonly VITE_COACH_UNLOCK_CODE?: string;
  /** Google Cloud web client id for Drive sign-in. Public in the browser. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
