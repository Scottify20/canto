import '@braccato/core/element';
import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, effect, signal, inject, input, output, viewChild } from '@angular/core';
import { detectParser } from '@braccato/parsers';
import { ApiService } from '../../core/api.service';
import { shiftLyrics } from '../../shared/lyrics-shift';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';

/** Large preview: plays the track while Braccato highlights the (draft) lyrics syllable by syllable. */
@Component({
  selector: 'app-lyrics-player',
  imports: [Modal, Icon],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [title]="title()" icon="mic" widthClass="max-w-4xl h-[90vh]" (closed)="closed.emit()">
      <div class="flex flex-col gap-3 h-full min-h-0">
        <audio #audio class="w-full shrink-0" controls autoplay [src]="api.audioUrl(trackId(), channels() > 2 ? mix() : '')"></audio>
        @if (interrupted()) {
          <div class="alert alert-warning alert-soft text-sm shrink-0 py-2 flex-wrap">
            <app-icon name="warn" />
            <span class="grow">Playback keeps stopping on its own. Another app (for example a music player) is probably holding the audio. Pause or close it, then press play again.</span>
            <button class="btn btn-xs" (click)="retry()">Try again</button>
          </div>
        }
        @if (channels() > 2) {
          <div class="flex flex-wrap items-center gap-2 shrink-0 text-sm">
            <span class="font-medium">Output</span>
            <div class="join">
              <button class="btn btn-xs join-item" [class.btn-primary]="mix() === 'surround'" (click)="mix.set('surround')">Surround</button>
              <button class="btn btn-xs join-item" [class.btn-primary]="mix() === 'stereo'" (click)="mix.set('stereo')">Stereo</button>
            </div>
            <span class="opacity-70 text-xs">Surround plays the {{ channels() }}-channel song as 5.1 AAC (Atmos object data is not kept). Your system audio device must be set to 5.1 or more to hear it spread; otherwise the browser mixes it down.</span>
          </div>
        }
        <div class="flex flex-wrap items-center gap-1 shrink-0 text-sm">
          <span class="font-medium mr-1">Sync</span>
          @for (d of steps; track d) {
            <button class="btn btn-xs btn-outline tabular-nums" (click)="nudge(d)">{{ d > 0 ? '+' : '' }}{{ d }}</button>
          }
          <span class="badge tabular-nums min-w-36 justify-center gap-1" [class]="offset() > 0 ? 'badge-warning' : offset() < 0 ? 'badge-info' : 'badge-neutral'">
            @if (offset() > 0) { <app-icon name="right" [size]="12" /> Delayed {{ offset() }} ms }
            @else if (offset() < 0) { <app-icon name="left" [size]="12" /> Advanced {{ -offset() }} ms }
            @else { In sync }
          </span>
          <button class="btn btn-xs btn-ghost" [disabled]="!offset()" (click)="offset.set(0)">Reset</button>
          <span class="grow"></span>
          <button class="btn btn-xs btn-primary" [disabled]="!offset() || !text().trim()" (click)="saveTiming.emit(shifted())"><app-icon name="save" [size]="12" /> Save timing to file</button>
        </div>
        <div #frame class="grow min-h-0 overflow-y-auto rounded-xl bg-base-300/50 px-4">
          <braccato-lyrics #view></braccato-lyrics>
        </div>
      </div>
    </app-modal>
  `,
})
export class LyricsPlayer implements OnDestroy {
  api = inject(ApiService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private audio = viewChild.required<ElementRef<HTMLAudioElement>>('audio');
  private frame = viewChild.required<ElementRef<HTMLElement>>('frame');
  private view = viewChild.required<ElementRef<any>>('view');

  trackId = input.required<number>();
  channels = input(2);
  mix = signal<'surround' | 'stereo'>('surround');
  interrupted = signal(false);
  private lastPlay = 0;
  private strikes = 0;

  retry() {
    this.interrupted.set(false);
    this.strikes = 0;
    this.audio().nativeElement.play().catch(() => this.interrupted.set(true));
  }
  title = input('Lyrics preview');
  text = input('');
  closed = output<void>();
  /** Emits the lyrics text with the chosen offset baked into its timestamps. */
  saveTiming = output<string>();
  steps = [-500, -100, -50, 50, 100, 500];
  offset = signal(0);
  shifted = computed(() => shiftLyrics(this.text(), this.offset()));

  nudge(delta: number) { this.offset.update((v) => v + delta); }

  constructor() {
    // Escape the edit dialog's transformed container so this overlay covers the whole screen.
    document.body.appendChild(this.host.nativeElement);

    effect(() => {
      const view = this.view().nativeElement;
      const frame = this.frame().nativeElement;
      const audio = this.audio().nativeElement;
      view.host = { getScrollElement: () => frame };
      view.source = audio;
      // A pause within 2 s of play() that the user did not ask for means another app took audio focus
      audio.addEventListener('play', () => { this.lastPlay = Date.now(); });
      audio.addEventListener('pause', () => {
        if (!audio.ended && Date.now() - this.lastPlay < 2000 && ++this.strikes >= 2) this.interrupted.set(true);
      });
      audio.addEventListener('timeupdate', () => {
        if (!audio.paused && Date.now() - this.lastPlay > 2500) { this.strikes = 0; if (this.interrupted()) this.interrupted.set(false); }
      });
      // Only real user input counts; a 'scroll' listener also fires for the engine's own smooth
      // scrolls (e.g. after clicking a line) and made the follow animation stutter.
      const user = () => view.renderer?.noteUserScroll();
      for (const type of ['wheel', 'touchmove']) frame.addEventListener(type, user, { passive: true });
    });

    effect(() => {
      const text = this.shifted();
      const view = this.view().nativeElement;
      try {
        view.lyrics = text.trim() ? detectParser(text).parse(text, 0) : [];
      } catch {
        view.lyrics = [];
      }
    });
  }

  ngOnDestroy() {
    this.audio().nativeElement.pause();
    this.host.nativeElement.remove();
  }
}
