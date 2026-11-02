import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { JobStore } from '../../core/job.store';
import { LibraryStore } from '../../core/library.store';
import { SettingsStore } from '../../core/settings.store';
import { Icon } from '../../shared/icon';
import { InfoTip } from '../../shared/info-tip';

/** Bulk enrichment tools. They act on the selected rows, or on every row passing the current filter. */
@Component({
  selector: 'app-lyrics-panel',
  imports: [Icon, InfoTip],
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
        <button class="btn btn-sm btn-outline justify-start" [disabled]="jobs.running() || !lib.tracks().length" (click)="lib.startAnalysis(ids())" title="Measure ReplayGain, detect the musical key and BPM locally">
          <app-icon name="gauge" /> Analyse gain, key &amp; BPM
        </button>
      </div>

      <div class="divider my-0 text-xs">Lyrics options</div>
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" class="toggle toggle-xs" [checked]="s.overwriteLrc()" (change)="s.overwriteLrc.set($any($event.target).checked)" />
        Overwrite existing .lrc
      </label>
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" class="toggle toggle-xs" [checked]="s.overwriteTtml()" (change)="s.overwriteTtml.set($any($event.target).checked)" />
        Overwrite existing .ttml <app-info-tip text="Overwrite off = tracks that already have lyrics are skipped." />
      </label>
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" class="toggle toggle-xs" [checked]="s.embedLyrics()" (change)="s.embedLyrics.set($any($event.target).checked)" />
        <span>Embed lyrics in the audio tags <app-info-tip text="Also writes an unsynced copy into the audio file's tags whenever LRC lyrics are fetched, imported or saved, so players without .lrc support still show lyrics." /></span>
      </label>

      <div class="divider my-0 text-xs">Analysis options</div>
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" class="toggle toggle-xs" [checked]="s.reanalyze()" (change)="s.reanalyze.set($any($event.target).checked)" />
        Re-analyse already analysed songs <app-info-tip text="Off = only missing gain, key or BPM values are filled in." />
      </label>
            <div>
        <div class="flex items-center justify-between text-sm">
          <span>Surround loudness offset <app-info-tip text="Surround/Atmos files are measured on their stereo downmix and normalised to the same target as stereo songs, so 0 dB (default) already plays them level. It applies to songs analysed from now on; tick re-analyse to update existing ones. Raise it if your player's surround or spatial rendering sounds quieter than stereo, lower it if louder." /></span>
          <span class="badge badge-primary badge-sm tabular-nums">{{ s.multichannelGainOffset() > 0 ? '+' : '' }}{{ s.multichannelGainOffset().toFixed(1) }} dB</span>
        </div>
        <input type="range" class="range range-primary range-xs w-full mt-1" min="-12" max="12" step="0.5" aria-label="Surround loudness offset" [disabled]="jobs.running()" [value]="s.multichannelGainOffset()" (input)="s.set('multichannelGainOffset', +$any($event.target).value)" />
      </div>
    </section>
  `,
})
export class LyricsPanel {
  lib = inject(LibraryStore);
  jobs = inject(JobStore);
  s = inject(SettingsStore);
  ids() { return this.lib.targetIds(); }
}
