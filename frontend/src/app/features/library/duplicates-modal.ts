import { ChangeDetectionStrategy, Component, OnInit, inject, output, signal } from '@angular/core';
import { ApiService, errorMessage } from '../../core/api.service';
import { LibraryStore } from '../../core/library.store';
import { DuplicateGroup } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';

@Component({
  selector: 'app-duplicates-modal',
  imports: [Modal, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal title="Duplicate songs" icon="copy" widthClass="max-w-3xl" (closed)="closed.emit()">
      <p class="text-sm opacity-80 mb-3">
        Songs with the same artist and title and almost the same length are grouped here. Canto suggests keeping the best copy
        (lossless first, then bitrate). Tick the copies you want to delete.
      </p>
      @if (loading()) { <div class="p-8 text-center"><span class="loading loading-spinner"></span></div> }
      @else {
        @for (g of groups(); track g.keep_id) {
          <div class="rounded-xl border border-base-content/10 bg-base-content/5 p-2 mb-3 anim-slide">
            <ul class="flex flex-col divide-y divide-base-content/10">
              @for (t of g.tracks; track t.id) {
                <li class="flex items-center gap-3 py-2 px-1">
                  <input type="checkbox" class="checkbox checkbox-sm checkbox-error" [checked]="doomed().has(t.id)" (change)="toggle(t.id)" [attr.aria-label]="'Delete ' + t.path" />
                  <div class="min-w-0 grow">
                    <div class="font-medium truncate">{{ t.artist }} – {{ t.title }}</div>
                    <div class="text-xs opacity-70 truncate" [title]="t.path">{{ t.path }}</div>
                  </div>
                  <div class="flex flex-wrap gap-1 justify-end">
                    @if (t.id === g.keep_id) { <span class="badge badge-success badge-sm">Best</span> }
                    <span class="badge badge-ghost badge-sm">{{ t.format }}</span>
                    <span class="badge badge-ghost badge-sm">{{ (t.bitrate / 1000).toFixed(0) }} kbps</span>
                    @if (!t.exists) { <span class="badge badge-error badge-sm">missing</span> }
                  </div>
                </li>
              }
            </ul>
          </div>
        } @empty {
          <div class="p-8 text-center opacity-70"><app-icon name="ok" [size]="28" class="text-success" /><div class="mt-2">No duplicates found. Nice and tidy.</div></div>
        }
      }
      <ng-container actions>
        <button class="btn btn-ghost" [disabled]="!groups().length" (click)="suggest()">Select suggested</button>
        <button class="btn btn-error" [disabled]="!doomed().size || busy()" (click)="remove()"><app-icon name="trash" /> Delete {{ doomed().size }} copy(ies)</button>
      </ng-container>
    </app-modal>
  `,
})
export class DuplicatesModal implements OnInit {
  private api = inject(ApiService);
  private lib = inject(LibraryStore);
  private toast = inject(ToastService);
  closed = output<void>();

  groups = signal<DuplicateGroup[]>([]);
  doomed = signal<ReadonlySet<number>>(new Set());
  loading = signal(true);
  busy = signal(false);

  async ngOnInit() {
    try {
      this.groups.set(await this.api.duplicates());
      this.suggest();
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  suggest() {
    this.doomed.set(new Set(this.groups().flatMap((g) => g.tracks.filter((t) => t.id !== g.keep_id).map((t) => t.id))));
  }
  toggle(id: number) {
    this.doomed.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async remove() {
    this.busy.set(true);
    await this.lib.remove([...this.doomed()], true);
    this.groups.set(await this.api.duplicates().catch(() => []));
    this.suggest();
    this.busy.set(false);
  }
}
