import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { JobStore } from '../../core/job.store';
import { LibraryStore } from '../../core/library.store';
import { SettingsStore } from '../../core/settings.store';
import { Icon } from '../../shared/icon';

/** Bulk enrichment tools. They act on the selected rows, or on every row passing the current filter. */
@Component({
  selector: 'app-lyrics-panel',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="glass-panel p-4 flex flex-col gap-3 anim-slide">
      <h2 class="font-bold flex items-center gap-2"><app-icon name="sparkles" class="text-primary" /> Enrich library</h2>
      <p class="text-xs opacity-70">
        Targets: <b>{{ lib.selected().size ? lib.selected().size + ' selected' : lib.filtered().length + ' shown' }}</b> track(s).
      </p>

      <div class="grid grid-cols-1 gap-2">
        <button class="btn btn-sm btn-outline justify-start" [disabled]="jobs.running() || !lib.tracks().length" (click)="lib.startLyricsBatch(ids())">
          <app-icon name="mic" /> Fetch lyrics
        </button>
        <button class="btn btn-sm btn-outline justify-start" [disabled]="jobs.running() || !lib.tracks().length" (click)="lib.startCovers(ids())" title="Download missing album art from iTunes, Deezer and the Cover Art Archive">
          <app-icon name="image" /> Fetch missing covers
        </button>
        <button class="btn btn-sm btn-outline justify-start" [disabled]="jobs.running() || !lib.tracks().length" (click)="lib.startAnalysis(ids())" title="Measure ReplayGain with ffmpeg and detect the musical key locally">
          <app-icon name="gauge" /> Analyse gain &amp; key
        </button>
      </div>

      <div class="divider my-0 text-xs">Lyrics options</div>
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" class="toggle toggle-xs" [checked]="s.overwriteLrc()" (change)="s.overwriteLrc.set($any($event.target).checked)" />
        Overwrite existing .lrc
      </label>
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" class="toggle toggle-xs" [checked]="s.overwriteTtml()" (change)="s.overwriteTtml.set($any($event.target).checked)" />
        Overwrite existing .ttml
      </label>
      <p class="text-xs opacity-60">Off = tracks that already have lyrics are skipped.</p>
    </section>
  `,
})
export class LyricsPanel {
  lib = inject(LibraryStore);
  jobs = inject(JobStore);
  s = inject(SettingsStore);
  ids() { return this.lib.targetIds(); }
}
