import { ChangeDetectionStrategy, Component, OnDestroy, effect, computed, inject, output, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { LibraryStore } from '../../core/library.store';
import { TAG_LABELS, Track } from '../../core/models';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { ZoomImage } from '../../shared/zoom-image';

interface Decision { id: number; apply: boolean; timer: ReturnType<typeof setTimeout>; }

const UNDO_MS = 5000;
const THRESHOLD = 90;

/**
 * Tinder-style review of proposed tags. Swipe right (or →) applies, swipe left (or ←) skips.
 * A decision is only committed after the undo window, so fast swiping is never blocked.
 */
@Component({
  selector: 'app-swipe-review-modal',
  imports: [Modal, Icon, ZoomImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.arrowright)': 'decide(true)', '(document:keydown.arrowleft)': 'decide(false)', '(document:keydown.arrowdown)': 'later()' },
  template: `
    <app-modal title="Review matches" icon="sparkles" widthClass="max-w-md" (closed)="closed.emit()">
      @if (current(); as c) {
       <div class="flex flex-col h-full sm:h-[70vh]">
        <div class="flex items-center justify-between text-xs opacity-70 mb-2">
          <span>{{ queue().length }} left</span>
          <span class="hidden sm:inline">Use ← → keys or the buttons</span>
          <span class="sm:hidden">Swipe right to apply, left to skip, clock = later</span>
        </div>
        <div class="relative select-none grow min-h-0">
          <div
            class="relative h-full rounded-2xl border border-base-content/15 bg-base-100/90 shadow-xl cursor-grab active:cursor-grabbing [touch-action:pan-y]"
            [style.transform]="transform()"
            [style.transition]="dragging() ? 'none' : 'transform .25s ease'"
            (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)" (pointercancel)="cancel()"
          >
            <div class="absolute top-3 left-3 rotate-[-12deg] border-2 border-success text-success rounded px-2 font-bold pointer-events-none" [style.opacity]="dx() > 0 ? min1(dx() / THRESHOLD) : 0">APPLY</div>
            <div class="absolute top-3 right-3 rotate-[12deg] border-2 border-error text-error rounded px-2 font-bold pointer-events-none" [style.opacity]="dx() < 0 ? min1(-dx() / THRESHOLD) : 0">SKIP</div>
            <div class="h-full overflow-y-auto p-4 [touch-action:pan-y]">
            <div class="flex items-center gap-3 mb-3 pt-6">
              <button type="button" class="shrink-0 rounded-lg overflow-hidden" aria-label="Enlarge cover" (click)="big.set(!big())">
                <img [src]="api.coverUrl(c.track.id, 160, lib.coverVersion())" alt="" class="size-24 object-cover bg-base-300" draggable="false" />
              </button>
              <div class="min-w-0">
                <div class="font-bold truncate">{{ c.track.title }}</div>
                <div class="text-sm opacity-70 truncate">{{ c.track.artist }}</div>
                <div class="text-xs opacity-60 truncate">{{ c.similarity }}% match</div>
              </div>
            </div>
            @if (big()) {
              <app-zoom-image class="h-72 mb-2" [src]="api.coverUrl(c.track.id, 1200, lib.coverVersion())" alt="Album cover" />
            }
            @if (c.sources.length > 1) {
              <select class="select select-sm w-full mb-2" aria-label="Source" (change)="pick(c.track, +$any($event.target).value)">
                @for (s of c.sources; track s.i) { <option [value]="s.i" [selected]="s.i === c.selected">{{ s.label }}</option> }
              </select>
            } @else {
              <div class="text-xs opacity-60 mb-2">Source: {{ c.source }}</div>
            }
            <ul class="flex flex-col gap-1.5">
              @for (f of c.fields; track f.key) {
                <li>
                  <label class="flex items-start gap-2 rounded-lg bg-base-content/5 p-2 cursor-pointer">
                    <input type="checkbox" class="checkbox checkbox-xs checkbox-success mt-1" [checked]="f.on" (change)="lib.toggleAccept(c.track.id, f.key)" />
                    <span class="min-w-0 text-sm">
                      <span class="block text-xs opacity-60">{{ f.label }}</span>
                      <span class="block line-through opacity-60 truncate">{{ f.old || '—' }}</span>
                      <span class="block text-success font-medium break-words">{{ f.next }}</span>
                    </span>
                  </label>
                </li>
              }
            </ul>
            </div>
          </div>
        </div>
        <div class="flex justify-center gap-4 pt-3 shrink-0">
          <button class="btn btn-circle btn-lg btn-outline btn-error" aria-label="Skip" (click)="decide(false)"><app-icon name="x" [size]="24" /></button>
          <button class="btn btn-circle btn-lg btn-outline" aria-label="Later" title="Later: move to the end of the stack and keep the match" [disabled]="queue().length < 2" (click)="later()"><app-icon name="clock" [size]="20" /></button>
          <button class="btn btn-circle btn-lg btn-outline" aria-label="Undo last" [disabled]="!stack().length" (click)="undo()"><app-icon name="undo" [size]="20" /></button>
          <button class="btn btn-circle btn-lg btn-success" aria-label="Apply" (click)="decide(true)"><app-icon name="check" [size]="24" /></button>
        </div>
       </div>
      } @else {
        <div class="p-8 text-center opacity-80"><app-icon name="ok" [size]="30" class="text-success" /><div class="mt-2">All reviewed.</div></div>
      }

      @if (stack().length) {
        <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] pointer-events-none anim-slide">
          <button class="pointer-events-auto btn btn-sm glass-strong shadow-lg" (click)="undo()">
            <app-icon name="undo" /> Undo {{ stack()[stack().length - 1].apply ? 'apply' : 'skip' }}
          </button>
        </div>
      }
      <ng-container actions>
        <button class="btn btn-ghost" (click)="closed.emit()">Done</button>
      </ng-container>
    </app-modal>
  `,
})
export class SwipeReviewModal implements OnDestroy {
  api = inject(ApiService);
  lib = inject(LibraryStore);
  closed = output<void>();
  readonly THRESHOLD = THRESHOLD;

  stack = signal<Decision[]>([]);
  private inflight = signal<readonly number[]>([]);
  big = signal(false);
  dx = signal(0);
  dragging = signal(false);
  private startX = 0;

  // Proposals keep arrival order so new fetch results never displace the card being reviewed
  private order = signal<number[]>([]);
  private _sync = effect(() => {
    const ids = Object.keys(this.lib.proposals()).map(Number);
    this.order.update((o) => {
      const kept = o.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      return added.length || kept.length !== o.length ? [...kept, ...added] : o;
    });
  });

  queue = computed(() => {
    const decided = new Set([...this.stack().map((d) => d.id), ...this.inflight()]);
    return this.order().filter((id) => !decided.has(id) && this.lib.tracks().some((t) => t.id === id));
  });

  current = computed(() => {
    const id = this.queue()[0];
    const track = this.lib.tracks().find((t) => t.id === id);
    const proposal = this.lib.proposals()[id];
    if (!track || !proposal) return null;
    const cand = proposal.candidates[proposal.selected];
    const fields = this.lib.changedFields(track, proposal).map((key) => ({
      key, label: TAG_LABELS[key], old: String(track[key] ?? ''), next: String(cand.fields[key]), on: !!proposal.accept[key],
    }));
    const sources = proposal.candidates.map((x, i) => ({ i, label: `${x.source} · ${x.similarity}%` }));
    return { track, source: cand.source, similarity: cand.similarity, fields, sources, selected: proposal.selected };
  });

  transform = computed(() => `translateX(${this.dx()}px) rotate(${this.dx() / 20}deg)`);
  min1 = (n: number) => Math.min(1, n);

  private startY = 0;
  private tracking = false;

  pick(track: Track, i: number) { this.lib.selectCandidate(track, i); }

  down(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('input,select')) return;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.tracking = true;
  }
  move(e: PointerEvent) {
    if (!this.tracking) return;
    const mx = e.clientX - this.startX;
    if (!this.dragging()) {
      if (Math.abs(mx) < 10 || Math.abs(mx) < Math.abs(e.clientY - this.startY)) return;
      this.dragging.set(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    this.dx.set(mx);
  }
  cancel() {
    this.tracking = false;
    this.dragging.set(false);
    this.dx.set(0);
  }
  up(_e: PointerEvent) {
    this.tracking = false;
    if (!this.dragging()) return;
    this.dragging.set(false);
    const d = this.dx();
    this.dx.set(0);
    if (Math.abs(d) >= THRESHOLD) this.decide(d > 0);
  }

  decide(apply: boolean) {
    const id = this.queue()[0];
    if (id === undefined) return;
    this.big.set(false);
    const timer = setTimeout(() => this.commit(id), UNDO_MS);
    this.stack.update((s) => [...s, { id, apply, timer }]);
  }

  later() {
    const id = this.queue()[0];
    if (id === undefined || this.queue().length < 2) return;
    this.big.set(false);
    this.order.update((o) => [...o.filter((x) => x !== id), id]);
  }

  undo() {
    const last = this.stack().at(-1);
    if (!last) return;
    clearTimeout(last.timer);
    this.stack.update((s) => s.slice(0, -1));
  }

  private commit(id: number) {
    const d = this.stack().find((x) => x.id === id);
    if (!d) return;
    this.stack.update((s) => s.filter((x) => x.id !== id));
    if (!d.apply) { this.lib.dismiss(id); return; }
    this.inflight.update((l) => [...l, id]);
    void this.lib.applyProposal(id).finally(() => this.inflight.update((l) => l.filter((x) => x !== id)));
  }

  ngOnDestroy() {
    for (const d of [...this.stack()]) { clearTimeout(d.timer); this.commit(d.id); }
  }
}
