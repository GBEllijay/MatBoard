export type NameFit = { size: number; wrap: boolean };

/**
 * Shrink a name on one line down to `lineFloor`, then allow two lines and
 * shrink again down to `wrapFloor`. `overflow` is true while the text still spills.
 */
export function fitNameBox(
  base: number,
  overflow: (size: number, wrap: boolean) => boolean,
  lineFloor = 0.72,
  wrapStart = 0.86,
  wrapFloor = 0.5,
): NameFit {
  let size = base;
  const lineStop = base * lineFloor;
  while (overflow(size, false) && size > lineStop) size -= 1;
  if (!overflow(size, false)) return { size, wrap: false };
  size = Math.max(base * wrapStart, base * wrapFloor);
  const wrapStop = base * wrapFloor;
  while (overflow(size, true) && size > wrapStop) size -= 1;
  return { size, wrap: true };
}

/** Apply the fit to one live name node. The base size comes from the current CSS. */
export function fitNameElement(el: HTMLElement, lineFloor: number): void {
  el.style.fontSize = '';
  el.classList.remove('is-wrap');
  const base = parseFloat(getComputedStyle(el).fontSize);
  if (!Number.isFinite(base) || base <= 0) return;
  const overflow = (size: number, wrap: boolean) => {
    el.style.fontSize = `${size}px`;
    el.classList.toggle('is-wrap', wrap);
    const wide = el.scrollWidth > el.clientWidth + 1;
    const tall = wrap && el.scrollHeight > el.clientHeight + 2;
    return wide || tall;
  };
  const fit = fitNameBox(base, overflow, lineFloor);
  el.style.fontSize = `${fit.size}px`;
  el.classList.toggle('is-wrap', fit.wrap);
}

export function fitNamesIn(root: ParentNode, lineFloor: number): void {
  root.querySelectorAll<HTMLElement>('.name').forEach((el) => fitNameElement(el, lineFloor));
}
