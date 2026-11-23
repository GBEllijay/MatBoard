import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Advantage White iOS wrapper.
 *
 * Bundle ID (locked, cannot change once the app is in App Store Connect):
 *   com.advantagebjjtimer.white
 *   (advantage + bjj + timer, two j's, then .white)
 *
 * appName / the iOS display name is "Advantage White" for now. The owner can
 * change the display name later without changing the bundle ID.
 */
const config: CapacitorConfig = {
  appId: 'com.advantagebjjtimer.white',
  appName: 'Advantage White',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
};

export default config;
