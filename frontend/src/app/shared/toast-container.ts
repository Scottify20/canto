import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ToastService } from '../core/toast.service';
import { Icon } from './icon';

const DISMISS_PX = 70;

/** Toasts sit at the top of the screen above every dialog; each has a close button and can be swiped away. */
@Component({
  selector: 'app-toast-container',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-x-2 sm:inset-x-auto sm:right-4 top-[max(0.5rem,env(safe-area-inset-top))] z-[2000] flex flex-col gap-2 pointer-events-none sm:w-96" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div
          class="alert anim-toast shadow-lg backdrop-blur-md pointer-events-auto select-none touch-pan-y py-2 pr-1"
          [class.alert-success]="t.kind === 'success'"
          [class.alert-error]="t.kind === 'error'"
          [class.alert-warning]="t.kind === 'warning'"
          [class.alert-info]="t.kind === 'info'"
          [style.transform]="drag()?.id === t.id ? 'translateX(' + drag()!.dx + 'px)' : null"
          [style.opacity]="drag()?.id === t.id ? 1 - Math.min(1, Math.abs(drag()!.dx) / 200) : null"
          [style.transition]="drag()?.id === t.id ? 'none' : 'transform .2s, opacity .2s'"
          (pointerdown)="down($event, t.id)" (pointermove)="move($event, t.id)" (pointerup)="up(t.id)" (pointercancel)="drag.set(null)"
        >
          <app-icon [name]="t.kind === 'success' ? 'ok' : t.kind === 'error' ? 'no' : t.kind === 'warning' ? 'warn' : 'info'" />
          <span class="whitespace-pre-line break-words min-w-0">{{ t.text }}</span>
          <button type="button" class="btn btn-ghost btn-xs btn-circle" aria-label="Dismiss" (pointerdown)="$event.stopPropagation()" (click)="toasts.dismiss(t.id)"><app-icon name="x" [size]="14" /></button>
        </div>
      }
    </div>
  `,
})
export class ToastContainer {
  toasts = inject(ToastService);
  protected readonly Math = Math;
  protected drag = signal<{ id: number; dx: number } | null>(null);
  private startX = 0;
  private active = false;

  down(e: PointerEvent, id: number) {
    this.startX = e.clientX;
    this.active = true;
    this.drag.set({ id, dx: 0 });
  }
  move(e: PointerEvent, id: number) {
    if (!this.active) return;
    const dx = e.clientX - this.startX;
    if (Math.abs(dx) > 6) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.drag.set({ id, dx });
  }
  up(id: number) {
    const d = this.drag();
    this.active = false;
    this.drag.set(null);
    if (d && Math.abs(d.dx) >= DISMISS_PX) this.toasts.dismiss(id);
  }
}
