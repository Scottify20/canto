import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';
import { Icon } from './icon';

@Component({
  selector: 'app-toast-container',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast toast-end toast-bottom z-[60] max-sm:left-2 max-sm:right-2 max-sm:w-auto">
      @for (t of toasts.toasts(); track t.id) {
        <div
          class="alert anim-toast shadow-lg max-w-md cursor-pointer backdrop-blur-md"
          [class.alert-success]="t.kind === 'success'"
          [class.alert-error]="t.kind === 'error'"
          [class.alert-warning]="t.kind === 'warning'"
          [class.alert-info]="t.kind === 'info'"
          (click)="toasts.dismiss(t.id)"
        >
          <app-icon [name]="t.kind === 'success' ? 'ok' : t.kind === 'error' ? 'no' : t.kind === 'warning' ? 'warn' : 'info'" />
          <span class="whitespace-pre-line break-words">{{ t.text }}</span>
        </div>
      }
    </div>
  `,
})
export class ToastContainer {
  toasts = inject(ToastService);
}
