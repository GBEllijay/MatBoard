import { attachPresentation } from './matchStore';

type PresentationRequestCtor = new (urls: string[]) => {
  start: () => Promise<{
    send: (data: string) => void;
    addEventListener?: (type: string, listener: (ev: MessageEvent) => void) => void;
    onmessage?: ((ev: MessageEvent) => void) | null;
  }>;
};

export function displayUrl(): string {
  return new URL('/match', window.location.origin).toString();
}

export function controllerUrl(): string {
  return new URL('/match/control', window.location.origin).toString();
}

export async function openOrCastDisplay(): Promise<'cast' | 'window'> {
  const url = displayUrl();
  const Request = (window as typeof window & { PresentationRequest?: PresentationRequestCtor }).PresentationRequest;
  if (Request) {
    try {
      const request = new Request([url]);
      const connection = await request.start();
      attachPresentation(connection);
      return 'cast';
    } catch (err) {
      const name = (err as DOMException | undefined)?.name;
      if (name !== 'NotAllowedError' && name !== 'AbortError') {
        console.warn('Presentation request failed, opening a window instead', err);
      } else if (name === 'AbortError' || name === 'NotAllowedError') {
        throw err;
      }
    }
  }
  window.open(url, 'matboard-display', 'popup,noopener,noreferrer,width=1280,height=720');
  return 'window';
}

export function openDisplayWindow(): void {
  window.open(displayUrl(), 'matboard-display', 'popup,noopener,noreferrer,width=1280,height=720');
}
