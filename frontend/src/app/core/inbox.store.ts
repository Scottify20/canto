import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService, errorMessage } from './api.service';
import { InboxFile, InboxScan } from './models';
import { JobStore } from './job.store';
import { SettingsStore } from './settings.store';
import { ToastService } from './toast.service';

/** The "inbox" is the raw input folder: scanned, reviewed, then imported into the library. */
@Injectable({ providedIn: 'root' })
export class InboxStore {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private settings = inject(SettingsStore);
  private jobs = inject(JobStore);

  readonly scan = signal<InboxScan | null>(null);
  readonly scanning = signal(false);
  readonly selected = signal<ReadonlySet<string>>(new Set());

  readonly files = computed(() => this.scan()?.files ?? []);
  readonly importable = computed(() => this.files().filter((f) => f.status !== 'corrupt'));
  readonly newCount = computed(() => this.files().filter((f) => f.status === 'new').length);
  readonly target = computed(() => {
    const sel = this.selected();
    return sel.size ? this.files().filter((f) => sel.has(f.path)) : this.files().filter((f) => f.status === 'new');
  });

  async refresh(quiet = false) {
    await this.settings.flush();
    if (!this.settings.inputPath()) { this.scan.set(null); return; }
    this.scanning.set(true);
    try {
      const result = await this.api.inboxScan();
      this.scan.set(result);
      const paths = new Set(result.files.map((f) => f.path));
      this.selected.update((s) => new Set([...s].filter((p) => paths.has(p))));
    } catch (e) {
      this.scan.set(null);
      if (!quiet) this.toast.error(errorMessage(e));
    } finally {
      this.scanning.set(false);
    }
  }

  toggle(file: InboxFile) {
    this.selected.update((s) => { const n = new Set(s); n.has(file.path) ? n.delete(file.path) : n.add(file.path); return n; });
  }
  selectNew() { this.selected.set(new Set(this.files().filter((f) => f.status === 'new').map((f) => f.path))); }
  selectAll() { this.selected.set(new Set(this.importable().map((f) => f.path))); }
  clearSelection() { this.selected.set(new Set()); }

  async startImport(all: boolean) {
    if (!this.settings.outputPath() || !this.settings.inputPath()) {
      this.toast.warn('Choose an input and an output folder first');
      return;
    }
    await this.settings.flush();
    const files = all ? null : this.target().map((f) => f.path);
    if (files && !files.length) { this.toast.info('Nothing new to import'); return; }
    await this.jobs.start(() => this.api.startImport(files));
    this.selected.set(new Set());
  }
}
