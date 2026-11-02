import { ChangeDetectionStrategy, Component, ElementRef, input, output, signal, viewChild } from '@angular/core';

const MAX_SCALE = 6;

/** Image that zooms with a two-finger pinch, the mouse wheel or a double tap, and pans while zoomed. */
@Component({
  selector: 'app-zoom-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      #frame
      class="relative w-full h-full overflow-hidden rounded-lg bg-base-300 touch-none select-none"
      [class]="scale() > 1 ? 'cursor-grab' : 'cursor-zoom-in'"
      (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)" (pointercancel)="up($event)"
      (wheel)="wheel($event)" (dblclick)="toggle()"
    >
      <img
        [src]="src()" [alt]="alt()" draggable="false" (load)="loaded.emit($event)"
        class="w-full h-full object-contain pointer-events-none origin-center will-change-transform"
        [style.transform]="'translate(' + tx() + 'px,' + ty() + 'px) scale(' + scale() + ')'"
        [style.transition]="busy ? 'none' : 'transform .2s ease'"
      />
      @if (scale() > 1) {
        <button type="button" class="absolute top-2 right-2 btn btn-xs glass-strong" (pointerdown)="$event.stopPropagation()" (click)="reset()">Reset</button>
      } @else {
        <span class="absolute bottom-1 right-2 text-[10px] text-white/80 drop-shadow pointer-events-none">Pinch or double-tap to zoom</span>
      }
    </div>
  `,
})
export class ZoomImage {
  src = input.required<string>();
  alt = input('');
  loaded = output<Event>();

  scale = signal(1);
  tx = signal(0);
  ty = signal(0);
  busy = false;

  private frame = viewChild.required<ElementRef<HTMLElement>>('frame');
  private pointers = new Map<number, { x: number; y: number }>();
  private lastDist = 0;

  down(e: PointerEvent) {
    e.stopPropagation();
    this.frame().nativeElement.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.busy = true;
    this.lastDist = this.distance();
  }

  move(e: PointerEvent) {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    e.stopPropagation();
    const next = { x: e.clientX, y: e.clientY };
    if (this.pointers.size >= 2) {
      this.pointers.set(e.pointerId, next);
      const d = this.distance();
      if (this.lastDist) this.zoomBy(d / this.lastDist);
      this.lastDist = d;
    } else if (this.scale() > 1) {
      this.pointers.set(e.pointerId, next);
      this.pan(next.x - prev.x, next.y - prev.y);
    }
  }

  up(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    this.lastDist = this.distance();
    if (!this.pointers.size) this.busy = false;
  }

  wheel(e: WheelEvent) {
    e.preventDefault();
    this.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }

  toggle() { this.scale() > 1 ? this.reset() : this.zoomBy(2.5); }

  reset() {
    this.scale.set(1);
    this.tx.set(0);
    this.ty.set(0);
  }

  private distance() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private zoomBy(factor: number) {
    const s = Math.min(MAX_SCALE, Math.max(1, this.scale() * factor));
    this.scale.set(s);
    this.pan(0, 0);
  }

  private pan(dx: number, dy: number) {
    const el = this.frame().nativeElement;
    const maxX = ((this.scale() - 1) * el.clientWidth) / 2;
    const maxY = ((this.scale() - 1) * el.clientHeight) / 2;
    this.tx.set(Math.min(maxX, Math.max(-maxX, this.tx() + dx)));
    this.ty.set(Math.min(maxY, Math.max(-maxY, this.ty() + dy)));
  }
}
