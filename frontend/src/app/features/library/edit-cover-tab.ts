import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { ApiService, errorMessage } from '../../core/api.service';
import { LibraryStore } from '../../core/library.store';
import { CoverInfo, Track } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { formatBytes } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { CoverDropzone } from './cover-dropzone';
import { CoverPickerModal } from './cover-picker-modal';

/** Embedded artwork: preview, drag-and-drop replacement, online search in a separate dialog. */
@Component({
  selector: 'app-edit-cover-tab',
  imports: [Icon, CoverDropzone, CoverPickerModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      <div class="grid sm:grid-cols-[14rem_1fr] gap-4 items-start">
        <section class="flex flex-col gap-2 max-sm:items-center">
          <div class="text-xs font-semibold self-start">Static cover (embedded in the audio file)</div>
          @if (info()?.has) {
            <img class="w-56 max-w-full aspect-square object-cover rounded-xl shadow-lg bg-base-300" [src]="api.coverUrl(track().id, 600, version())" alt="Current static cover" />
            <div class="text-xs opacity-70 self-start">{{ info()!.width }}×{{ info()!.height }} · {{ bytes(info()!.bytes ?? 0) }} · {{ info()!.mime }}</div>
          } @else {
            <div class="w-56 max-w-full aspect-square rounded-xl bg-base-300/60 grid place-items-center text-sm opacity-70"><div class="text-center"><app-icon name="disc" [size]="36" /><div>No embedded cover</div></div></div>
          }
          <div class="grid grid-cols-2 gap-2 w-56 max-w-full">
            <button class="btn btn-sm btn-outline px-2" [disabled]="!track().exists" (click)="picking.set(true)" title="Search online for a static album cover">
              <app-icon name="search" /> Find
            </button>
            <button class="btn btn-sm btn-ghost text-error px-2" [disabled]="!info()?.has" (click)="remove()" title="Remove the embedded static cover (animated covers are kept)">
              <app-icon name="trash" /> Remove
            </button>
          </div>
        </section>

        <section class="flex flex-col gap-2 min-w-0">
          <div class="text-xs font-semibold">Add or replace covers (static or animated)</div>
          <app-cover-dropzone [trackId]="track().id" (changed)="refresh()" />
        </section>
      </div>

      @if (picking()) {
        <app-cover-picker-modal [track]="track()" [info]="info()" [version]="version()" (closed)="picking.set(false)" (applied)="refresh()" />
      }
    </div>
  `,
})
export class EditCoverTab implements OnInit {
  api = inject(ApiService);
  private lib = inject(LibraryStore);
  private toast = inject(ToastService);

  track = input.required<Track>();

  info = signal<CoverInfo | null>(null);
  version = signal(Date.now());
  picking = signal(false);
  bytes = formatBytes;

  ngOnInit() {
    void this.refresh();
  }

  async refresh() {
    try {
      this.info.set(await this.api.coverInfo(this.track().id));
    } catch {
      this.info.set({ has: false });
    }
    this.version.set(Date.now());
    this.lib.bumpCovers();
    void this.lib.load(true);
  }

  async remove() {
    try {
      await this.api.deleteCover(this.track().id);
      await this.refresh();
    } catch (e) {
      this.toast.error(errorMessage(e));
    }
  }
}
