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
        <audio #audio class="w-full shrink-0" controls autoplay [src]="api.audioUrl(trackId())"></audio>
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
