import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  applyEntitlement,
  applyProEntitlement,
  emptyEntitlementIndex,
  entitlementByEmail,
  entitlementBySession,
  parseEntitlementIndex,
  proEntitlementByEmail,
  proEntitlementBySession,
  proEntitlementBySubscription,
  type EntitlementStore,
  type ProEntitlement,
  type WhiteEntitlement,
} from './entitlements.ts';

/**
 * Local dev store. Cloudflare Pages uses the WHITE_ENTITLEMENTS KV binding instead.
 * One JSON file so `npm run dev` can record a purchase without a KV namespace.
 */
export function fileEntitlementStore(filePath: string): EntitlementStore {
  let chain: Promise<unknown> = Promise.resolve();

  const run = <T>(fn: () => T): Promise<T> => {
    const next = chain.then(() => fn());
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  const read = () => {
    if (!existsSync(filePath)) return emptyEntitlementIndex();
    return parseEntitlementIndex(readFileSync(filePath, 'utf8'));
  };

  const write = (index: ReturnType<typeof read>) => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(index, null, 2)}\n`);
  };

  return {
    save(record: WhiteEntitlement) {
      return run(() => {
        const index = read();
        const stored = applyEntitlement(index, record);
        write(index);
        return stored;
      });
    },
    findByEmail(email) {
      return run(() => entitlementByEmail(read(), email));
    },
    findBySessionId(sessionId) {
      return run(() => entitlementBySession(read(), sessionId));
    },
    savePro(record: ProEntitlement) {
      return run(() => {
        const index = read();
        const stored = applyProEntitlement(index, record);
        write(index);
        return stored;
      });
    },
    findProByEmail(email) {
      return run(() => proEntitlementByEmail(read(), email));
    },
    findProBySessionId(sessionId) {
      return run(() => proEntitlementBySession(read(), sessionId));
    },
    findProBySubscriptionId(subscriptionId) {
      return run(() => proEntitlementBySubscription(read(), subscriptionId));
    },
  };
}
