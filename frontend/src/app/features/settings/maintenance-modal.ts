import { ChangeDetectionStrategy, Component, OnInit, inject, output, signal } from '@angular/core';
import { ApiService, errorMessage } from '../../core/api.service';
import { LibraryStore } from '../../core/library.store';
import { MaintenanceScan } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { formatBytes } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';

const ORDER = ['missing', 'tmp', 'empty_dirs', 'orphans', 'db_backups', 'http_cache'] as const;
const TIPS: Record<string, string> = {
  missing: 'Entries stay in the library after their file is deleted outside Canto. They cannot be played, analysed or edited.',
  tmp: 'Half-written files from an interrupted save. Safe to delete.',
  empty_dirs: 'Folders left behind after songs were moved or removed.',
  orphans: 'Lyrics/text files whose song no longer exists.',
  db_backups: 'Automatic safety copies the library database makes when it upgrades. Keep the newest if unsure.',
  http_cache: 'Saved answers from lyrics, cover and metadata services (kept 12 h so repeat fetches do not hit rate limits). Clear it to force fresh lookups.',
};

@Component({
  selector: 'app-maintenance-modal',
  imports: [Modal, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal title="Cleanup & maintenance" icon="clean" widthClass="max-w-2xl" (closed)="closed.emit()">
      <p class="text-sm opacity-80 mb-3">
        Canto already removes temporary files whenever the engine starts or stops. Use this window for everything else.
        Nothing is deleted until you tick it and press <b>Clean selected</b>.
      </p>
      @if (scan(); as sc) {
        <ul class="flex flex-col gap-2">
          @for (key of order; track key) {
            <li class="rounded-xl border border-base-content/10 bg-base-content/5 p-3 flex items-start gap-3 anim-slide">
              <input type="checkbox" class="checkbox checkbox-sm mt-1" [disabled]="!sc[key].count" [checked]="picked().has(key)" (change)="toggle(key)" [attr.aria-label]="sc[key].label" />
              <div class="grow min-w-0">
                <div class="font-medium">{{ sc[key].label }}</div>
                <div class="text-xs opacity-70">{{ tips[key] }}</div>
                @if (sc[key].examples?.length) { <div class="text-xs opacity-60 truncate mt-1">e.g. {{ sc[key].examples![0] }}</div> }
              </div>
              <span class="badge" [class]="sc[key].count ? 'badge-warning' : 'badge-ghost'">
                {{ sc[key].count }}{{ sc[key].bytes ? ' · ' + bytes(sc[key].bytes!) : '' }}
              </span>
            </li>
          }
        </ul>
      } @else {
        <div class="p-8 text-center"><span class="loading loading-spinner"></span></div>
      }
      <ng-container actions>
        <button class="btn btn-ghost" (click)="load()"><app-icon name="refresh" /> Rescan</button>
        <button class="btn btn-primary" [disabled]="!picked().size || busy()" (click)="run()"><app-icon name="trash" /> Clean selected</button>
      </ng-container>
    </app-modal>
  `,
})
export class MaintenanceModal implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private lib = inject(LibraryStore);
  closed = output<void>();

  order = ORDER;
  tips = TIPS;
  bytes = formatBytes;
  scan = signal<MaintenanceScan | null>(null);
  picked = signal<ReadonlySet<string>>(new Set());
  busy = signal(false);

  ngOnInit() {
    void this.load();
  }

  async load() {
    try {
      const sc = await this.api.maintenanceScan();
      this.scan.set(sc);
      this.picked.set(new Set(['missing', 'tmp', 'empty_dirs'].filter((k) => sc[k as keyof MaintenanceScan].count)));
    } catch (e) {
      this.toast.error(errorMessage(e));
    }
  }

  toggle(key: string) {
    this.picked.update((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  async run() {
    this.busy.set(true);
    try {
      const { done } = await this.api.maintenanceRun([...this.picked()]);
      const total = Object.values(done).reduce((a, b) => a + b, 0);
      this.toast.success(`Cleanup finished (${total} item(s))`);
      await this.lib.load(true);
      await this.load();
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
