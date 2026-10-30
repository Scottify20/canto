import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from './core/api.service';
import { InboxStore } from './core/inbox.store';
import { JobStore } from './core/job.store';
import { LibraryStore } from './core/library.store';
import { SystemCheck } from './core/models';
import { SettingsStore } from './core/settings.store';
import { ImportPanel } from './features/import/import-panel';
import { InboxPanel } from './features/inbox/inbox-panel';
import { JobConsole } from './features/jobs/job-console';
import { DuplicatesModal } from './features/library/duplicates-modal';
import { EditModal } from './features/library/edit-modal';
import { LibraryTable } from './features/library/library-table';
import { LibraryToolbar } from './features/library/library-toolbar';
import { RemoveModal } from './features/library/remove-modal';
import { OpenEdit } from './features/library/track-row';
import { LyricsPanel } from './features/lyrics/lyrics-panel';
import { MaintenanceModal } from './features/settings/maintenance-modal';
import { SourcesModal } from './features/settings/sources-modal';
import { StructureModal } from './features/settings/structure-modal';
import { Navbar } from './layout/navbar';
import { Icon } from './shared/icon';
import { ToastContainer } from './shared/toast-container';

type View = 'library' | 'inbox' | 'setup';
type Dialog = 'sources' | 'structure' | 'maintenance' | 'duplicates' | null;

@Component({
  selector: 'app-root',
  imports: [
    Navbar, ImportPanel, InboxPanel, LyricsPanel, JobConsole, LibraryToolbar, LibraryTable, Icon, ToastContainer,
    EditModal, RemoveModal, DuplicatesModal, SourcesModal, StructureModal, MaintenanceModal,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen flex flex-col">
      <app-navbar [online]="online()" [checks]="checks()" (structure)="dialog.set('structure')" (sources)="dialog.set('sources')" (maintenance)="dialog.set('maintenance')" />

      <div class="flex-1 grid gap-4 p-3 sm:p-4" [class]="maximized() ? 'grid-cols-1' : 'lg:grid-cols-[22rem_1fr]'">
        @if (!maximized()) {
          <aside class="flex-col gap-4 min-w-0" [class]="view() === 'setup' ? 'flex' : 'hidden lg:flex'">
            <app-import-panel (structure)="dialog.set('structure')" />
            <app-lyrics-panel />
          </aside>
        }

        <main class="flex flex-col gap-3 min-w-0" [class.max-lg:hidden]="view() === 'setup' && !maximized()">
          <div role="tablist" class="tabs tabs-box w-full glass-panel p-1">
            <button role="tab" class="tab flex-1 gap-2" [class.tab-active]="view() === 'library'" (click)="view.set('library')"><app-icon name="library" [size]="16" /> Library <span class="badge badge-sm">{{ lib.stats().total }}</span></button>
            <button role="tab" class="tab flex-1 gap-2" [class.tab-active]="view() === 'inbox'" (click)="openInbox()"><app-icon name="inbox" [size]="16" /> Inbox @if (inbox.newCount()) { <span class="badge badge-sm badge-success">{{ inbox.newCount() }}</span> }</button>
            <button role="tab" class="tab flex-1 gap-2 lg:hidden" [class.tab-active]="view() === 'setup'" (click)="view.set('setup')"><app-icon name="settings" [size]="16" /> Setup</button>
          </div>

          <app-job-console />

          @if (view() === 'inbox') {
            <app-inbox-panel />
          } @else {
            <div class="grid grid-cols-4 gap-2 text-center anim-fade">
              @for (st of statCards(); track st.label) {
                <div class="glass-panel py-2 px-1"><div class="text-[11px] uppercase tracking-wide opacity-70">{{ st.label }}</div><div class="text-xl font-bold leading-tight">{{ st.value }}</div></div>
              }
            </div>
            <app-library-toolbar [maximized]="maximized()" (maximizeToggle)="maximized.set(!maximized())" (duplicates)="dialog.set('duplicates')" (remove)="startRemove($event)" />
            <app-library-table [maxHeight]="maximized() ? 'calc(100vh - 17rem)' : 'calc(100vh - 25rem)'" (open)="edit.set($event)" (remove)="removeIds.set([$event])" />
          }
        </main>
      </div>
    </div>

    @if (edit(); as e) { <app-edit-modal [track]="e.track" [initialTab]="e.tab" (closed)="edit.set(null)" /> }
    @if (removeIds() !== undefined) { <app-remove-modal [ids]="removeIds()!" (closed)="removeIds.set(undefined)" /> }
    @switch (dialog()) {
      @case ('sources') { <app-sources-modal (closed)="dialog.set(null)" /> }
      @case ('structure') { <app-structure-modal (closed)="dialog.set(null)" /> }
      @case ('maintenance') { <app-maintenance-modal (closed)="dialog.set(null)" /> }
      @case ('duplicates') { <app-duplicates-modal (closed)="dialog.set(null)" /> }
    }
    <app-toast-container />
  `,
})
export class App implements OnInit {
  private api = inject(ApiService);
  private settings = inject(SettingsStore);
  private jobs = inject(JobStore);
  lib = inject(LibraryStore);
  inbox = inject(InboxStore);

  online = signal(false);
  checks = signal<SystemCheck[]>([]);
  maximized = signal(false);
  view = signal<View>('library');
  dialog = signal<Dialog>(null);
  edit = signal<OpenEdit | null>(null);
  /** undefined = dialog closed, null = whole library, array = specific tracks */
  removeIds = signal<number[] | null | undefined>(undefined);

  statCards = () => {
    const s = this.lib.stats();
    return [
      { label: 'Tracks', value: s.total },
      { label: 'Covers', value: s.cover },
      { label: 'LRC', value: s.lrc },
      { label: 'TTML', value: s.ttml },
    ];
  };

  async ngOnInit() {
    await this.checkBackend();
    if (!this.online()) {
      setTimeout(() => this.ngOnInit(), 3000);
      return;
    }
    await this.settings.hydrateFromBackend();
    await this.lib.load();
    await this.jobs.resume();
    if (!this.lib.tracks().length && this.settings.inputPath()) this.view.set('inbox');
    void this.inbox.refresh(true);
  }

  openInbox() {
    this.view.set('inbox');
    void this.inbox.refresh(true);
  }

  startRemove(scope: 'selected' | 'all') {
    this.removeIds.set(scope === 'all' ? null : [...this.lib.selected()]);
  }

  private async checkBackend() {
    try {
      const s = await this.api.status();
      this.online.set(true);
      this.checks.set(s.checks);
    } catch {
      this.online.set(false);
    }
  }
}

