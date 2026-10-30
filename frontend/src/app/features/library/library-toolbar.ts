import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { JobStore } from '../../core/job.store';
import { LibraryStore } from '../../core/library.store';
import { COLUMNS, LibraryFilter } from '../../core/models';
import { SettingsStore } from '../../core/settings.store';
import { Icon } from '../../shared/icon';

const FILTERS: { value: LibraryFilter; label: string }[] = [
  { value: 'all', label: 'All tracks' },
  { value: 'no-lyrics', label: 'Missing any lyrics' },
  { value: 'no-lrc', label: 'Missing LRC' },
  { value: 'no-ttml', label: 'Missing TTML' },
  { value: 'no-cover', label: 'No cover art' },
  { value: 'no-key', label: 'No musical key' },
  { value: 'no-gain', label: 'No ReplayGain' },
  { value: 'duplicates', label: 'Duplicates' },
  { value: 'missing', label: 'File missing on disk' },
  { value: 'review', label: 'Awaiting review' },
];

@Component({
  selector: 'app-library-toolbar',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <label class="input input-sm flex items-center gap-2 grow min-w-44 sm:max-w-xs bg-base-100/70">
          <app-icon name="search" [size]="14" class="opacity-60" />
          <input type="search" class="grow" placeholder="Search title, artist, album, path…" [value]="lib.search()" (input)="lib.setSearch($any($event.target).value)" aria-label="Search library" />
        </label>

        <select class="select select-sm w-auto bg-base-100/70" aria-label="Filter" [value]="lib.filter()" (change)="lib.setFilter($any($event.target).value)">
          @for (f of filters; track f.value) { <option [value]="f.value" [selected]="f.value === lib.filter()">{{ f.label }}</option> }
        </select>

        <div class="dropdown">
          <button tabindex="0" class="btn btn-sm btn-ghost tooltip tooltip-bottom" data-tip="Choose columns"><app-icon name="columns" /><span class="max-sm:hidden">Columns</span></button>
          <ul tabindex="0" class="dropdown-content glass-strong rounded-box z-20 w-52 p-2 shadow-xl menu menu-sm">
            @for (c of columns; track c.key) {
              <li>
                <label class="flex items-center gap-2">
                  <input type="checkbox" class="checkbox checkbox-xs" [checked]="s.visibleColumns().includes(c.key)" (change)="s.toggleColumn(c.key, $any($event.target).checked)" /> {{ c.label }}
                </label>
              </li>
            }
          </ul>
        </div>

        <span class="grow max-sm:hidden"></span>

        <button class="btn btn-sm btn-ghost tooltip tooltip-bottom" data-tip="Find and merge duplicate songs" (click)="duplicates.emit()">
          <app-icon name="copy" /><span class="max-sm:hidden">Duplicates</span>
          @if (lib.stats().duplicates) { <span class="badge badge-warning badge-xs">{{ lib.stats().duplicates }}</span> }
        </button>
        <button class="btn btn-sm btn-ghost tooltip tooltip-bottom" [attr.data-tip]="maximized() ? 'Exit full screen' : 'Full-screen library'" (click)="maximizeToggle.emit()">
          <app-icon [name]="maximized() ? 'minimize' : 'maximize'" />
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button class="btn btn-sm btn-outline" [disabled]="!!lib.batch() || !lib.tracks().length" (click)="lib.fetchMatches(lib.targetIds())" title="Look up metadata online for the selected / shown tracks and review the differences">
          <app-icon name="scan" /> Fetch all metadata
        </button>
        <button class="btn btn-sm btn-success" [disabled]="!!lib.batch() || !lib.pendingCount()" (click)="lib.applyAll()" title="Save every reviewed change that is ticked">
          <app-icon name="save" /> Apply all ({{ lib.pendingCount() }})
        </button>

        <span class="grow"></span>
        @if (lib.selected().size) {
          <span class="text-sm opacity-80">{{ lib.selected().size }} selected</span>
          <button class="btn btn-xs btn-ghost" (click)="lib.clearSelection()">Deselect</button>
        } @else if (lib.filtered().length) {
          <button class="btn btn-xs btn-ghost" (click)="lib.selectAllFiltered()">Select all {{ lib.filtered().length }}</button>
        }
        <div class="dropdown dropdown-end">
          <button tabindex="0" class="btn btn-sm btn-error btn-soft" [disabled]="jobs.running()"><app-icon name="trash" /> Remove <app-icon name="down" [size]="14" /></button>
          <ul tabindex="0" class="dropdown-content glass-strong rounded-box z-20 w-72 p-2 shadow-xl menu menu-sm">
            <li [class.menu-disabled]="!lib.selected().size"><button [disabled]="!lib.selected().size" (click)="remove.emit('selected')">Remove selected ({{ lib.selected().size }})…</button></li>
            <li [class.menu-disabled]="!lib.stats().missing"><button [disabled]="!lib.stats().missing" (click)="lib.pruneMissing()">Remove entries with missing files ({{ lib.stats().missing }})</button></li>
            <li><button class="text-error" [disabled]="!lib.tracks().length" (click)="remove.emit('all')">Clear entire library…</button></li>
          </ul>
        </div>
      </div>

      @if (lib.batch(); as b) {
        <div class="flex items-center gap-3 text-sm glass-panel px-3 py-2 anim-fade">
          <span class="loading loading-spinner loading-xs"></span>
          <span>{{ b.label }} {{ b.done + 1 }} / {{ b.total }}</span>
          <progress class="progress progress-primary grow" [value]="b.done" [max]="b.total"></progress>
          <button class="btn btn-xs btn-ghost" (click)="lib.cancelBatch()">Stop</button>
        </div>
      }
    </div>
  `,
})
export class LibraryToolbar {
  lib = inject(LibraryStore);
  jobs = inject(JobStore);
  s = inject(SettingsStore);
  maximized = input(false);
  maximizeToggle = output<void>();
  duplicates = output<void>();
  remove = output<'selected' | 'all'>();
  filters = FILTERS;
  columns = COLUMNS;
}
