/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /**
   * Advantage-owned Google web client id for Drive sign-in.
   * Public in the browser. Set at build time. Never a client secret.
   */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /**
   * Advantage-owned Microsoft Entra application (client) id for OneDrive.
   * Public in the browser. Set at build time. Never a client secret.
   */
  readonly VITE_MICROSOFT_CLIENT_ID?: string;
}
