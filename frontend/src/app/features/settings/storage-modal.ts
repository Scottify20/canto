import { ChangeDetectionStrategy, Component, OnInit, inject, output, signal } from '@angular/core';
import { SettingsStore } from '../../core/settings.store';
import { formatBytes } from '../../shared/format';
import { InfoTip } from '../../shared/info-tip';
import { Modal } from '../../shared/modal';

@Component({
  selector: 'app-storage-modal',
  imports: [Modal, InfoTip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal title="Storage" icon="disc" widthClass="max-w-xl" (closed)="closed.emit()">
      <p class="text-sm opacity-80 mb-3">Free space on the drives that hold your library. When a drive falls below the limit, imports and other actions that write files are paused so nothing is half-saved. <app-info-tip text="Each folder is measured on the drive it lives on. Folders that share a drive show the same numbers." /></p>
      <ul class="flex flex-col gap-3">
        @for (d of s.storage(); track d.key) {
          <li class="rounded-xl border border-base-content/10 bg-base-content/5 p-3 anim-slide">
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium">{{ d.label }}</span>
              @if (!d.online) { <span class="badge badge-error badge-sm">drive offline</span> }
              @else if (d.low) { <span class="badge badge-warning badge-sm">low space</span> }
              @else { <span class="badge badge-success badge-sm">ok</span> }
            </div>
            <div class="text-xs opacity-60 break-all">{{ d.path }}</div>
            @if (d.online && d.total) {
              <progress class="progress w-full my-2" [class]="d.low ? 'progress-warning' : 'progress-primary'" [value]="d.used" [max]="d.total"></progress>
              <div class="text-xs opacity-80">{{ bytes(d.free) }} free of {{ bytes(d.total) }}</div>
            }
          </li>
        } @empty {
          <li class="text-sm opacity-70">No folders are set up yet.</li>
        }
      </ul>
      <label class="form-control mt-4">
        <span class="label-text mb-1">Pause when less than this much is free (GB)</span>
        <input type="number" min="0" step="0.5" class="input input-bordered w-40" [value]="limit()" (input)="limit.set(+$any($event.target).value)" />
      </label>
      <ng-container actions>
        <button class="btn btn-ghost" (click)="closed.emit()">Close</button>
        <button class="btn btn-primary" [disabled]="busy() || limit() < 0 || limit() === s.minFreeGb()" (click)="save()">Save limit</button>
      </ng-container>
    </app-modal>
  `,
})
export class StorageModal implements OnInit {
  protected readonly s = inject(SettingsStore);
  readonly closed = output<void>();
  protected readonly limit = signal(4);
  protected readonly busy = signal(false);
  protected readonly bytes = formatBytes;

  ngOnInit() {
    this.limit.set(this.s.minFreeGb());
    void this.s.refreshFolders();
  }

  async save() {
    this.busy.set(true);
    await this.s.save({ min_free_gb: this.limit() }, true);
    this.busy.set(false);
  }
}
