import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { LibraryStore } from '../../core/library.store';
import { ColumnKey, Track } from '../../core/models';
import { SettingsStore } from '../../core/settings.store';
import { formatDuration } from '../../shared/format';
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
    >
      <td class="w-8">
        <input
          type="checkbox"
          class="checkbox checkbox-xs"
          [checked]="selected()"
          (change)="lib.toggleSelect(track().id)"
          [attr.aria-label]="'Select ' + track().title"
        />
      </td>
      <td class="w-12 p-1 ">
        @if (track().has_cover && !coverFailed) {
          <img
            class="w-10 h-10 min-w-10 rounded-lg object-cover bg-base-300 shadow"
            loading="lazy"
            [src]="api.coverUrl(track().id, 96, lib.coverVersion())"
            alt=""
            (error)="coverFailed = true"
          />
        } @else {
          <div class="w-10 h-10 rounded-lg bg-base-300/70 grid place-items-center opacity-60">
            <app-icon name="disc" [size]="18" />
          </div>
        }
      </td>
      @for (col of columns(); track col.key) {
        @switch (col.key) {
          @case ('status') {
            <td>
              <div class="flex flex-wrap gap-1">
                <button
                  class="badge badge-sm cursor-pointer tooltip"
                  [class]="track().has_cover ? 'badge-success badge-soft' : 'badge-ghost'"
                  [attr.data-tip]="
                    track().has_cover ? 'Embedded cover art – click to manage' : 'No cover art – click to add'
                  "
                  (click)="open.emit({ track: track(), tab: 'cover' })"
                >
                  <app-icon name="image" [size]="12" />
                </button>
                <button
                  class="badge badge-sm cursor-pointer tooltip"
                  [class]="track().has_ttml ? 'badge-success badge-soft' : 'badge-ghost'"
                  [attr.data-tip]="track().has_ttml ? 'TTML lyrics present' : 'No TTML lyrics'"
                  (click)="open.emit({ track: track(), tab: 'lyrics' })"
                >
                  <app-icon [name]="track().has_ttml ? 'ok' : 'no'" [size]="12" />
                  TTML
                </button>
                <button
                  class="badge badge-sm cursor-pointer tooltip"
                  [class]="track().has_lrc ? 'badge-success badge-soft' : 'badge-ghost'"
                  [attr.data-tip]="track().has_lrc ? 'LRC lyrics present' : 'No LRC lyrics'"
                  (click)="open.emit({ track: track(), tab: 'lyrics' })"
                >
                  <app-icon [name]="track().has_lrc ? 'ok' : 'no'" [size]="12" />
                  LRC
                </button>
                @if (!track().exists) {
                  <span
                    class="badge badge-sm badge-error tooltip"
                    data-tip="The audio file is gone from disk. Remove this entry."
                  >
                    missing file
                  </span>
                }
                @if (track().dup_group !== null) {
                  <span
                    class="badge badge-sm badge-warning badge-soft tooltip"
                    data-tip="Another copy of this song exists in the library"
                  >
                    duplicate
                  </span>
                }
              </div>
            </td>
          }
          @case ('length') {
            <td class="tabular-nums max-md:hidden">{{ duration() }}</td>
          }
          @case ('path') {
            <td class="font-mono text-xs max-w-xs truncate max-md:hidden" [title]="track().path">{{ track().path }}</td>
          }
          @case ('initial_key') {
            <td>
              @if (track().initial_key) {
                <span class="badge badge-outline badge-sm">{{ track().initial_key }}</span>
              }
            </td>
          }
          @case ('rg_track_gain') {
            <td class="tabular-nums max-md:hidden">{{ gain() }}</td>
          }
          @default {
            <td class="max-w-56 truncate" [class.max-md:hidden]="col.wide" [title]="cell(col.key)">
              {{ cell(col.key) }}
            </td>
          }
        }
      }
      <td class="text-right whitespace-nowrap">
        <button
          class="btn btn-ghost btn-xs btn-square tooltip tooltip-left"
          data-tip="Find metadata online"
          [disabled]="!!busy() || !track().exists"
          (click)="lib.findMatch(track())"
        >
          @if (busy() === 'match') {
            <span class="loading loading-spinner loading-xs"></span>
          } @else {
            <app-icon name="scan" />
          }
        </button>
        <button
          class="btn btn-ghost btn-xs btn-square tooltip tooltip-left"
          data-tip="Fetch lyrics"
          [disabled]="!!busy() || !track().exists"
          (click)="lib.fetchLyrics(track())"
        >
          @if (busy() === 'lyrics') {
            <span class="loading loading-spinner loading-xs"></span>
          } @else {
            <app-icon name="mic" />
          }
        </button>
        <button
          class="btn btn-ghost btn-xs btn-square tooltip tooltip-left"
          data-tip="Edit metadata, lyrics & cover"
          (click)="open.emit({ track: track(), tab: 'meta' })"
        >
          <app-icon name="edit" />
        </button>
        <button
          class="btn btn-ghost btn-xs btn-square text-error tooltip tooltip-left"
          data-tip="Remove from library"
          (click)="remove.emit(track().id)"
        >
          <app-icon name="trash" />
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

  selected = computed(() => this.lib.selected().has(this.track().id));
  busy = computed(() => this.lib.busy()[this.track().id]);
  proposal = computed(() => this.lib.proposals()[this.track().id]);
  columns = computed(() => this.lib.columns.filter((c) => this.s.visibleColumns().includes(c.key)));
  duration = computed(() => formatDuration(this.track().length));
  gain = computed(() => {
    const g = this.track().rg_track_gain;
    return g === '' ? '' : Number(g).toFixed(1);
  });

  cell(col: ColumnKey): string {
    return String(this.track()[col as keyof Track] ?? '');
  }
}
