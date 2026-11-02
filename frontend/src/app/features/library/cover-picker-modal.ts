import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, inject, input, output, signal } from '@angular/core';
import { ApiService, errorMessage } from '../../core/api.service';
import { CoverCandidate, CoverInfo, Track } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { ZoomImage } from '../../shared/zoom-image';

/** Second-level dialog: search artwork online, compare a result with the current cover (both pinch-zoomable) and apply it. */
@Component({
  selector: 'app-cover-picker-modal',
  imports: [Modal, Icon, ZoomImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal title="Find album cover" icon="search" widthClass="max-w-3xl" (closed)="closed.emit()">
      @if (searching()) {
        <div class="p-10 text-center"><span class="loading loading-spinner loading-lg"></span><div class="mt-2 text-sm opacity-70">Searching cover sources…</div></div>
      } @else {
        @for (n of notes(); track n) { <p class="text-xs opacity-70">{{ n }}</p> }
        @if (!candidates().length) {
          <p class="text-sm opacity-70 py-6 text-center">No artwork found. Check the title, artist and album tags and try again.</p>
          <div class="text-center"><button class="btn btn-sm btn-outline" (click)="search()"><app-icon name="search" /> Search again</button></div>
        } @else {
          <div class="flex flex-col gap-2 h-full">
            @if (picked() >= 0 && candidates()[picked()]; as c) {
              <div class="flex items-center gap-2">
                <div role="tablist" class="tabs tabs-box tabs-sm">
                  <button role="tab" class="tab" [class.tab-active]="view() === 'found'" (click)="view.set('found')">Found</button>
                  <button role="tab" class="tab" [class.tab-active]="view() === 'current'" (click)="view.set('current')">Current</button>
                  <button role="tab" class="tab max-sm:hidden" [class.tab-active]="view() === 'both'" (click)="view.set('both')">Side by side</button>
                </div>
                <span class="text-xs opacity-70 grow text-right truncate">{{ c.source }} · {{ picked() + 1 }}/{{ candidates().length }}</span>
              </div>
              <div class="relative grid gap-2 anim-fade" [class]="view() === 'both' ? 'grid-cols-2' : 'grid-cols-1'">
                @if (view() !== 'current') {
                  <div class="relative">
                    <app-zoom-image class="w-full h-[min(60vh,32rem)]" [src]="c.url" alt="Found cover" (loaded)="found.set($any($event.target).naturalWidth + '×' + $any($event.target).naturalHeight)" />
                    <span class="absolute top-2 left-2 badge badge-primary badge-sm">Found {{ found() }}</span>
                  </div>
                }
                @if (view() !== 'found') {
                  <div class="relative">
                    @if (info()?.has) {
                      <app-zoom-image class="w-full h-[min(60vh,32rem)]" [src]="api.coverUrl(track().id, 1200, version())" alt="Current cover" />
                      <span class="absolute top-2 left-2 badge badge-neutral badge-sm">Current {{ info()!.width }}×{{ info()!.height }}</span>
                    } @else { <div class="h-[min(60vh,32rem)] rounded-lg bg-base-300/60 grid place-items-center text-sm opacity-70">No current cover</div> }
                  </div>
                }
                @if (candidates().length > 1) {
                  <button class="btn btn-circle btn-sm glass-strong absolute left-2 top-1/2 -translate-y-1/2" aria-label="Previous" (click)="step(-1)"><app-icon name="left" /></button>
                  <button class="btn btn-circle btn-sm glass-strong absolute right-2 top-1/2 -translate-y-1/2" aria-label="Next" (click)="step(1)"><app-icon name="right" /></button>
                }
              </div>
              <div class="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
                @for (x of candidates(); track x.url; let i = $index) {
                  <button class="shrink-0 w-16 rounded-lg overflow-hidden border-2 snap-start" [class]="picked() === i ? 'border-primary' : 'border-transparent opacity-80'" (click)="pick(i)" [title]="x.label">
                    <img [src]="x.thumb" class="w-full aspect-square object-cover bg-base-300" loading="lazy" alt="" />
                  </button>
                }
              </div>
            }
          </div>
        }
      }
      <ng-container actions>
        <button class="btn btn-ghost" (click)="closed.emit()">Cancel</button>
        <button class="btn btn-primary" [disabled]="picked() < 0 || applying()" (click)="apply()">
          @if (applying()) { <span class="loading loading-spinner loading-xs"></span> } @else { <app-icon name="check" /> } Use this cover
        </button>
      </ng-container>
    </app-modal>
  `,
})
export class CoverPickerModal implements OnInit, OnDestroy {
  api = inject(ApiService);
  private toast = inject(ToastService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  track = input.required<Track>();
  info = input<CoverInfo | null>(null);
  version = input(0);
  closed = output<void>();
  applied = output<void>();

  searching = signal(false);
  candidates = signal<CoverCandidate[]>([]);
  notes = signal<string[]>([]);
  picked = signal(-1);
  view = signal<'found' | 'current' | 'both'>('found');
  found = signal('');
  applying = signal(false);

  ngOnInit() {
    // Re-parent to <body>: a fixed overlay inside the editor's blurred dialog would be clipped by it.
    document.body.appendChild(this.host.nativeElement);
    void this.search();
  }

  ngOnDestroy() {
    this.host.nativeElement.remove();
  }

  async search() {
    this.searching.set(true);
    try {
      const r = await this.api.coverCandidates(this.track().id);
      this.candidates.set(r.candidates);
      this.notes.set(r.notes);
      this.picked.set(r.candidates.length ? 0 : -1);
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.searching.set(false);
    }
  }

  step(d: number) {
    const n = this.candidates().length;
    this.pick((this.picked() + d + n) % n);
  }

  pick(i: number) {
    this.found.set('');
    this.picked.set(i);
  }

  async apply() {
    const c = this.candidates()[this.picked()];
    if (!c) return;
    this.applying.set(true);
    try {
      await this.api.coverFromUrl(this.track().id, c.url);
      this.toast.success('Cover embedded');
      this.applied.emit();
      this.closed.emit();
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.applying.set(false);
    }
  }
}
