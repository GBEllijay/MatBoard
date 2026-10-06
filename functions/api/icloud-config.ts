import { publicAppleCloudKitConfigFromEnv } from '../../src/lib/appleCloudKitPublic.ts';

type ICloudConfigEnv = {
  VITE_APPLE_CLOUDKIT_CONTAINER?: string;
  APPLE_CLOUDKIT_CONTAINER?: string;
  VITE_APPLE_CLOUDKIT_API_TOKEN?: string;
  APPLE_CLOUDKIT_API_TOKEN?: string;
  VITE_APPLE_CLOUDKIT_ENVIRONMENT?: string;
  APPLE_CLOUDKIT_ENVIRONMENT?: string;
};

/**
 * Public CloudKit container, API token, and environment. No private key.
 * Pages Functions read the Cloudflare env at request time.
 */
export async function onRequestGet(context: { env: ICloudConfigEnv }): Promise<Response> {
  return Response.json(publicAppleCloudKitConfigFromEnv(context.env), {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
}
