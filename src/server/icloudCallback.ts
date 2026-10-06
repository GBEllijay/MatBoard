/**
 * Browser bridge for Apple’s CloudKit sign-in redirect.
 * Apple appends the web auth token to the query string. This response
 * moves that token into session storage and returns to Advantage.
 * It does not store the token, and it does not call iCloud.
 */

import {
  ICLOUD_RESUME_ERROR_KEY,
  ICLOUD_RESUME_KEY,
  ICLOUD_RETURN_KEY,
  ICLOUD_SIGN_IN_FAILED,
  ICLOUD_TOKEN_KEY,
  isICloudWebAuthToken,
} from '../lib/appleCloudKitPublic.ts';

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function icloudCallbackHtml(input: { token: string | null; failure: string | null }): string {
  const token = input.token && isICloudWebAuthToken(input.token) ? input.token : null;
  const failure = token ? null : input.failure || ICLOUD_SIGN_IN_FAILED;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<title>Connecting iCloud</title>
</head>
<body>
<p>Returning to Advantage…</p>
<script>
(function () {
  var token = ${jsonForScript(token)};
  var failure = ${jsonForScript(failure)};
  function safeReturn(value) {
    if (typeof value !== "string" || value.length > 300) return "/";
    if (value.charAt(0) !== "/" || value.charAt(1) === "/" || value.indexOf("://") !== -1 || value.indexOf("\\\\") !== -1) return "/";
    return value;
  }
  var back = "/";
  try {
    back = safeReturn(sessionStorage.getItem(${jsonForScript(ICLOUD_RETURN_KEY)}) || "/");
    if (token) {
      sessionStorage.setItem(${jsonForScript(ICLOUD_TOKEN_KEY)}, token);
      sessionStorage.setItem(${jsonForScript(ICLOUD_RESUME_KEY)}, "1");
      sessionStorage.removeItem(${jsonForScript(ICLOUD_RESUME_ERROR_KEY)});
    } else {
      sessionStorage.setItem(${jsonForScript(ICLOUD_RESUME_ERROR_KEY)}, failure || ${jsonForScript(ICLOUD_SIGN_IN_FAILED)});
      sessionStorage.removeItem(${jsonForScript(ICLOUD_RESUME_KEY)});
    }
  } catch (e) {}
  location.replace(back);
})();
</script>
</body>
</html>`;
}

export function icloudCallbackResponse(request: Request): Response {
  const url = new URL(request.url);
  const raw = url.searchParams.get('ckWebAuthToken') || url.searchParams.get('ckSession') || '';
  const token = isICloudWebAuthToken(raw) ? raw : null;
  const html = icloudCallbackHtml({ token, failure: token ? null : ICLOUD_SIGN_IN_FAILED });
  return new Response(html, {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/html; charset=utf-8',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    },
  });
}
