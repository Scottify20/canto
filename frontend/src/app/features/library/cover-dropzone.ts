import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { ApiService, errorMessage } from '../../core/api.service';
import { AnimatedCovers } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { formatBytes } from '../../shared/format';
import { Icon } from '../../shared/icon';

type Role = 'static' | 'tall' | 'square' | 'skip';

interface Staged {
  id: number;
  file: File;
  url: string;
  motion: boolean;
  width: number;
  height: number;
  role: Role;
}

const MOTION = /\.(mp4|m4v|mov|webm|mkv|gif)$/i;
let nextId = 1;

/** One drop zone for every cover file: pick several images/videos, check the previews, then apply them together. */
@Component({
  selector: 'app-cover-dropzone',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
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
      <div class="font-medium mt-1">Drop covers here</div>
      <div class="text-xs opacity-70">An image becomes the embedded cover (full resolution). Videos or GIFs become the animated cover; tall or square is detected from the picture. You can drop several at once.</div>
      <input #picker type="file" class="hidden" multiple accept="image/*,video/*,.mp4,.m4v,.mov,.webm,.mkv,.gif" (change)="onPick($any($event.target))" />
    </div>

    @if (staged().length) {
      <div class="flex flex-col gap-2 anim-slide">
        @for (s of staged(); track s.id) {
          <div class="flex items-center gap-3 rounded-xl bg-base-content/5 p-2">
            @if (s.motion) {
              <video class="w-16 h-16 rounded-lg object-cover bg-base-300 shrink-0" [src]="s.url" autoplay loop muted playsinline (loadedmetadata)="measure(s, $any($event.target).videoWidth, $any($event.target).videoHeight)"></video>
            } @else {
              <img class="w-16 h-16 rounded-lg object-cover bg-base-300 shrink-0" [src]="s.url" alt="" (load)="measure(s, $any($event.target).naturalWidth, $any($event.target).naturalHeight)" />
            }
            <div class="min-w-0 grow">
              <div class="text-sm font-medium truncate" [title]="s.file.name">{{ s.file.name }}</div>
              <div class="text-xs opacity-70">{{ s.width ? s.width + '×' + s.height : 'reading…' }} · {{ bytes(s.file.size) }}</div>
              <select class="select select-xs select-bordered mt-1" [value]="s.role" [attr.aria-label]="'Use ' + s.file.name + ' as'" (change)="setRole(s, $any($event.target).value)">
                @if (!s.motion) { <option value="static">Static cover (embedded)</option> }
                @if (s.motion) {
                  <option value="tall">Tall animated cover</option>
                  <option value="square">Square animated cover</option>
                }
                <option value="skip">Don't use</option>
              </select>
            </div>
            @if (s.role !== 'skip' && clash(s)) { <span class="badge badge-warning badge-sm shrink-0" title="Another file is also set to this slot; the last one wins">duplicate</span> }
            <button class="btn btn-ghost btn-sm btn-circle" aria-label="Remove from list" (click)="unstage(s)"><app-icon name="x" [size]="14" /></button>
          </div>
        }
        <div class="flex gap-2 justify-end">
          <button class="btn btn-sm btn-ghost" [disabled]="busy()" (click)="clear()">Clear</button>
          <button class="btn btn-sm btn-primary" [disabled]="busy() || !usable().length" (click)="apply()">
            @if (busy()) { <span class="loading loading-spinner loading-xs"></span> } @else { <app-icon name="check" /> } Apply {{ usable().length }} file(s)
          </button>
        </div>
      </div>
    }

    <div>
      <div class="text-xs font-semibold mb-1 flex items-center gap-1"><app-icon name="film" [size]="13" /> Animated covers stored with this album</div>
      <div class="grid grid-cols-2 gap-3">
        @for (slot of slots; track slot.shape) {
          <div class="rounded-xl bg-base-content/5 p-2">
            <div class="text-xs font-medium mb-1">{{ slot.label }}</div>
            @if (animated()[slot.shape]; as a) {
              <video class="w-full rounded-lg bg-base-300 object-contain max-h-48" [class]="slot.shape === 'tall' ? 'aspect-[3/4]' : 'aspect-square'" [src]="api.animatedUrl(trackId(), slot.shape, version())" autoplay loop muted playsinline controls></video>
              <div class="flex items-center gap-2 mt-1">
                <span class="text-[11px] opacity-70 grow truncate" [title]="a.file">{{ a.file }} · {{ a.width }}×{{ a.height }} · {{ bytes(a.size) }}</span>
                <button class="btn btn-ghost btn-xs text-error" aria-label="Delete animated cover" (click)="removeAnimated(slot.shape)"><app-icon name="trash" [size]="13" /></button>
              </div>
            } @else {
              <div class="w-full rounded-lg bg-base-300/50 grid place-items-center text-xs opacity-60 py-8">none</div>
            }
          </div>
        }
      </div>
      <p class="text-[11px] opacity-60 mt-1">Saved next to the audio as <code>animated-cover-tall</code> and <code>animated-cover-square</code>. Both kinds can exist together.</p>
    </div>
  `,
})
export class CoverDropzone implements OnInit, OnDestroy {
  api = inject(ApiService);
  private toast = inject(ToastService);

  trackId = input.required<number>();
  changed = output<void>();

  over = signal(false);
  busy = signal(false);
  staged = signal<Staged[]>([]);
  animated = signal<AnimatedCovers>({});
  version = signal(Date.now());
  bytes = formatBytes;
  slots: { shape: 'tall' | 'square'; label: string }[] = [
    { shape: 'tall', label: 'Tall (portrait)' },
    { shape: 'square', label: 'Square' },
  ];
  usable = computed(() => this.staged().filter((s) => s.role !== 'skip' && s.width > 0));

  ngOnInit() {
    void this.loadAnimated();
  }
  ngOnDestroy() {
    this.staged().forEach((s) => URL.revokeObjectURL(s.url));
  }

  private async loadAnimated() {
    try {
      this.animated.set(await this.api.animatedList(this.trackId()));
    } catch {
      this.animated.set({});
    }
    this.version.set(Date.now());
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.over.set(false);
    this.stage(Array.from(event.dataTransfer?.files ?? []));
  }
  onPick(input: HTMLInputElement) {
    this.stage(Array.from(input.files ?? []));
    input.value = '';
  }

  private stage(files: File[]) {
    const accepted = files.filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/') || MOTION.test(f.name));
    if (accepted.length < files.length) this.toast.warn('Some files were skipped (only images and videos are accepted)');
    const added: Staged[] = accepted.map((file) => {
      const motion = file.type.startsWith('video/') || MOTION.test(file.name);
      return { id: nextId++, file, url: URL.createObjectURL(file), motion, width: 0, height: 0, role: motion ? 'skip' : 'static' };
    });
    this.staged.update((list) => [...list, ...added]);
  }

  /** Called once the browser knows the picture size; picks the slot automatically. */
  measure(s: Staged, width: number, height: number) {
    if (s.width || !width) return;
    const ratio = width / height;
    const role: Role = !s.motion ? 'static' : Math.abs(ratio - 1) <= 0.08 ? 'square' : ratio < 0.92 ? 'tall' : 'skip';
    this.staged.update((list) => list.map((x) => (x.id === s.id ? { ...x, width, height, role } : x)));
    if (role === 'skip') this.toast.warn(`${s.file.name} is neither tall nor square; choose a slot or skip it`);
  }
  setRole(s: Staged, role: Role) {
    this.staged.update((list) => list.map((x) => (x.id === s.id ? { ...x, role } : x)));
  }
  clash(s: Staged) {
    return this.staged().some((x) => x.id !== s.id && x.role === s.role);
  }
  unstage(s: Staged) {
    URL.revokeObjectURL(s.url);
    this.staged.update((list) => list.filter((x) => x.id !== s.id));
  }
  clear() {
    this.staged().forEach((s) => URL.revokeObjectURL(s.url));
    this.staged.set([]);
  }

  async apply() {
    this.busy.set(true);
    const id = this.trackId();
    let done = 0;
    try {
      for (const s of this.usable()) {
        if (s.role === 'static') await this.api.uploadCover(id, s.file);
        else await this.api.uploadAnimated(id, s.file, s.role as 'tall' | 'square');
        done++;
      }
      this.toast.success(`Applied ${done} cover file(s)`);
      this.clear();
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
      await this.loadAnimated();
      this.changed.emit();
    }
  }

  async removeAnimated(shape: 'tall' | 'square') {
    try {
      await this.api.deleteAnimated(this.trackId(), shape);
      await this.loadAnimated();
      this.changed.emit();
    } catch (e) {
      this.toast.error(errorMessage(e));
    }
  }
}
