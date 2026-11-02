import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { LibraryStore } from '../../core/library.store';
import { ColumnKey, Track } from '../../core/models';
import { SettingsStore } from '../../core/settings.store';
import { channelLayout, formatDate, formatDuration } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { EditTab } from './edit-modal';
import { TrackDiff } from './track-diff';

export interface OpenEdit {
  track: Track;
  tab: EditTab;
}

@Component({
  selector: 'tbody[app-track-row]',
  imports: [TrackDiff, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tr
      class="hover:bg-base-content/5 anim-fade"
      [class.bg-primary/10]="selected()"
      [class.opacity-60]="!track().exists"
      (mousedown)="holdSelect($event)"
      (click)="rowClick($event)"
    >
      <td class="w-8">
        <input
          type="checkbox"
          class="checkbox checkbox-xs"
          [checked]="selected()"
          (click)="$event.stopPropagation(); lib.pick(track().id, $event, $any($event.target).checked)"
          [attr.aria-label]="'Select ' + track().title"
        />
      </td>
      <td class="w-12 p-1 ">
        @if (track().has_cover && !coverFailed) {
          <img
            class="w-10 h-10 min-w-10 max-sm:w-8 max-sm:h-8 max-sm:min-w-8 rounded-lg object-cover bg-base-300 shadow"
            loading="lazy"
            [src]="api.coverUrl(track().id, 96, lib.coverVersion())"
            alt=""
            (error)="coverFailed = true"
          />
        } @else {
          <div class="w-10 h-10 max-sm:w-8 max-sm:h-8 rounded-lg bg-base-300/70 grid place-items-center opacity-60">
            <app-icon name="disc" [size]="18" />
          </div>
        }
      </td>
      @for (col of columns(); track col.key) {
        @switch (col.key) {
          @case ('status') {
            <td class="min-w-28">
              <div class="flex flex-wrap gap-1">
                <button
                  class="badge badge-sm h-auto min-h-5 py-0.5 gap-1 whitespace-nowrap cursor-pointer tooltip"
                  [class]="track().has_cover ? 'badge-success badge-soft' : 'badge-ghost'"
                  [attr.data-tip]="
                    track().has_cover ? 'Embedded cover art – click to manage' : 'No cover art – click to add'
                  "
                  (click)="open.emit({ track: track(), tab: 'cover' })"
                >
                  <app-icon name="image" [size]="12" />
                </button>
                <button
                  class="badge badge-sm h-auto min-h-5 py-0.5 gap-1 whitespace-nowrap cursor-pointer tooltip"
                  [class]="track().has_ttml ? 'badge-success badge-soft' : 'badge-ghost'"
                  [attr.data-tip]="track().has_ttml ? 'TTML lyrics present' : 'No TTML lyrics'"
                  (click)="open.emit({ track: track(), tab: 'lyrics' })"
                >
                  <app-icon [name]="track().has_ttml ? 'ok' : 'no'" [size]="12" />
                  <span>TTML</span>
                </button>
                <button
                  class="badge badge-sm h-auto min-h-5 py-0.5 gap-1 whitespace-nowrap cursor-pointer tooltip"
                  [class]="track().has_lrc ? 'badge-success badge-soft' : 'badge-ghost'"
                  [attr.data-tip]="track().has_lrc ? 'LRC lyrics present' : 'No LRC lyrics'"
                  (click)="open.emit({ track: track(), tab: 'lyrics' })"
                >
                  <app-icon [name]="track().has_lrc ? 'ok' : 'no'" [size]="12" />
                  <span>LRC</span>
                </button>
                @if (track().channels > 2) {
                  <span
                    class="badge badge-sm badge-secondary badge-soft h-auto min-h-5 py-0.5 whitespace-nowrap tooltip"
                    [attr.data-tip]="track().channels + '-channel surround / Atmos mix (kept separate from the stereo version)'"
                  >
                    {{ layout() }}
                  </span>
                }
                @if (track().animated.length) {
                  <span
                    class="badge badge-sm badge-accent badge-soft h-auto min-h-5 py-0.5 gap-1 whitespace-nowrap tooltip"
                    [attr.data-tip]="'Animated cover: ' + track().animated.join(' + ')"
                  >
                    <app-icon name="film" [size]="12" />
                  </span>
                }
                @if (!track().exists) {
                  <span
                    class="badge badge-sm badge-error h-auto min-h-5 py-0.5 whitespace-nowrap tooltip"
                    data-tip="The audio file is gone from disk. Remove this entry."
                  >
                    missing file
                  </span>
                }
                @if (track().dup_group !== null) {
                  <span
                    class="badge badge-sm badge-warning badge-soft h-auto min-h-5 py-0.5 whitespace-nowrap tooltip"
                    data-tip="Another copy of this song exists in the library"
                  >
                    duplicate
                  </span>
                }
              </div>
            </td>
          }
          @case ('format') {
            <td class="whitespace-nowrap">{{ track().format }} @if (track().channels > 2) { <span class="badge badge-secondary badge-soft badge-xs">{{ layout() }}</span> }</td>
          }
          @case ('bitrate') {
            <td class="tabular-nums whitespace-nowrap">{{ kbps() }}</td>
          }
          @case ('added') {
            <td class="whitespace-nowrap tabular-nums" [title]="addedTime()">{{ added() }}</td>
          }
          @case ('length') {
            <td class="tabular-nums">{{ duration() }}</td>
          }
          @case ('path') {
            <td class="font-mono text-xs max-w-xs truncate" [title]="track().path">{{ track().path }}</td>
          }
          @case ('initial_key') {
            <td>
              @if (track().initial_key) {
                <span class="badge badge-outline badge-sm">{{ track().initial_key }}</span>
              }
            </td>
          }
          @case ('rg_track_gain') {
            <td class="tabular-nums">{{ gain() }}</td>
          }
          @default {
            <td class="max-w-56 max-sm:max-w-32 truncate" [title]="cell(col.key)">
              {{ cell(col.key) }}
            </td>
          }
        }
      }
      <td class="text-right whitespace-nowrap">
        <button
          class="btn btn-ghost btn-sm btn-square max-sm:size-10 tooltip tooltip-left"
          data-tip="Find metadata online"
          [disabled]="!!busy() || !track().exists"
          (click)="lib.findMatch(track())"
        >
          @if (busy() === 'match') {
            <span class="loading loading-spinner loading-sm"></span>
          } @else {
            <app-icon name="scan" [size]="18" />
          }
        </button>
        <button
          class="btn btn-ghost btn-sm btn-square max-sm:size-10 tooltip tooltip-left"
          data-tip="Fetch lyrics"
          [disabled]="!!busy() || !track().exists"
          (click)="lib.fetchLyrics(track())"
        >
          @if (busy() === 'lyrics') {
            <span class="loading loading-spinner loading-sm"></span>
          } @else {
            <app-icon name="mic" [size]="18" />
          }
        </button>
        <button
          class="btn btn-ghost btn-sm btn-square max-sm:size-10 tooltip tooltip-left"
          data-tip="Edit metadata, lyrics & cover"
          (click)="open.emit({ track: track(), tab: 'meta' })"
        >
          <app-icon name="edit" [size]="18" />
        </button>
        <button
          class="btn btn-ghost btn-sm btn-square max-sm:size-10 text-error tooltip tooltip-left"
          data-tip="Remove from library"
          (click)="remove.emit(track().id)"
        >
          <app-icon name="trash" [size]="18" />
        </button>
      </td>
    </tr>
    @if (proposal(); as p) {
      <tr class="bg-success/10 anim-slide">
        <td></td>
        <td></td>
        <td [attr.colspan]="columns().length + 1" class="py-3"><app-track-diff [track]="track()" [proposal]="p" /></td>
      </tr>
    }
  `
})
export class TrackRow {
  lib = inject(LibraryStore);
  api = inject(ApiService);
  private s = inject(SettingsStore);
  track = input.required<Track>();
  open = output<OpenEdit>();
  remove = output<number>();
  coverFailed = false;

  kbps = computed(() => (this.track().bitrate ? `${Math.round(this.track().bitrate / 1000)} kbps` : ''));
  selected = computed(() => this.lib.selected().has(this.track().id));
  busy = computed(() => this.lib.busy()[this.track().id]);
  proposal = computed(() => this.lib.proposals()[this.track().id]);
  columns = computed(() => this.lib.columns.filter((c) => this.s.visibleColumns().includes(c.key)));
  duration = computed(() => formatDuration(this.track().length));
  layout = computed(() => channelLayout(this.track().channels));
  added = computed(() => formatDate(this.track().added));
  addedTime = computed(() => (this.track().added ? new Date(this.track().added * 1000).toLocaleString() : ''));
  gain = computed(() => {
    const g = this.track().rg_track_gain;
    return g === '' ? '' : Number(g).toFixed(1);
  });

  /** Stops the browser's text selection while Shift/Ctrl-selecting rows. */
  holdSelect(e: MouseEvent) {
    if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault();
  }

  rowClick(e: MouseEvent) {
    if (!(e.shiftKey || e.ctrlKey || e.metaKey) || (e.target as HTMLElement).closest('button, a, input')) return;
    this.lib.pick(this.track().id, e);
  }

  cell(col: ColumnKey): string {
    return String(this.track()[col as keyof Track] ?? '');
  }
}
