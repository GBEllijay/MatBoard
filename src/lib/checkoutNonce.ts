import { sha256Hex } from './entitlementToken.ts';

const NONCE_KEY = 'advantage.checkout.nonce';

function session(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** Random nonce kept in this tab. Checkout stores only the hash. */
export function currentCheckoutNonce(): string {
  const store = session();
  const existing = store?.getItem(NONCE_KEY) ?? '';
  if (existing) return existing;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const nonce = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
  try {
    store?.setItem(NONCE_KEY, nonce);
  } catch {
    /* private mode */
  }
  return nonce;
}

export async function checkoutNonceHash(): Promise<string> {
  return sha256Hex(currentCheckoutNonce());
}
