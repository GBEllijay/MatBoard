/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_PRO_UNLOCK_CODE?: string;
  readonly VITE_COACH_UNLOCK_CODE?: string;
  /**
   * Advantage-owned Google web client id for Drive sign-in.
   * Public in the browser. Set at build time. Never a client secret.
   */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
