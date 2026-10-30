import { ChangeDetectionStrategy, Component, input, model, signal } from '@angular/core';
import { Icon } from '../../shared/icon';
import { FolderPicker } from './folder-picker';

@Component({
  selector: 'app-path-field',
  imports: [FolderPicker, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="flex flex-col w-full">
      <span class="label-text text-xs font-semibold mb-1">{{ label() }}</span>
      <div class="join w-full">
        <input
          class="input input-sm input-bordered join-item w-full font-mono"
          [value]="value()"
          [disabled]="disabled()"
          [placeholder]="placeholder()"
          (input)="value.set($any($event.target).value)"
        />
        <button class="btn btn-sm join-item" [disabled]="disabled()" (click)="picking.set(true)" title="Browse folders"><app-icon name="folder-open" /> Browse</button>
      </div>
      @if (hint()) { <span class="text-xs opacity-60 mt-1">{{ hint() }}</span> }
    </label>
    @if (picking()) {
      <app-folder-picker [title]="label()" [start]="value()" (picked)="value.set($event); picking.set(false)" (cancelled)="picking.set(false)" />
    }
  `,
})
export class PathField {
  label = input.required<string>();
  placeholder = input('');
  hint = input('');
  disabled = input(false);
  value = model('');
  picking = signal(false);
}
