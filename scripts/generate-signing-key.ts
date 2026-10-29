/**
 * Print an ES256 private key for the ENTITLEMENT_SIGNING_KEY Cloudflare secret.
 * The public key is derived by the server. Nothing is written to disk.
 *
 *   node --experimental-strip-types scripts/generate-signing-key.ts
 */
const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const privateJwk = await crypto.subtle.exportKey('jwk', key.privateKey);
const publicJwk = await crypto.subtle.exportKey('jwk', key.publicKey);
console.log('Paste the private JWK into the Cloudflare secret ENTITLEMENT_SIGNING_KEY.');
console.log('Do not commit it. The site publishes only the public key from GET /api/config.');
console.log('');
console.log(JSON.stringify(privateJwk));
console.log('');
console.log('Public key (for your notes only; the server derives this itself):');
console.log(JSON.stringify({ kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y }));
