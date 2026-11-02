import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LibraryStore } from '../../core/library.store';
import { LibraryFilter } from '../../core/models';
import { Icon } from '../../shared/icon';

const GROUPS: { title: string; items: { value: LibraryFilter; label: string }[] }[] = [
  { title: 'Show', items: [{ value: 'all', label: 'All tracks' }, { value: 'recent', label: 'Added in the last 7 days' }, { value: 'review', label: 'Awaiting review' }] },
  {
    title: 'Lyrics',
    items: [
      { value: 'no-lyrics', label: 'Missing any lyrics' },
      { value: 'no-lrc', label: 'Missing LRC' },
      { value: 'no-ttml', label: 'Missing TTML' },
      { value: 'complete-lyrics', label: 'Has both LRC and TTML' },
    ],
  },
  {
    title: 'Audio',
    items: [
      { value: 'surround', label: 'Surround (5.1 / 7.1 / Atmos)' },
      { value: 'stereo', label: 'Stereo / mono' },
      { value: 'lossless', label: 'Lossless (FLAC, ALAC, WAV…)' },
      { value: 'lossy', label: 'Lossy (MP3, AAC, Opus…)' },
    ],
  },
  {
    title: 'Missing data',
    items: [
      { value: 'no-cover', label: 'No cover art' },
      { value: 'no-key', label: 'No musical key' },
      { value: 'no-bpm', label: 'No BPM' },
      { value: 'no-gain', label: 'No ReplayGain' },
      { value: 'no-tags', label: 'Incomplete tags (album, year, genre…)' },
    ],
  },
  { title: 'Covers', items: [{ value: 'animated', label: 'Has animated cover' }, { value: 'no-animated', label: 'No animated cover' }] },
  { title: 'Problems', items: [{ value: 'duplicates', label: 'Duplicates' }, { value: 'missing', label: 'File missing on disk' }] },
];

/** Filter picker as a frosted menu (a native <select> popup cannot be styled). */
@Component({
  selector: 'app-filter-menu',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dropdown">
      <button tabindex="0" class="btn btn-sm bg-base-100/70 font-normal gap-2" aria-label="Filter tracks">
        <app-icon name="filter" [size]="14" /> {{ label() }} <app-icon name="down" [size]="14" />
      </button>
      <div tabindex="0" class="dropdown-content glass-strong rounded-box z-30 w-72 max-w-[calc(100vw-1rem)] max-h-[70vh] overflow-y-auto p-2 mt-1 shadow-xl anim-pop">
        @for (g of groups; track g.title) {
          <div class="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide opacity-60">{{ g.title }}</div>
          <ul class="menu menu-sm p-0">
            @for (f of g.items; track f.value) {
              <li><button [class.menu-active]="lib.filter() === f.value" (click)="pick(f.value)">
                {{ f.label }}
                @if (lib.filter() === f.value) { <app-icon name="check" [size]="14" class="ml-auto" /> }
              </button></li>
            }
          </ul>
        }
      </div>
    </div>
  `,
})
export class FilterMenu {
  lib = inject(LibraryStore);
  groups = GROUPS;
  label = computed(() => GROUPS.flatMap((g) => g.items).find((f) => f.value === this.lib.filter())?.label ?? 'All tracks');

  pick(value: LibraryFilter) {
    this.lib.setFilter(value);
    (document.activeElement as HTMLElement | null)?.blur();
  }
}
