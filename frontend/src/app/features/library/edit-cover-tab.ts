import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { ApiService, errorMessage } from '../../core/api.service';
import { LibraryStore } from '../../core/library.store';
import { CoverCandidate, CoverInfo, Track } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { formatBytes } from '../../shared/format';
import { Icon } from '../../shared/icon';

/** Embedded artwork: preview, drag-and-drop replacement, online candidates compared against the current image. */
@Component({
  selector: 'app-edit-cover-tab',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      <div class="grid sm:grid-cols-[14rem_1fr] gap-4 items-start">
        <div>
          <div class="text-xs font-semibold mb-1">Current cover</div>
          @if (info()?.has) {
            <img class="w-56 max-w-full aspect-square object-cover rounded-xl shadow-lg bg-base-300" [src]="api.coverUrl(track().id, 600, version())" alt="Current cover" />
            <div class="text-xs opacity-70 mt-1">{{ info()!.width }}×{{ info()!.height }} · {{ bytes(info()!.bytes ?? 0) }} · {{ info()!.mime }}</div>
          } @else {
            <div class="w-56 max-w-full aspect-square rounded-xl bg-base-300/60 grid place-items-center text-sm opacity-70"><div class="text-center"><app-icon name="disc" [size]="36" /><div>No embedded cover</div></div></div>
          }
        </div>

        <div class="flex flex-col gap-3 min-w-0">
          <div
            class="drop-zone p-5 text-center text-sm cursor-pointer"
            [class.over]="over()"
            (dragover)="$event.preventDefault(); over.set(true)"
            (dragleave)="over.set(false)"
            (drop)="onDrop($event)"
            (click)="picker.click()"
            tabindex="0" (keydown.enter)="picker.click()"
          >
            <app-icon name="upload" [size]="22" class="opacity-70" />
            <div class="font-medium mt-1">Drop an image here</div>
            <div class="text-xs opacity-70">JPG, PNG or WebP up to 25 MB. It is embedded at full resolution, never resized.</div>
            <input #picker type="file" class="hidden" accept="image/*" (change)="onPick($any($event.target))" />
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn-sm btn-outline" [disabled]="searching() || !track().exists" (click)="search()">
              @if (searching()) { <span class="loading loading-spinner loading-xs"></span> } @else { <app-icon name="search" /> } Find online
            </button>
            <button class="btn btn-sm btn-ghost text-error" [disabled]="!info()?.has" (click)="remove()"><app-icon name="trash" /> Remove cover</button>
          </div>
        </div>
      </div>

      @if (searched()) {
        <section>
          <h4 class="font-semibold mb-2">Online results</h4>
          @for (n of notes(); track n) { <p class="text-xs opacity-70">{{ n }}</p> }
          @if (!candidates().length) { <p class="text-sm opacity-70">No artwork found. Check the title/artist/album tags and try again.</p> }
          <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            @for (c of candidates(); track c.url; let i = $index) {
              <button class="rounded-lg overflow-hidden border-2 lift text-left" [class]="picked() === i ? 'border-primary' : 'border-transparent'" (click)="pick(i)" [title]="c.label">
                <img [src]="c.thumb" class="w-full aspect-square object-cover bg-base-300" loading="lazy" alt="" />
                <span class="block text-[10px] px-1 py-0.5 truncate bg-base-100/80">{{ c.source }}</span>
              </button>
            }
          </div>

          @if (picked() >= 0 && candidates()[picked()]; as c) {
            <div class="mt-3 rounded-xl border border-primary/40 bg-base-content/5 p-3 flex flex-col gap-3 anim-slide">
              <div class="text-sm font-medium">{{ c.label }} <span class="badge badge-neutral badge-sm">{{ c.source }}</span></div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <div class="text-xs font-semibold mb-1">Current</div>
                  @if (info()?.has) {
                    <img class="w-full aspect-square object-cover rounded-lg" [src]="api.coverUrl(track().id, 600, version())" alt="" />
                    <div class="text-xs opacity-70">{{ info()!.width }}×{{ info()!.height }}</div>
                  } @else { <div class="w-full aspect-square rounded-lg bg-base-300/60 grid place-items-center text-xs opacity-70">none</div> }
                </div>
                <div>
                  <div class="text-xs font-semibold mb-1">Found</div>
                  <img class="w-full aspect-square object-cover rounded-lg" [src]="c.url" alt="" (load)="found.set($any($event.target).naturalWidth + '×' + $any($event.target).naturalHeight)" />
                  <div class="text-xs opacity-70">{{ found() }}</div>
                </div>
              </div>
              <button class="btn btn-sm btn-primary self-end" [disabled]="applying()" (click)="apply(c)">
                @if (applying()) { <span class="loading loading-spinner loading-xs"></span> } @else { <app-icon name="check" /> } Use this cover
              </button>
            </div>
          }
        </section>
      }
    </div>
  `,
})
export class EditCoverTab implements OnInit {
  api = inject(ApiService);
  private lib = inject(LibraryStore);
  private toast = inject(ToastService);

  track = input.required<Track>();

  info = signal<CoverInfo | null>(null);
  version = signal(Date.now());
  over = signal(false);
  searching = signal(false);
  searched = signal(false);
  candidates = signal<CoverCandidate[]>([]);
  notes = signal<string[]>([]);
  picked = signal(-1);
  found = signal('');
  applying = signal(false);
  bytes = formatBytes;

  ngOnInit() {
    void this.refresh();
  }

  private async refresh() {
    try {
      this.info.set(await this.api.coverInfo(this.track().id));
    } catch {
      this.info.set({ has: false });
    }
    this.version.set(Date.now());
    this.lib.bumpCovers();
    void this.lib.load(true);
  }

  async search() {
    this.searching.set(true);
    try {
      const r = await this.api.coverCandidates(this.track().id);
      this.candidates.set(r.candidates);
      this.notes.set(r.notes);
      this.picked.set(-1);
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.searching.set(false);
      this.searched.set(true);
    }
  }

  pick(i: number) {
    this.found.set('');
    this.picked.set(this.picked() === i ? -1 : i);
  }

  async apply(c: CoverCandidate) {
    this.applying.set(true);
    try {
      await this.api.coverFromUrl(this.track().id, c.url);
      this.toast.success('Cover embedded');
      await this.refresh();
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.applying.set(false);
    }
  }

  async remove() {
    try {
      await this.api.deleteCover(this.track().id);
      await this.refresh();
    } catch (e) {
      this.toast.error(errorMessage(e));
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.over.set(false);
    const file = Array.from(event.dataTransfer?.files ?? []).find((f) => f.type.startsWith('image/'));
    if (file) void this.upload(file);
    else this.toast.warn('Drop an image file (JPG, PNG or WebP)');
  }
  onPick(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (file) void this.upload(file);
    input.value = '';
  }

  private async upload(file: File) {
    try {
      await this.api.uploadCover(this.track().id, file);
      this.toast.success('Cover embedded at original size');
      await this.refresh();
    } catch (e) {
      this.toast.error(errorMessage(e));
    }
  }
}
