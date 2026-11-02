export type Side = 'top' | 'bottom' | 'left' | 'right';

const MARGIN = 8;

/** Positions a shown popover element next to an anchor: tries the preferred side, flips if it doesn't fit, then clamps to the viewport. */
export function placeFloating(el: HTMLElement, anchor: DOMRect, prefer: Side = 'bottom', gap = 8): void {
  el.style.left = '0px';
  el.style.top = '0px';
  const { width: w, height: h } = el.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const room: Record<Side, number> = {
    top: anchor.top - MARGIN,
    bottom: vh - anchor.bottom - MARGIN,
    left: anchor.left - MARGIN,
    right: vw - anchor.right - MARGIN,
  };
  const need = (s: Side) => (s === 'top' || s === 'bottom' ? h : w) + gap;
  const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  const order: Side[] = [prefer, opposite[prefer], 'bottom', 'top', 'right', 'left'];
  const side = order.find((s) => room[s] >= need(s)) ?? (Object.keys(room) as Side[]).sort((a, b) => room[b] - room[a])[0];

  let x: number;
  let y: number;
  if (side === 'top' || side === 'bottom') {
    x = anchor.left + anchor.width / 2 - w / 2;
    y = side === 'top' ? anchor.top - h - gap : anchor.bottom + gap;
  } else {
    y = anchor.top + anchor.height / 2 - h / 2;
    x = side === 'left' ? anchor.left - w - gap : anchor.right + gap;
  }
  el.style.left = `${Math.max(MARGIN, Math.min(x, vw - w - MARGIN))}px`;
  el.style.top = `${Math.max(MARGIN, Math.min(y, vh - h - MARGIN))}px`;
}
