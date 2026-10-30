import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { LibraryStore } from '../../core/library.store';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';

/** Removes tracks (or the whole library) and makes the "files stay / files deleted" choice explicit. */
@Component({
  selector: 'app-remove-modal',
  imports: [Modal, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [title]="ids() ? 'Remove ' + ids()!.length + ' track(s)' : 'Clear entire library'" icon="trash" widthClass="max-w-lg" (closed)="closed.emit()">
      <div class="flex flex-col gap-3">
        <label class="flex gap-3 p-3 rounded-xl border cursor-pointer" [class]="deleteFiles() ? 'border-base-content/10' : 'border-primary bg-primary/10'">
          <input type="radio" class="radio radio-primary mt-1" name="mode" [checked]="!deleteFiles()" (change)="deleteFiles.set(false)" />
          <span>
            <span class="font-semibold block">Remove from library only</span>
            <span class="text-sm opacity-75">The songs stay on disk. They just disappear from Canto (re-import them any time).</span>
          </span>
        </label>
        <label class="flex gap-3 p-3 rounded-xl border cursor-pointer" [class]="deleteFiles() ? 'border-error bg-error/10' : 'border-base-content/10'">
          <input type="radio" class="radio radio-error mt-1" name="mode" [checked]="deleteFiles()" (change)="deleteFiles.set(true)" />
          <span>
            <span class="font-semibold block">Remove and delete files</span>
            <span class="text-sm opacity-75">Audio files and their lyrics files are deleted from the output folder. This cannot be undone.</span>
          </span>
        </label>
      </div>
      <ng-container actions>
        <button class="btn btn-ghost" (click)="closed.emit()">Cancel</button>
        <button class="btn" [class]="deleteFiles() ? 'btn-error' : 'btn-primary'" [disabled]="busy()" (click)="confirm()">
          <app-icon name="trash" /> {{ deleteFiles() ? 'Delete' : 'Remove' }}
        </button>
      </ng-container>
    </app-modal>
  `,
})
export class RemoveModal {
  private lib = inject(LibraryStore);
  /** null = whole library */
  ids = input.required<number[] | null>();
  closed = output<void>();
  deleteFiles = signal(false);
  busy = signal(false);

  async confirm() {
    this.busy.set(true);
    const ids = this.ids();
    await (ids ? this.lib.remove(ids, this.deleteFiles()) : this.lib.clear(this.deleteFiles()));
    this.closed.emit();
  }
}
