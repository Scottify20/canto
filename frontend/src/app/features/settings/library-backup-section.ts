import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ApiService, errorMessage } from '../../core/api.service';
import { LibraryStore } from '../../core/library.store';
import { BackupInfo, RebaseResult } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { InfoTip } from '../../shared/info-tip';
import { PathField } from '../import/path-field';

@Component({
  selector: 'app-library-backup-section',
  imports: [Icon, InfoTip, PathField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-xl border border-base-content/10 bg-base-content/5 p-3 mb-3 flex flex-col gap-3">
      <div class="font-semibold flex items-center gap-2">
        <app-icon name="disc" class="text-primary" /> Library database
        <app-info-tip text="The working database stays on this device (SQLite is unreliable on removable drives and network shares, and the library must still open when a drive is unplugged). A copy is saved in the output folder after changes and when Canto closes, so a new computer can pick the library up. Tags, lyrics and covers live in the files themselves." />
      </div>

      @if (info(); as b) {
        <div class="text-sm flex flex-wrap items-center gap-2">
          @if (b.available) {
            <span class="badge badge-success badge-soft">Backup saved</span>
            <span class="opacity-70">{{ when(b.saved_at) }} · {{ b.tracks }} tracks</span>
          } @else {
            <span class="badge badge-warning badge-soft">No backup yet</span>
          }
          <span class="grow"></span>
          <button class="btn btn-sm btn-ghost" [disabled]="busy() || !b.writable_target" (click)="backup()"><app-icon name="save" /> Back up now</button>
          <button class="btn btn-sm btn-ghost" [disabled]="busy() || !b.available" (click)="confirming.set(true)"><app-icon name="refresh" /> Restore</button>
        </div>
        @if (!b.writable_target) {
          <div class="text-xs text-warning">The output folder isn't available, so the backup can't be saved there.</div>
        }
        @if (confirming()) {
          <div class="alert alert-warning alert-soft text-sm">
            <span>Replace the current library with the saved copy? A safety copy of the current database is kept next to it.</span>
            <div class="flex gap-2">
              <button class="btn btn-xs" (click)="confirming.set(false)">Cancel</button>
              <button class="btn btn-xs btn-warning" [disabled]="busy()" (click)="restore()">Restore</button>
            </div>
          </div>
        }
      }

      <details class="collapse collapse-arrow bg-base-content/5 rounded-lg">
        <summary class="collapse-title text-sm font-medium min-h-0 py-2">Drive letter or folder changed? Repoint the library</summary>
        <div class="collapse-content flex flex-col gap-2 text-sm">
          <p class="opacity-70 text-xs">Moved a music folder, or the drive got a new letter/mount point? Enter where songs <b>used</b> to be and where they are <b>now</b>; every stored path under the old folder is rewritten. Files are not touched.</p>
          <app-path-field label="Old folder" placeholder="/mnt/d/Music" [value]="oldRoot()" (valueChange)="oldRoot.set($event); result.set(null)" />
          <app-path-field label="New folder" placeholder="/mnt/e/Music" [value]="newRoot()" (valueChange)="newRoot.set($event); result.set(null)" />
          @if (result(); as r) {
            <div class="alert alert-soft text-xs" [class.alert-success]="r.applied" [class.alert-info]="!r.applied">
              {{ r.applied ? 'Updated' : 'Would update' }} {{ r.matched }} of {{ r.total }} tracks; {{ r.found_at_new }} found at the new location.
            </div>
          }
          <div class="flex gap-2 justify-end">
            <button class="btn btn-sm btn-ghost" [disabled]="busy() || !oldRoot().trim() || !newRoot().trim()" (click)="rebase(true)">Preview</button>
            <button class="btn btn-sm btn-primary" [disabled]="busy() || !result() || result()!.applied || !result()!.matched" (click)="rebase(false)">Apply</button>
          </div>
        </div>
      </details>
    </section>
  `,
})
export class LibraryBackupSection implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private lib = inject(LibraryStore);

  info = signal<BackupInfo | null>(null);
  busy = signal(false);
  confirming = signal(false);
  oldRoot = signal('');
  newRoot = signal('');
  result = signal<RebaseResult | null>(null);

  ngOnInit() {
    void this.refresh();
  }

  when(ts: number | null) {
    return ts ? new Date(ts * 1000).toLocaleString() : '';
  }

  async refresh() {
    try { this.info.set(await this.api.backupInfo()); } catch { /* offline */ }
  }

  private async run(job: () => Promise<void>) {
    this.busy.set(true);
    try { await job(); } catch (e) { this.toast.error(errorMessage(e)); } finally { this.busy.set(false); }
  }

  backup() {
    return this.run(async () => { this.info.set(await this.api.backupNow()); this.toast.success('Library backup saved'); });
  }

  restore() {
    return this.run(async () => {
      const r = await this.api.restoreBackup();
      this.confirming.set(false);
      await this.lib.load(true);
      this.toast.success(`Library restored (${r.tracks} tracks)`);
    });
  }

  rebase(dry: boolean) {
    return this.run(async () => {
      this.result.set(await this.api.rebasePaths(this.oldRoot(), this.newRoot(), dry));
      if (!dry) { await this.lib.load(true); this.toast.success('Library paths updated'); await this.refresh(); }
    });
  }
}
