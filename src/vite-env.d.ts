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
  /**
   * Advantage-owned Microsoft Entra application (client) id for OneDrive.
   * Public in the browser. Set at build time. Never a client secret.
   */
  readonly VITE_MICROSOFT_CLIENT_ID?: string;
  /**
   * Advantage CloudKit container id, for example iCloud.com.advantageapp.matboard.
   * Public in the browser. Set at build time. Never a private key.
   */
  readonly VITE_APPLE_CLOUDKIT_CONTAINER?: string;
  /**
   * CloudKit web API token from the CloudKit Dashboard. Public and limited to
   * this site’s domains. Never a server-to-server private key or a .p8 key.
   */
  readonly VITE_APPLE_CLOUDKIT_API_TOKEN?: string;
  /** `development` until the schema is deployed, then `production`. */
  readonly VITE_APPLE_CLOUDKIT_ENVIRONMENT?: string;
}
