import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon, IconName } from './icon';

/** Frosted-glass dialog: full-screen on phones, centred card on larger screens. */
@Component({
  selector: 'app-modal',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="modal modal-open glass-backdrop anim-fade" role="dialog" aria-modal="true" (click)="closed.emit()">
      <div
        class="modal-box glass-strong anim-pop flex flex-col p-0 max-sm:w-full max-sm:max-w-full max-sm:h-full max-sm:max-h-full max-sm:rounded-none"
        [class]="widthClass()"
        (click)="$event.stopPropagation()"
      >
        <header class="flex items-center gap-2 px-4 py-3 border-b border-base-content/10">
          @if (icon()) { <app-icon [name]="icon()!" [size]="18" class="text-primary" /> }
          <h3 class="text-lg font-bold grow truncate">{{ title() }}</h3>
          <button class="btn btn-sm btn-circle btn-ghost" aria-label="Close" (click)="closed.emit()"><app-icon name="x" /></button>
        </header>
        <div class="px-4 py-3 overflow-y-auto grow"><ng-content /></div>
        <footer class="flex flex-wrap justify-end gap-2 px-4 py-3 border-t border-base-content/10 empty:hidden">
          <ng-content select="[actions]" />
        </footer>
      </div>
    </div>
  `,
})
export class Modal {
  title = input.required<string>();
  icon = input<IconName | null>(null);
  widthClass = input('max-w-2xl');
  closed = output<void>();
}
