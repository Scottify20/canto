import { ChangeDetectionStrategy, Component, OnChanges, inject, input, output, signal } from '@angular/core';
import { ApiService, errorMessage } from '../../core/api.service';
import { LibraryStore } from '../../core/library.store';
import { TrackDetails } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

interface FieldDef {
  key: string;
  label: string;
  tip?: string;
  type?: 'text' | 'number' | 'decimal';
  span?: 2;
}

const GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Main',
    fields: [
      { key: 'title', label: 'Title', span: 2 },
      { key: 'artist', label: 'Artist' },
      { key: 'albumartist', label: 'Album artist', tip: 'Used for the folder name; keeps album tracks together' },
      { key: 'album', label: 'Album' },
      { key: 'genre', label: 'Genre', tip: 'Separate several with commas' },
      { key: 'subtitle', label: 'Subtitle' },
      { key: 'grouping', label: 'Grouping' },
    ],
  },
  {
    title: 'Numbers & date',
    fields: [
      { key: 'year', label: 'Year', type: 'number' },
      { key: 'month', label: 'Month', type: 'number' },
      { key: 'day', label: 'Day', type: 'number' },
      { key: 'track', label: 'Track #', type: 'number' },
      { key: 'tracktotal', label: 'Track total', type: 'number' },
      { key: 'disc', label: 'Disc #', type: 'number' },
      { key: 'disctotal', label: 'Disc total', type: 'number' },
      { key: 'bpm', label: 'BPM', type: 'number' },
      { key: 'original_year', label: 'Original year', type: 'number' },
      { key: 'original_month', label: 'Original month', type: 'number' },
      { key: 'original_day', label: 'Original day', type: 'number' },
    ],
  },
  {
    title: 'Loudness (ReplayGain)',
    fields: [
      { key: 'rg_track_gain', label: 'Track gain (dB)', type: 'decimal', tip: 'Adjustment players apply so tracks sound equally loud, e.g. -7.25' },
      { key: 'rg_track_peak', label: 'Track peak', type: 'decimal', tip: 'Highest sample level, 1.0 = full scale' },
      { key: 'rg_album_gain', label: 'Album gain (dB)', type: 'decimal' },
      { key: 'rg_album_peak', label: 'Album peak', type: 'decimal' },
      { key: 'r128_track_gain', label: 'R128 track gain', type: 'decimal', tip: 'Opus-style gain (Q7.8 fixed point)' },
      { key: 'r128_album_gain', label: 'R128 album gain', type: 'decimal' },
    ],
  },
  {
    title: 'Credits & more',
    fields: [
      { key: 'composers', label: 'Composers', tip: 'Separate several with commas' },
      { key: 'lyricists', label: 'Lyricists', tip: 'Separate several with commas' },
      { key: 'arrangers', label: 'Arrangers' },
      { key: 'remixers', label: 'Remixers' },
      { key: 'label', label: 'Label' },
      { key: 'catalognum', label: 'Catalogue no.' },
      { key: 'isrc', label: 'ISRC' },
      { key: 'language', label: 'Language' },
      { key: 'initial_key', label: 'Musical key', tip: 'e.g. Am, C#, F#m' },
      { key: 'comments', label: 'Comments', span: 2 },
      { key: 'composer_sort', label: 'Composer sort' },
      { key: 'artist_sort', label: 'Artist sort' },
      { key: 'albumartist_sort', label: 'Album artist sort' },
      { key: 'artist_credit', label: 'Artist credit' },
      { key: 'albumartist_credit', label: 'Album artist credit' },
    ],
  },
  {
    title: 'Release details',
    fields: [
      { key: 'albumtype', label: 'Album type', tip: 'e.g. album, single, ep' },
      { key: 'albumdisambig', label: 'Album disambiguation' },
      { key: 'media', label: 'Media', tip: 'e.g. CD, Digital Media' },
      { key: 'disctitle', label: 'Disc title' },
      { key: 'country', label: 'Country' },
      { key: 'script', label: 'Script' },
      { key: 'barcode', label: 'Barcode' },
      { key: 'asin', label: 'ASIN' },
      { key: 'copyright', label: 'Copyright', span: 2 },
      { key: 'url', label: 'URL', span: 2 },
      { key: 'encoder', label: 'Encoder' },
    ],
  },
  {
    title: 'MusicBrainz IDs',
    fields: [
      { key: 'mb_trackid', label: 'Recording / track ID', span: 2 },
      { key: 'mb_albumid', label: 'Release ID', span: 2 },
      { key: 'mb_artistid', label: 'Artist ID', span: 2 },
      { key: 'mb_albumartistid', label: 'Album artist ID', span: 2 },
      { key: 'mb_releasegroupid', label: 'Release group ID', span: 2 },
    ],
  },
];

@Component({
  selector: 'app-edit-meta-tab',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      @for (g of groups; track g.title) {
        <fieldset class="rounded-xl border border-base-content/10 p-3">
          <legend class="px-2 text-sm font-semibold">{{ g.title }}</legend>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            @for (f of g.fields; track f.key) {
              <label class="flex flex-col gap-1 text-xs" [class.col-span-2]="f.span === 2">
                <span class="font-medium flex items-center gap-1">
                  {{ f.label }}
                  @if (f.tip) { <span class="tooltip" [attr.data-tip]="f.tip"><app-icon name="help" [size]="12" class="opacity-60" /></span> }
                  @if (isChanged(f.key)) { <span class="badge badge-warning badge-xs">edited</span> }
                </span>
                <input class="input input-sm input-bordered w-full"  [type]="f.type === 'number' ? 'number' : 'text'" [attr.inputmode]="f.type === 'decimal' ? 'decimal' : null" [disabled]="disabled()" [value]="values()[f.key] ?? ''" (input)="set(f.key, $any($event.target).value)" />
              </label>
            }
          </div>
        </fieldset>
      }
      <label class="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" class="checkbox checkbox-sm" [disabled]="disabled()" [checked]="!!values()['comp']" (change)="set('comp', $any($event.target).checked)" />
        Part of a compilation
      </label>
      <p class="text-xs opacity-60">Saving writes the tags into the audio file and moves it if the folder structure now points elsewhere (lyrics files follow).</p>
    </div>
  `,
})
export class EditMetaTab implements OnChanges {
  private api = inject(ApiService);
  private lib = inject(LibraryStore);
  private toast = inject(ToastService);

  details = input.required<TrackDetails>();
  disabled = input(false);
  saved = output<TrackDetails>();

  groups = GROUPS;
  values = signal<Record<string, string | boolean>>({});
  saving = signal(false);

  ngOnChanges() {
    this.reset();
  }

  reset() {
    this.values.set({ ...this.details().fields });
  }
  set(key: string, value: string | boolean) {
    this.values.update((v) => ({ ...v, [key]: value }));
  }
  isChanged(key: string) {
    return String(this.values()[key] ?? '') !== String(this.details().fields[key] ?? '');
  }
  private changes() {
    const out: Record<string, string | boolean> = {};
    for (const key of Object.keys(this.values())) if (this.isChanged(key)) out[key] = this.values()[key];
    return out;
  }
  dirty() {
    return Object.keys(this.changes()).length > 0;
  }

  async save() {
    this.saving.set(true);
    try {
      const track = await this.api.updateTags(this.details().track.id, this.changes());
      this.lib.patch(track);
      this.saved.emit(await this.api.details(track.id));
      this.toast.success('Metadata saved');
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }
}
