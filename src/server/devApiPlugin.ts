import { loadEnv, type Connect, type Plugin } from 'vite';
import { fileEntitlementStore } from './fileEntitlements.ts';
import { handleCheckoutConfirm } from './checkoutConfirm.ts';
import { handleCodeRedeem } from './codeRedeem.ts';
import { emailSenderFromEnv } from './emailSender.ts';
import { handleCheckout, handleEntitlement, handleWebhook } from './handlers.ts';
import { handleOwnerTest } from './ownerTest.ts';
import { handlePublicConfig } from './publicConfig.ts';
import { handleRestoreRequest, handleRestoreVerify, handleRevokeOtherDevices } from './restoreAccess.ts';
import { handleSessionRedeem } from './sessionRedeem.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { handleTokenRefresh } from './tokenRefresh.ts';
import { MemoryRedemptionLedger } from './redemptionLedger.ts';
import { MICROSOFT_CLIENT_API, publicMicrosoftClientIdFromEnv } from '../lib/microsoftClientPublic.ts';
import {
  API_CHECKOUT_CONFIRM_PATH,
  API_CHECKOUT_PATH,
  API_CODES_REDEEM_PATH,
  API_CONFIG_PATH,
  API_DEVICES_REVOKE_PATH,
  API_ENTITLEMENT_PATH,
  API_OWNER_TEST_PATH,
  API_RESTORE_REQUEST_PATH,
  API_RESTORE_VERIFY_PATH,
  API_SESSION_REDEEM_PATH,
  API_TOKEN_REFRESH_PATH,
  API_WEBHOOK_PATH,
} from './routes.ts';
import type { EntitlementStore } from './entitlements.ts';
import type { StripeRuntimeEnv } from './stripeCheckout.ts';

type HeaderMap = Record<string, string | string[] | undefined>;

type NodeRequest = {
  url?: string;
  method?: string;
  headers: HeaderMap;
  on(event: 'data', listener: (chunk: Uint8Array | string) => void): void;
  on(event: 'end', listener: () => void): void;
  on(event: 'error', listener: (error: unknown) => void): void;
};

type NodeResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: Uint8Array | string): void;
};

function readEnv(mode: string, root: string): Record<string, string> {
  const file = loadEnv(mode, root, '');
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const names = new Set([...Object.keys(file), ...Object.keys(proc)]);
  const merged: Record<string, string> = {};
  for (const name of names) merged[name] = file[name] || proc[name] || '';
  return merged;
}

function stripeEnv(mode: string, root: string): StripeRuntimeEnv & {
  CODE_HASH_PEPPER?: string;
  CODE_CATALOG?: string;
  OWNER_TEST_SECRET?: string;
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_PROVIDER?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  LEGACY_AMNESTY_ENDS_AT?: string;
  MIN_APP_VERSION?: string;
} {
  const env = readEnv(mode, root);
  const pick = (name: string) => env[name] || '';
  return {
    STRIPE_SECRET_KEY: pick('STRIPE_SECRET_KEY'),
    STRIPE_WEBHOOK_SECRET: pick('STRIPE_WEBHOOK_SECRET'),
    STRIPE_PRICE_WHITE: pick('STRIPE_PRICE_WHITE'),
    STRIPE_PRICE_STUDENT: pick('STRIPE_PRICE_STUDENT'),
    STRIPE_PRICE_COACH: pick('STRIPE_PRICE_COACH'),
    STRIPE_PRICE_PRO: pick('STRIPE_PRICE_PRO'),
    STRIPE_PRICE_PRO_MONTHLY: pick('STRIPE_PRICE_PRO_MONTHLY'),
    STRIPE_PRICE_PRO_MONTHLY_DISCOUNT: pick('STRIPE_PRICE_PRO_MONTHLY_DISCOUNT'),
    STRIPE_SUCCESS_URL: pick('STRIPE_SUCCESS_URL'),
    STRIPE_CANCEL_URL: pick('STRIPE_CANCEL_URL'),
    CODE_HASH_PEPPER: pick('CODE_HASH_PEPPER'),
    CODE_CATALOG: pick('CODE_CATALOG'),
    OWNER_TEST_SECRET: pick('OWNER_TEST_SECRET'),
    ENTITLEMENT_SIGNING_KEY: pick('ENTITLEMENT_SIGNING_KEY'),
    ENTITLEMENT_KEY_ID: pick('ENTITLEMENT_KEY_ID'),
    RESEND_API_KEY: pick('RESEND_API_KEY'),
    EMAIL_FROM: pick('EMAIL_FROM'),
    EMAIL_PROVIDER: pick('EMAIL_PROVIDER'),
    TURNSTILE_SECRET_KEY: pick('TURNSTILE_SECRET_KEY'),
    TURNSTILE_SITE_KEY: pick('TURNSTILE_SITE_KEY'),
    LEGACY_AMNESTY_ENDS_AT: pick('LEGACY_AMNESTY_ENDS_AT'),
    MIN_APP_VERSION: pick('MIN_APP_VERSION'),
  };
}

function projectRoot(): string {
  const proc = (globalThis as { process?: { cwd?: () => string } }).process;
  return proc?.cwd?.() ?? '.';
}

