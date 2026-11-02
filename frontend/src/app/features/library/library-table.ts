import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { LibraryStore } from '../../core/library.store';
import { SettingsStore } from '../../core/settings.store';
import { Icon } from '../../shared/icon';
import { OpenEdit, TrackRow } from './track-row';

@Component({
  selector: 'app-library-table',
  imports: [TrackRow, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col flex-1 min-h-0', '(document:keydown)': 'onKey($event)' },
  template: `
    <div class="glass-panel overflow-auto flex-1 min-h-0">
      <table class="table table-sm table-pin-rows compact-table">
        <thead>
          <tr>
            <th class="w-8"><input type="checkbox" class="checkbox checkbox-xs" [checked]="allOnPage()" (change)="lib.selectPage($any($event.target).checked)" aria-label="Select page" /></th>
            <th class="w-12"></th>
            @for (c of columns(); track c.key) {
              <th class="cursor-pointer select-none whitespace-nowrap" (click)="lib.sortBy(c.key)" [title]="c.tip + ' (click to sort)'">
                {{ c.label }}
                @if (lib.sortKey() === c.key) { <app-icon [name]="lib.sortDir() === 1 ? 'up' : 'down'" [size]="12" /> }
              </th>
            }
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        @for (t of lib.pageRows(); track t.id) {
          <tbody app-track-row [track]="t" (open)="open.emit($event)" (remove)="remove.emit($event)"></tbody>
        }
      </table>
      @if (lib.loading() && !lib.tracks().length) {
        <div class="p-10 text-center"><span class="loading loading-spinner"></span></div>
      } @else if (!lib.filtered().length) {
        <div class="p-10 text-center opacity-70">
          @if (lib.tracks().length) { No tracks match the current search or filter. }
          @else { Your library is empty. Open the <b>Inbox</b> tab to import songs. }
        </div>
      }
    </div>
    @if (lib.pageCount() > 1) {
      <div class="flex justify-center items-center gap-2 mt-2 shrink-0">
        <button class="btn btn-xs btn-ghost" [disabled]="page() === 0" (click)="go(-1)"><app-icon name="left" /></button>
        <span class="text-sm">Page {{ page() + 1 }} / {{ lib.pageCount() }}</span>
        <button class="btn btn-xs btn-ghost" [disabled]="page() >= lib.pageCount() - 1" (click)="go(1)"><app-icon name="right" /></button>
      </div>
    }
  `,
})
export class LibraryTable {
  lib = inject(LibraryStore);
  private s = inject(SettingsStore);
  go(delta: number) { this.lib.page.set(Math.max(0, Math.min(this.lib.pageCount() - 1, this.page() + delta))); }
  /** Ctrl/Cmd+A selects every track that matches the current filter (unless typing or a dialog is open). */
  onKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a' || el.closest('input, textarea, select, [contenteditable]') || document.querySelector('[role=dialog]')) return;
    e.preventDefault();
    this.lib.selectAllFiltered();
  }
  open = output<OpenEdit>();
  remove = output<number>();

  columns = computed(() => this.lib.columns.filter((c) => this.s.visibleColumns().includes(c.key)));
  page = this.lib.currentPage;
  allOnPage = computed(() => this.lib.pageRows().length > 0 && this.lib.pageRows().every((t) => this.lib.selected().has(t.id)));
}
