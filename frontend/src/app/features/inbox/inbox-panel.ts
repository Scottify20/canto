import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { InboxStore } from '../../core/inbox.store';
import { JobStore } from '../../core/job.store';
import { InboxFile } from '../../core/models';
import { SettingsStore } from '../../core/settings.store';
import { formatDuration } from '../../shared/format';
import { Icon } from '../../shared/icon';

/** Review what is waiting in the input folder before it enters the library. */
@Component({
  selector: 'app-inbox-panel',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="glass-panel anim-slide flex flex-col">
      <div class="flex flex-wrap items-center gap-2 p-3 border-b border-base-content/10">
        <app-icon name="inbox" class="text-primary" />
        <div class="grow min-w-40">
          <div class="font-bold leading-tight">Inbox</div>
          <div class="text-xs opacity-70 truncate">{{ s.inputPath() || 'Choose an input folder first' }}</div>
        </div>
        <button class="btn btn-sm btn-ghost tooltip tooltip-bottom" data-tip="Re-scan the input folder" [disabled]="inbox.scanning() || !s.inputPath()" (click)="inbox.refresh()">
          <span [class.animate-spin]="inbox.scanning()"><app-icon name="refresh" /></span> Scan
        </button>
        <button class="btn btn-sm btn-primary" [disabled]="jobs.running() || !inbox.target().length" (click)="inbox.startImport(false)">
          <app-icon name="download" />
          {{ inbox.selected().size ? 'Import ' + inbox.selected().size + ' selected' : 'Import ' + inbox.target().length + ' new' }}
        </button>
      </div>

      @if (inbox.scan(); as scan) {
        <div class="flex flex-wrap gap-2 items-center px-3 py-2 text-xs">
          <span class="badge badge-success badge-soft">{{ scan.counts.new ?? 0 }} new</span>
          <span class="badge badge-info badge-soft tooltip" data-tip="Already in your library">{{ scan.counts.in_library ?? 0 }} in library</span>
          <span class="badge badge-warning badge-soft tooltip" data-tip="Same song twice in the inbox">{{ scan.counts.in_inbox ?? 0 }} inbox duplicates</span>
          <span class="badge badge-error badge-soft tooltip" data-tip="Unreadable audio; will be skipped">{{ scan.counts.corrupt ?? 0 }} corrupt</span>
          <span class="grow"></span>
          <button class="btn btn-xs btn-ghost" (click)="inbox.selectNew()">Select new</button>
          <button class="btn btn-xs btn-ghost" (click)="inbox.selectAll()">Select all</button>
          <button class="btn btn-xs btn-ghost" [disabled]="!inbox.selected().size" (click)="inbox.clearSelection()">Clear</button>
        </div>
        @if (scan.truncated) { <div class="px-3 pb-2 text-xs text-warning">Only the first files are shown (folder is very large).</div> }

        <ul class="overflow-y-auto divide-y divide-base-content/10" style="max-height: calc(100vh - 22rem); min-height: 8rem">
          @for (f of scan.files; track f.path) {
            <li class="flex items-center gap-3 px-3 py-2 hover:bg-base-content/5" [class.opacity-60]="f.status !== 'new'">
              <input type="checkbox" class="checkbox checkbox-sm" [checked]="inbox.selected().has(f.path)" [disabled]="f.corrupt" (change)="inbox.toggle(f)" [attr.aria-label]="'Select ' + f.title" />
              <div class="min-w-0 grow">
                <div class="font-medium truncate">{{ f.title || f.rel }}</div>
                <div class="text-xs opacity-70 truncate" [title]="f.rel">{{ f.artist || 'Unknown artist' }} · {{ f.rel }}</div>
                @if (f.dup_of) { <div class="text-xs text-warning truncate">Matches library track: {{ f.dup_of.path }}</div> }
              </div>
              <div class="flex flex-wrap justify-end gap-1 shrink-0 max-w-[45%]">
                <span class="badge badge-sm" [class]="statusClass(f)">{{ statusLabel(f) }}</span>
                @if (!f.corrupt) {
                  <span class="badge badge-sm badge-ghost max-sm:hidden">{{ f.format }}{{ f.length ? ' · ' + dur(f.length) : '' }}</span>
                  <span class="badge badge-sm tooltip" [class]="f.has_cover ? 'badge-success badge-soft' : 'badge-ghost'" [attr.data-tip]="f.has_cover ? 'Has embedded cover art' : 'No embedded cover art'"><app-icon name="image" [size]="12" /></span>
                  <span class="badge badge-sm tooltip" [class]="f.has_lrc ? 'badge-success badge-soft' : 'badge-ghost'" [attr.data-tip]="f.has_lrc ? 'Matching .lrc found next to the file' : 'No .lrc next to the file'">LRC</span>
                  <span class="badge badge-sm tooltip" [class]="f.has_ttml ? 'badge-success badge-soft' : 'badge-ghost'" [attr.data-tip]="f.has_ttml ? 'Matching .ttml found next to the file' : 'No .ttml next to the file'">TTML</span>
                }
              </div>
            </li>
          } @empty {
            <li class="p-8 text-center opacity-70">No audio files in this folder.</li>
          }
        </ul>
      } @else {
        <div class="p-8 text-center opacity-70">
          @if (inbox.scanning()) { <span class="loading loading-spinner"></span> }
          @else { Pick an input folder, then press Scan to see what can be imported. }
        </div>
      }
    </section>
  `,
})
export class InboxPanel {
  inbox = inject(InboxStore);
  jobs = inject(JobStore);
  s = inject(SettingsStore);
  dur = formatDuration;

  statusLabel(f: InboxFile) {
    return { new: 'New', in_library: 'In library', in_inbox: 'Duplicate', corrupt: 'Corrupt' }[f.status];
  }
  statusClass(f: InboxFile) {
    return { new: 'badge-success', in_library: 'badge-info badge-soft', in_inbox: 'badge-warning badge-soft', corrupt: 'badge-error' }[f.status];
  }
}
