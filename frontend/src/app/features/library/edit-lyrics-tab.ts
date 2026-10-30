import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { ApiService, errorMessage } from '../../core/api.service';
import { LibraryStore } from '../../core/library.store';
import { LyricsCandidate, LyricsContent, Track } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

type Kind = 'lrc' | 'ttml';

/** Current lyrics + drag-and-drop import + online candidates with a side-by-side comparison. */
@Component({
  selector: 'app-edit-lyrics-tab',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      <div
        class="drop-zone p-4 text-center text-sm cursor-pointer"
        [class.over]="over()"
        (dragover)="$event.preventDefault(); over.set(true)"
        (dragleave)="over.set(false)"
        (drop)="onDrop($event)"
        (click)="picker.click()"
        tabindex="0" (keydown.enter)="picker.click()"
      >
        <app-icon name="upload" [size]="22" class="opacity-70" />
        <div class="font-medium mt-1">Drop a <code>.lrc</code> or <code>.ttml</code> file here</div>
        <div class="text-xs opacity-70">or click to choose. It replaces the current lyrics of that type.</div>
        <input #picker type="file" class="hidden" accept=".lrc,.ttml,.xml,.txt" multiple (change)="onPick($any($event.target))" />
      </div>

      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" class="checkbox checkbox-xs" [checked]="embed()" (change)="embed.set($any($event.target).checked)" />
        Also embed plain lyrics in the audio file tags
        <span class="tooltip" data-tip="Writes an unsynced copy into the file so players without .lrc support still show lyrics"><app-icon name="help" [size]="13" class="opacity-60" /></span>
      </label>

      <section>
        <div class="flex items-center gap-2 mb-2">
          <div role="tablist" class="tabs tabs-border tabs-sm grow">
            <button role="tab" class="tab" [class.tab-active]="kind() === 'lrc'" (click)="setKind('lrc')">LRC {{ current()?.lrc ? '✓' : '' }}</button>
            <button role="tab" class="tab" [class.tab-active]="kind() === 'ttml'" (click)="setKind('ttml')">TTML {{ current()?.ttml ? '✓' : '' }}</button>
          </div>
          @if (kind() === 'ttml' && current()?.ttml_timing) { <span class="badge badge-sm" [class]="current()!.ttml_timing === 'word' ? 'badge-primary' : 'badge-ghost'">{{ current()!.ttml_timing }}-synced</span> }
        </div>
        @if (loading()) { <span class="loading loading-spinner loading-sm"></span> }
        @else {
          <textarea class="textarea textarea-bordered w-full font-mono text-xs h-48" spellcheck="false" [placeholder]="'No ' + kind().toUpperCase() + ' lyrics yet – drop a file, paste here, or find some online.'" [value]="draft()" (input)="draft.set($any($event.target).value)"></textarea>
          <div class="flex flex-wrap gap-2 justify-end mt-2">
            <button class="btn btn-sm btn-ghost text-error" [disabled]="!currentText()" (click)="remove()"><app-icon name="trash" /> Delete {{ kind().toUpperCase() }}</button>
            <button class="btn btn-sm btn-primary" [disabled]="!draft().trim() || draft() === currentText() || !track().exists" (click)="save(kind(), draft())"><app-icon name="save" /> Save {{ kind().toUpperCase() }}</button>
          </div>
        }
      </section>

      <section>
        <div class="flex items-center gap-2 mb-2">
          <h4 class="font-semibold grow">Find online</h4>
          <button class="btn btn-sm btn-outline" [disabled]="searching() || !track().exists" (click)="search()">
            @if (searching()) { <span class="loading loading-spinner loading-xs"></span> } @else { <app-icon name="search" /> } Search all sources
          </button>
        </div>
        @if (searched() && !candidates().length) { <p class="text-sm opacity-70">Nothing found. Try enabling more sources (Sources button in the top bar).</p> }
        <ul class="flex flex-col gap-2">
          @for (c of candidates(); track $index; let i = $index) {
            <li class="rounded-xl border bg-base-content/5 anim-slide" [class]="picked() === i ? 'border-primary' : 'border-base-content/10'">
              <button class="w-full flex items-center gap-2 p-2 text-left" (click)="picked.set(picked() === i ? -1 : i)">
                <span class="badge badge-neutral badge-sm">{{ c.source }}</span>
                <span class="badge badge-sm" [class]="c.timing === 'word' ? 'badge-primary' : 'badge-ghost'">{{ c.timing }}-synced</span>
                <span class="text-xs opacity-70 grow truncate">{{ c.artist }} – {{ c.title }} · {{ c.lines }} lines</span>
                <span class="text-xs opacity-60">score {{ c.score.toFixed(0) }}</span>
                <app-icon [name]="picked() === i ? 'up' : 'down'" [size]="14" />
              </button>
              @if (picked() === i) {
                <div class="p-2 pt-0 flex flex-col gap-2">
                  <div class="grid md:grid-cols-2 gap-2">
                    <div>
                      <div class="text-xs font-semibold mb-1">Current {{ kind().toUpperCase() }}</div>
                      <pre class="text-xs bg-base-300/60 rounded-lg p-2 h-44 overflow-auto whitespace-pre-wrap">{{ currentText() || '(none)' }}</pre>
                    </div>
                    <div>
                      <div class="text-xs font-semibold mb-1">Found {{ kind().toUpperCase() }}</div>
                      <pre class="text-xs bg-success/10 rounded-lg p-2 h-44 overflow-auto whitespace-pre-wrap">{{ kind() === 'lrc' ? c.lrc : c.ttml }}</pre>
                    </div>
                  </div>
                  <div class="flex flex-wrap gap-2 justify-end">
                    <button class="btn btn-xs btn-outline" (click)="save('lrc', c.lrc)">Use LRC</button>
                    @if (c.timing === 'word') {
                      <button class="btn btn-xs btn-outline" (click)="save('ttml', c.ttml)">Use TTML</button>
                      <button class="btn btn-xs btn-primary" (click)="saveBoth(c)">Use both</button>
                    }
                  </div>
                </div>
              }
            </li>
          }
        </ul>
      </section>
    </div>
  `,
})
export class EditLyricsTab implements OnInit {
  private api = inject(ApiService);
  private lib = inject(LibraryStore);
  private toast = inject(ToastService);

  track = input.required<Track>();

  current = signal<LyricsContent | null>(null);
  kind = signal<Kind>('lrc');
  draft = signal('');
  embed = signal(false);
  over = signal(false);
  loading = signal(true);
  searching = signal(false);
  searched = signal(false);
  candidates = signal<LyricsCandidate[]>([]);
  picked = signal(-1);

  async ngOnInit() {
    await this.reload();
    if (!this.current()?.lrc && this.current()?.ttml) this.kind.set('ttml');
    this.sync();
  }

  currentText() {
    return (this.kind() === 'lrc' ? this.current()?.lrc : this.current()?.ttml) ?? '';
  }

  /** Keep the editor in step with whichever tab is open. */
  private sync() {
    this.draft.set(this.currentText());
  }
  setKind(k: Kind) {
    this.kind.set(k);
    this.sync();
  }

  private async reload() {
    this.loading.set(true);
    try {
      const result = await this.api.readLyrics(this.track().id);
      this.lib.patch(result.track);
      this.current.set(result.lyrics);
    } catch {
      this.current.set({ lrc: null, ttml: null, ttml_timing: null });
    }
    this.loading.set(false);
  }

  async save(kind: Kind, content: string) {
    if (!content.trim()) return;
    try {
      const saved = await this.api.saveLyrics(this.track().id, kind, content, this.embed());
      const savedKind = saved.saved_kind;
      this.lib.patch(saved.track);
      await this.reload();
      this.kind.set(savedKind);
      this.sync();
      this.toast.success(savedKind === kind ? `${kind.toUpperCase()} saved` : `Line-synced TTML saved as LRC`);
    } catch (e) {
      this.toast.error(errorMessage(e));
    }
  }

  async saveBoth(c: LyricsCandidate) {
    await this.save('lrc', c.lrc);
    await this.save('ttml', c.ttml);
  }

  async remove() {
    try {
      this.lib.patch(await this.api.deleteLyrics(this.track().id, this.kind()));
      await this.reload();
      this.sync();
    } catch (e) {
      this.toast.error(errorMessage(e));
    }
  }

  async search() {
    this.searching.set(true);
    try {
      this.candidates.set(await this.api.lyricsCandidates(this.track().id));
      this.picked.set(this.candidates().length ? 0 : -1);
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.searching.set(false);
      this.searched.set(true);
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.over.set(false);
    void this.importFiles(Array.from(event.dataTransfer?.files ?? []));
  }
  onPick(input: HTMLInputElement) {
    void this.importFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  private async importFiles(files: File[]) {
    if (!files.length) return;
    for (const file of files) {
      const text = await file.text();
      const isTtml = /\.(ttml|xml)$/i.test(file.name) || /^\s*(<\?xml|<tt[\s>])/.test(text);
      const isLrc = /\.lrc$/i.test(file.name) || /\[\d{1,3}:\d{2}/.test(text);
      if (!isTtml && !isLrc) {
        this.toast.warn(`“${file.name}” is not a .lrc or .ttml file`);
        continue;
      }
      await this.save(isTtml ? 'ttml' : 'lrc', text);
      this.kind.set(isTtml ? 'ttml' : 'lrc');
      this.sync();
    }
  }
}
