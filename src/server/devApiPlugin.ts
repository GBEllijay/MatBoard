import { loadEnv, type Connect, type Plugin } from 'vite';
import { fileEntitlementStore } from './fileEntitlements.ts';
import { handleCheckout, handleEntitlement, handleWebhook } from './handlers.ts';
import { API_CHECKOUT_PATH, API_ENTITLEMENT_PATH, API_WEBHOOK_PATH } from './routes.ts';
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

function stripeEnv(mode: string, root: string): StripeRuntimeEnv {
  const file = loadEnv(mode, root, '');
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const pick = (name: keyof StripeRuntimeEnv) => file[name] || proc?.[name] || '';
  return {
    STRIPE_SECRET_KEY: pick('STRIPE_SECRET_KEY'),
    STRIPE_WEBHOOK_SECRET: pick('STRIPE_WEBHOOK_SECRET'),
    STRIPE_PRICE_WHITE: pick('STRIPE_PRICE_WHITE'),
    STRIPE_SUCCESS_URL: pick('STRIPE_SUCCESS_URL'),
    STRIPE_CANCEL_URL: pick('STRIPE_CANCEL_URL'),
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

function attach(middlewares: Connect.Server, env: StripeRuntimeEnv, store: EntitlementStore) {
  middlewares.use(async (req, res, next) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== API_CHECKOUT_PATH && path !== API_ENTITLEMENT_PATH && path !== API_WEBHOOK_PATH) {
      next();
      return;
    }
    try {
      const request = await toWebRequest(req as NodeRequest);
      const response =
        path === API_CHECKOUT_PATH
          ? await handleCheckout(request, env)
          : path === API_WEBHOOK_PATH
            ? await handleWebhook(request, env, store)
            : await handleEntitlement(request, store);
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
      const env = stripeEnv(server.config.mode, server.config.root || projectRoot());
      const root = server.config.root || projectRoot();
      attach(server.middlewares, env, fileEntitlementStore(`${root}/.data/white-entitlements.json`));
    },
    configurePreviewServer(server) {
      const env = stripeEnv(server.config.mode, server.config.root || projectRoot());
      const root = server.config.root || projectRoot();
      attach(server.middlewares, env, fileEntitlementStore(`${root}/.data/white-entitlements.json`));
    },
  };
}