function readBody(req: NodeRequest): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    req.on('data', (chunk) => {
      chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
    });
    req.on('end', () => {
      const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(out);
    });
    req.on('error', () => reject(new Error('Could not read the request body.')));
  });
}

function headerValue(headers: HeaderMap, name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function toHeaders(headers: HeaderMap): Headers {
  const next = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') next.set(key, value);
    else if (Array.isArray(value)) {
      for (const item of value) next.append(key, item);
    }
  }
  return next;
}

async function toWebRequest(req: NodeRequest): Promise<Request> {
  const forwarded = headerValue(req.headers, 'x-forwarded-proto').split(',')[0]?.trim();
  const proto = forwarded || 'http';
  const host = headerValue(req.headers, 'host') || 'localhost';
  const url = `${proto}://${host}${req.url || '/'}`;
  const method = req.method || 'GET';
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : new TextDecoder().decode(await readBody(req));
  return new Request(url, { method, headers: toHeaders(req.headers), body });
}

async function writeResponse(res: NodeResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.end(new Uint8Array(await response.arrayBuffer()));
}

const devLedger = new MemoryRedemptionLedger();
const devDb = sqliteD1();

function attach(
  middlewares: Connect.Server,
  env: ReturnType<typeof stripeEnv>,
  microsoftEnv: { VITE_MICROSOFT_CLIENT_ID?: string; MICROSOFT_CLIENT_ID?: string },
  store: EntitlementStore,
) {
  middlewares.use(async (req, res, next) => {
    const path = (req.url ?? '').split('?')[0];
    if (path === MICROSOFT_CLIENT_API && (req.method ?? 'GET').toUpperCase() === 'GET') {
      res.statusCode = 200;
      res.setHeader('cache-control', 'no-store');
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ clientId: publicMicrosoftClientIdFromEnv(microsoftEnv) }));
      return;
    }
    const api =
      path === API_CHECKOUT_PATH ||
      path === API_ENTITLEMENT_PATH ||
      path === API_WEBHOOK_PATH ||
      path === API_CODES_REDEEM_PATH ||
      path === API_OWNER_TEST_PATH ||
      path === API_CHECKOUT_CONFIRM_PATH ||
      path === API_CONFIG_PATH ||
      path === API_SESSION_REDEEM_PATH ||
      path === API_TOKEN_REFRESH_PATH ||
      path === API_RESTORE_REQUEST_PATH ||
      path === API_RESTORE_VERIFY_PATH ||
      path === API_DEVICES_REVOKE_PATH;
    if (!api) {
      next();
      return;
    }
    try {
      const request = await toWebRequest(req as NodeRequest);
      const codeServices = {
        db: devDb,
        signingKey: env.ENTITLEMENT_SIGNING_KEY,
        keyId: env.ENTITLEMENT_KEY_ID,
      };
      const response =
        path === API_CHECKOUT_PATH
          ? await handleCheckout(request, env, fetch, store)
          : path === API_WEBHOOK_PATH
            ? await handleWebhook(request, env, store, () => new Date(), {
                db: devDb,
                pepper: env.CODE_HASH_PEPPER,
                fetchImpl: fetch,
              })
            : path === API_CODES_REDEEM_PATH
              ? await handleCodeRedeem(request, env, null, devLedger, () => new Date(), codeServices)
              : path === API_OWNER_TEST_PATH
                ? await handleOwnerTest(request, env, null, () => new Date(), codeServices)
                : path === API_CHECKOUT_CONFIRM_PATH
                  ? await handleCheckoutConfirm(request, env)
                  : path === API_CONFIG_PATH
                    ? handlePublicConfig(request, env, devDb)
                    : path === API_SESSION_REDEEM_PATH
                      ? await handleSessionRedeem(request, env, devDb)
                      : path === API_TOKEN_REFRESH_PATH
                        ? await handleTokenRefresh(request, env, devDb)
                        : path === API_RESTORE_REQUEST_PATH
                          ? await handleRestoreRequest(request, env, devDb, emailSenderFromEnv(env))
                          : path === API_RESTORE_VERIFY_PATH
                            ? await handleRestoreVerify(request, env, devDb)
                            : path === API_DEVICES_REVOKE_PATH
                              ? await handleRevokeOtherDevices(request, env, devDb)
                              : await handleEntitlement(request, store, env);
      await writeResponse(res as NodeResponse, response);
    } catch {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Purchase API failed.' }));
    }
  });
}

/** Serves the purchase API during `npm run dev` and `npm run preview`. */
export function whitePurchaseApiPlugin(): Plugin {
  return {
    name: 'white-purchase-api',
    configureServer(server) {
      const root = server.config.root || projectRoot();
      const raw = readEnv(server.config.mode, root);
      attach(
        server.middlewares,
        stripeEnv(server.config.mode, root),
        raw,
        fileEntitlementStore(`${root}/.data/white-entitlements.json`),
      );
    },
    configurePreviewServer(server) {
      const root = server.config.root || projectRoot();
      const raw = readEnv(server.config.mode, root);
      attach(
        server.middlewares,
        stripeEnv(server.config.mode, root),
        raw,
        fileEntitlementStore(`${root}/.data/white-entitlements.json`),
      );
    },
  };
}
