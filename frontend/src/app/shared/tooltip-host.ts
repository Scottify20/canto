import { Side, placeFloating } from './floating';

/**
 * Replaces daisyUI's CSS tooltips (which overflow containers clip and other elements cover) with one popover in the
 * browser's top layer. Any element with `.tooltip[data-tip]` gets it on hover/focus (and briefly on touch).
 */
export function installTooltips(): void {
  const tip = document.createElement('div');
  tip.setAttribute('popover', 'manual');
  tip.setAttribute('role', 'tooltip');
  tip.className = 'floating-tip';
  document.body.appendChild(tip);

  let current: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay: ReturnType<typeof setTimeout> | undefined;
  const HOVER_DELAY_MS = 600;

  const hide = () => {
    clearTimeout(timer);
    clearTimeout(delay);
    current = null;
    if (tip.matches(':popover-open')) tip.hidePopover();
  };

  const show = (target: HTMLElement, autoHideMs = 0) => {
    const text = target.getAttribute('data-tip');
    if (!text) return hide();
    if (current === target && tip.matches(':popover-open')) return;
    clearTimeout(timer);
    current = target;
    tip.textContent = text;
    if (!tip.matches(':popover-open')) tip.showPopover();
    const side = (['top', 'bottom', 'left', 'right'] as Side[]).find((s) => target.classList.contains(`tooltip-${s}`)) ?? 'top';
    placeFloating(tip, target.getBoundingClientRect(), side);
    if (autoHideMs) timer = setTimeout(hide, autoHideMs);
  };

  const find = (e: Event) => (e.target instanceof Element ? (e.target.closest('.tooltip[data-tip]') as HTMLElement | null) : null);

  document.addEventListener('pointerover', (e) => {
    const el = find(e);
    if (!el) return;
    if ((e as PointerEvent).pointerType !== 'mouse') return;
    if (current === el) return;
    clearTimeout(delay);
    delay = setTimeout(() => show(el), HOVER_DELAY_MS);
  });
  document.addEventListener('pointerout', (e) => {
    const el = find(e);
    if (el && !el.contains((e as PointerEvent).relatedTarget as Node | null)) hide();
  });
  // Keyboard focus only: a tap also focuses the button, which must not pop the tooltip.
  document.addEventListener('focusin', (e) => {
    const el = find(e);
    if (el && el.matches(':focus-visible')) show(el);
  });

  // Touch: a long press shows the tooltip; a plain tap just presses the button.
  const LONG_PRESS_MS = 500;
  let press: ReturnType<typeof setTimeout> | undefined;
  let pressAt = { x: 0, y: 0 };
  let suppressClick = false;
  const cancelPress = () => clearTimeout(press);
  document.addEventListener('pointerdown', (e) => {
    const pe = e as PointerEvent;
    if (pe.pointerType === 'mouse') return;
    suppressClick = false;
    const el = find(e);
    cancelPress();
    if (!el) return;
    pressAt = { x: pe.clientX, y: pe.clientY };
    press = setTimeout(() => {
      suppressClick = true;
      show(el, 2500);
    }, LONG_PRESS_MS);
  });
  document.addEventListener('pointermove', (e) => {
    if (Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 10) cancelPress();
  }, { passive: true });
  document.addEventListener('pointerup', cancelPress);
  document.addEventListener('pointercancel', cancelPress);
  document.addEventListener('click', (e) => {
    if (!suppressClick) return;
    suppressClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  document.addEventListener('contextmenu', (e) => { if (find(e) && suppressClick) e.preventDefault(); });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', (e) => {
    if ((e as PointerEvent).pointerType === 'mouse' || !find(e)) hide();
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && hide());
  document.addEventListener('scroll', hide, { capture: true, passive: true });
  window.addEventListener('resize', hide);
}

/** Nudges daisyUI dropdown menus back inside the screen (they otherwise run off the edge on phones) and caps their height. */
export function installDropdownGuard(): void {
  const fit = (menu: HTMLElement) => {
    menu.style.translate = '';
    menu.style.maxHeight = '';
    const r = menu.getBoundingClientRect();
    if (!r.width) return;
    const vw = document.documentElement.clientWidth;
    const dx = r.right > vw - 8 ? vw - 8 - r.right : r.left < 8 ? 8 - r.left : 0;
    if (dx) menu.style.translate = `${dx}px 0`;
    menu.style.maxHeight = `${Math.max(160, window.innerHeight - r.top - 12)}px`;
    menu.style.overflowY = 'auto';
  };
  const schedule = (e: Event) => {
    const menu = e.target instanceof Element ? e.target.closest('.dropdown')?.querySelector<HTMLElement>(':scope > .dropdown-content') : null;
    if (menu) requestAnimationFrame(() => requestAnimationFrame(() => fit(menu)));
  };
  document.addEventListener('focusin', schedule);
  document.addEventListener('click', schedule);
  window.addEventListener('resize', () => document.querySelectorAll<HTMLElement>('.dropdown-content').forEach(fit));
}
