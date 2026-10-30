import { Injectable, effect, inject, signal } from '@angular/core';
import { ApiService, errorMessage } from './api.service';
import { COLUMNS, ColumnKey, DuplicateAction, ProviderState, Settings, SettingsUpdate } from './models';
import { ToastService } from './toast.service';

const STORAGE_KEY = 'canto_ui_v3';
const DEFAULT_COLUMNS: ColumnKey[] = ['title', 'artist', 'album', 'initial_key', 'status'];

/**
 * Engine settings live on the backend (the single source of truth, so they survive a cleared browser);
 * purely visual preferences (columns, theme, page size, lyrics overwrite flags) stay in localStorage.
 */
@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly inputPath = signal('');
  readonly outputPath = signal('');
  readonly folderStructure = signal('$albumartist/$album/$title');
  readonly tolerance = signal(0.04);
  readonly deleteOriginals = signal(false);
  readonly duplicateAction = signal<DuplicateAction>('skip');
  readonly pruneEmptyDirs = signal(true);
  readonly hasDiscogsToken = signal(false);
  readonly providers = signal<ProviderState[]>([]);

  readonly overwriteLrc = signal(false);
  readonly overwriteTtml = signal(false);
  readonly visibleColumns = signal<ColumnKey[]>(DEFAULT_COLUMNS);
  readonly pageSize = signal(100);
  readonly theme = signal<'light' | 'dark'>('dark');

  private syncTimer?: ReturnType<typeof setTimeout>;
  private pending: SettingsUpdate = {};

  constructor() {
    this.restore();
    effect(() => {
      const snapshot = {
        overwriteLrc: this.overwriteLrc(),
        overwriteTtml: this.overwriteTtml(),
        columns: this.visibleColumns(),
        pageSize: this.pageSize(),
        theme: this.theme(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      document.documentElement.setAttribute('data-theme', snapshot.theme);
    });
  }

  private restore() {
    try {
      const c = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (!c) return;
      this.overwriteLrc.set(!!c.overwriteLrc);
      this.overwriteTtml.set(!!c.overwriteTtml);
      const valid = new Set(COLUMNS.map((col) => col.key));
      if (Array.isArray(c.columns)) this.visibleColumns.set(c.columns.filter((k: ColumnKey) => valid.has(k)));
      this.pageSize.set(c.pageSize ?? 100);
      this.theme.set(c.theme === 'light' ? 'light' : 'dark');
    } catch {
      /* ignore corrupt storage */
    }
  }

  async hydrateFromBackend() {
    try {
      this.apply(await this.api.getSettings());
    } catch {
      /* backend offline: status check reports it */
    }
  }

  private apply(s: Settings) {
    this.inputPath.set(s.input_path);
    this.outputPath.set(s.output_path);
    this.folderStructure.set(s.folder_structure);
    this.tolerance.set(s.tolerance);
    this.deleteOriginals.set(s.delete_originals);
    this.duplicateAction.set(s.duplicate_action);
    this.pruneEmptyDirs.set(s.prune_empty_dirs);
    this.hasDiscogsToken.set(s.has_discogs_token);
    this.providers.set(s.providers);
  }

  toggleColumn(key: ColumnKey, on: boolean) {
    this.visibleColumns.update((cols) => (on ? [...cols, key] : cols.filter((c) => c !== key)));
  }

  /** Update signals immediately and push to the backend after a short pause (keeps typing smooth). */
  set<K extends 'inputPath' | 'outputPath' | 'folderStructure' | 'deleteOriginals' | 'duplicateAction' | 'pruneEmptyDirs'>(
    key: K,
    value: this[K] extends { (): infer V } ? V : never,
  ) {
    const map = {
      inputPath: 'input_path', outputPath: 'output_path', folderStructure: 'folder_structure',
      deleteOriginals: 'delete_originals', duplicateAction: 'duplicate_action', pruneEmptyDirs: 'prune_empty_dirs',
    } as const;
    (this[key] as unknown as { set(v: unknown): void }).set(value);
    this.pending = { ...this.pending, [map[key]]: value };
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => void this.flush(), 500);
  }

  async flush(): Promise<boolean> {
    clearTimeout(this.syncTimer);
    const update = this.pending;
    this.pending = {};
    if (!Object.keys(update).length) return true;
    return this.save(update);
  }

  /** Send a settings change (providers, tokens, structure, …) and adopt the backend's normalised answer. */
  async save(update: SettingsUpdate, announce = false): Promise<boolean> {
    try {
      this.apply(await this.api.saveSettings(update));
      if (announce) this.toast.success('Settings saved');
      return true;
    } catch (e) {
      this.toast.error(errorMessage(e));
      return false;
    }
  }
}
