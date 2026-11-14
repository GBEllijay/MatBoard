/**
 * In-app browsers (Facebook, Instagram, Messenger, Google app, LINE, TikTok, Snapchat, LinkedIn,
 * X/Twitter, Gmail on iOS) keep their own storage and often wipe it on close, so a pass saved
 * there disappears. Safari and the home-screen app keep it.
 */
const IN_APP_RE = /\b(FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|GSA\/|Line\/|TikTok|musical_ly|Bytedance|Snapchat|LinkedInApp|Twitter|Pinterest|GmailApp|WhatsApp)\b/i;

export function isInAppBrowser(userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return IN_APP_RE.test(userAgent);
}

export function isIos(userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /\b(iPhone|iPad|iPod)\b/.test(userAgent);
}

export function inAppBrowserHintText(userAgent?: string): string {
  return isIos(userAgent)
    ? 'You are inside another app’s browser, which can forget your sign-in when it closes. Tap ••• or the share icon and choose Open in Safari, then Share › Add to Home Screen.'
    : 'You are inside another app’s browser, which can forget your sign-in when it closes. Open this page in your browser (menu › Open in browser), then add it to your home screen.';
}

export const IN_APP_HINT_DISMISS_KEY = 'advantage.inAppHint.dismissed.v1';
