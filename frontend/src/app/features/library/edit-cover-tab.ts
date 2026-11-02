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
        <div>
          <div class="text-xs font-semibold mb-1">Current cover</div>
          @if (info()?.has) {
            <img class="w-56 max-w-full aspect-square object-cover rounded-xl shadow-lg bg-base-300" [src]="api.coverUrl(track().id, 600, version())" alt="Current cover" />
            <div class="text-xs opacity-70 mt-1">{{ info()!.width }}×{{ info()!.height }} · {{ bytes(info()!.bytes ?? 0) }} · {{ info()!.mime }}</div>
          } @else {
            <div class="w-56 max-w-full aspect-square rounded-xl bg-base-300/60 grid place-items-center text-sm opacity-70"><div class="text-center"><app-icon name="disc" [size]="36" /><div>No embedded cover</div></div></div>
          }
        </div>

        <div class="flex flex-col gap-3 min-w-0">
          <app-cover-dropzone [trackId]="track().id" (changed)="refresh()" />
          <div class="flex flex-wrap gap-2">
            <button class="btn btn-sm btn-outline" [disabled]="!track().exists" (click)="picking.set(true)">
              <app-icon name="search" /> Find online
            </button>
            <button class="btn btn-sm btn-ghost text-error" [disabled]="!info()?.has" (click)="remove()"><app-icon name="trash" /> Remove cover</button>
          </div>
        </div>
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
