import { NgTemplateOutlet } from '@angular/common';
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
import { SwipeReviewModal } from './features/library/swipe-review-modal';
import { DuplicatesModal } from './features/library/duplicates-modal';
import { EditModal } from './features/library/edit-modal';
import { LibraryTable } from './features/library/library-table';
import { LibraryToolbar } from './features/library/library-toolbar';
import { RemoveModal } from './features/library/remove-modal';
import { OpenEdit } from './features/library/track-row';
import { LyricsPanel } from './features/lyrics/lyrics-panel';
import { MaintenanceModal } from './features/settings/maintenance-modal';
import { RemoteModal } from './features/settings/remote-modal';
import { SourcesModal } from './features/settings/sources-modal';
import { StructureModal } from './features/settings/structure-modal';
import { Navbar } from './layout/navbar';
import { Icon } from './shared/icon';
import { ToastContainer } from './shared/toast-container';

type View = 'library' | 'inbox' | 'setup';
type Dialog = 'sources' | 'structure' | 'maintenance' | 'duplicates' | 'swipe' | 'remote' | null;

@Component({
  selector: 'app-root',
  imports: [
    NgTemplateOutlet, Navbar, ImportPanel, InboxPanel, LyricsPanel, JobConsole, LibraryToolbar, LibraryTable, Icon, ToastContainer,
    EditModal, RemoveModal, DuplicatesModal, SwipeReviewModal, SourcesModal, StructureModal, MaintenanceModal, RemoteModal,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #tabsTpl>
      <button role="tab" class="tab flex-1 gap-2 flex-nowrap whitespace-nowrap items-center" [class.tab-active]="view() === 'library'" (click)="view.set('library')"><app-icon name="library" [size]="16" /> Library</button>
      <button role="tab" class="tab flex-1 gap-2 flex-nowrap whitespace-nowrap items-center" [class.tab-active]="view() === 'inbox'" (click)="openInbox()"><app-icon name="inbox" [size]="16" /> Inbox @if (inbox.newCount()) { <span class="badge badge-sm badge-success">{{ inbox.newCount() }}</span> }</button>
      <button role="tab" class="tab flex-1 gap-2 flex-nowrap whitespace-nowrap items-center lg:hidden" [class.tab-active]="view() === 'setup'" (click)="view.set('setup')"><app-icon name="sliders" [size]="16" /> Setup</button>
    </ng-template>
    <ng-template #statsTpl let-compact="compact">
      @for (st of statCards(); track st.label) {
        @if (compact) {
          <div class="flex items-baseline gap-1 px-2 py-1 whitespace-nowrap"><span class="font-bold tabular-nums">{{ st.value }}</span><span class="text-[11px] uppercase tracking-wide opacity-70">{{ st.label }}</span></div>
        } @else {
          <div class="glass-panel py-2 px-1"><div class="text-[11px] uppercase tracking-wide opacity-70">{{ st.label }}</div><div class="text-xl font-bold leading-tight">{{ st.value }}</div></div>
        }
      }
    </ng-template>
    <div class="h-dvh flex flex-col overflow-hidden">
      @if (!maximized()) {
        <app-navbar [online]="online()" [checks]="checks()" (structure)="dialog.set('structure')" (sources)="dialog.set('sources')" (maintenance)="dialog.set('maintenance')" (remote)="dialog.set('remote')">
          <div navCenter class="flex items-center gap-3 xl:gap-8 min-w-0 w-full justify-center max-sm:hidden">
            <div role="tablist" class="tabs tabs-box tabs-sm p-1 shrink-0"><ng-container *ngTemplateOutlet="tabsTpl" /></div>
            <div class="items-center gap-2 max-xl:hidden xl:flex"><ng-container *ngTemplateOutlet="statsTpl; context: { compact: true }" /></div>
          </div>
        </app-navbar>
      }

      <div class="flex-1 min-h-0 flex flex-col gap-2 lg:grid lg:gap-4 lg:grid-rows-[minmax(0,1fr)]" [class]="layoutClass()">
        @if (!maximized()) {
          <aside class="flex-col gap-4 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden [&>*]:shrink-0 [&>*]:min-w-0 max-lg:order-2 max-lg:flex-1" [class]="view() === 'setup' ? 'flex' : 'hidden lg:flex'">
            <app-import-panel (structure)="dialog.set('structure')" />
            <app-lyrics-panel />
          </aside>
        }

        <main class="flex flex-col gap-3 min-w-0 min-h-0 max-lg:order-1" [class]="view() === 'setup' && !maximized() ? 'max-lg:flex-none' : 'flex-1'">
          @if (!maximized()) {
          <div role="tablist" class="tabs tabs-box w-full glass-panel p-1 sm:hidden max-sm:fixed max-sm:bottom-[calc(0.75rem+var(--sab))] max-sm:inset-x-3 max-sm:w-auto max-sm:z-30 max-sm:shadow-xl">
            <ng-container *ngTemplateOutlet="tabsTpl" />
          </div>
          }

          <div class="flex-1 min-h-0 flex-col gap-3" [class]="view() === 'setup' && !maximized() ? 'hidden lg:flex' : 'flex'">
          @if (!maximized()) { <app-job-console class="shrink-0" /> }

          @if (view() === 'inbox') {
            <app-inbox-panel />
          } @else {
            @if (!maximized()) {
              <div class="grid grid-cols-4 gap-2 text-center anim-fade shrink-0 xl:hidden"><ng-container *ngTemplateOutlet="statsTpl; context: { compact: false }" /></div>
            }
            <app-library-toolbar class="shrink-0" [maximized]="maximized()" (maximizeToggle)="maximized.set(!maximized())" (duplicates)="dialog.set('duplicates')" (swipe)="dialog.set('swipe')" (remove)="startRemove($event)" />
            <app-library-table (open)="edit.set($event)" (remove)="removeIds.set([$event])" />
          }
          </div>
        </main>
      </div>
    </div>

    @if (edit(); as e) { <app-edit-modal [track]="e.track" [initialTab]="e.tab" (closed)="edit.set(null)" /> }
    @if (removeIds() !== undefined) { <app-remove-modal [ids]="removeIds()!" (closed)="removeIds.set(undefined)" /> }
    @switch (dialog()) {
      @case ('sources') { <app-sources-modal (closed)="dialog.set(null)" /> }
      @case ('structure') { <app-structure-modal (closed)="dialog.set(null)" /> }
      @case ('maintenance') { <app-maintenance-modal (closed)="dialog.set(null)" /> }
      @case ('remote') { <app-remote-modal (closed)="dialog.set(null)" /> }
      @case ('swipe') { <app-swipe-review-modal (closed)="dialog.set(null)" /> }
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

  layoutClass() {
    if (this.maximized()) return 'p-1.5 pt-[calc(0.375rem+var(--sat))] pb-[calc(0.375rem+var(--sab))] lg:p-2 lg:grid-cols-1';
    return 'px-2 pt-2 max-sm:pb-[calc(4rem+var(--sab))] lg:p-4 lg:grid-cols-[22rem_minmax(0,1fr)]';
  }
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

