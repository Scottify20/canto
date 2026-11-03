import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { RunWhere, TaskKind } from '../../core/models';
import { SettingsStore } from '../../core/settings.store';
import { InfoTip } from '../../shared/info-tip';
import { Modal } from '../../shared/modal';

const TASKS: { key: TaskKind; label: string }[] = [
  { key: 'metadata', label: 'Metadata matching' },
  { key: 'lyrics', label: 'Lyrics' },
  { key: 'covers', label: 'Cover art' },
  { key: 'analysis', label: 'Key, BPM & ReplayGain analysis' },
];

@Component({
  selector: 'app-task-location-modal',
  imports: [Modal, InfoTip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal title="Where lookups run" icon="globe" widthClass="max-w-xl" (closed)="closed.emit()">
      <p class="text-sm opacity-80 mb-3">Choose who does the work. <b>Server</b> keeps going after you close the app and uses the server's connection (rate limits are per network). <b>This device</b> only runs while the app is open. <app-info-tip text="This choice is stored on this device only, so a phone and a PC can differ." /></p>
      <label class="flex items-center justify-between gap-3 rounded-xl border border-base-content/10 bg-base-content/5 p-3 mb-3 cursor-pointer">
        <span><span class="font-medium">Run everything on the server</span><span class="block text-xs opacity-70">Universal switch. Turn off to choose per task.</span></span>
        <input type="checkbox" class="toggle toggle-primary" [checked]="s.runAllOnServer()" (change)="s.runAllOnServer.set($any($event.target).checked)" />
      </label>
      <ul class="flex flex-col gap-2">
        @for (t of tasks; track t.key) {
          <li class="flex items-center justify-between gap-3 rounded-xl border border-base-content/10 p-3" [class.opacity-50]="s.runAllOnServer()">
            <span class="font-medium">{{ t.label }}</span>
            <div class="join">
              <button class="btn btn-sm join-item" [class.btn-primary]="s.runsOnServer(t.key)" [disabled]="s.runAllOnServer()" (click)="set(t.key, 'server')">Server</button>
              <button class="btn btn-sm join-item" [class.btn-primary]="!s.runsOnServer(t.key)" [disabled]="s.runAllOnServer()" (click)="set(t.key, 'device')">This device</button>
            </div>
          </li>
        }
      </ul>
      <ng-container actions><button class="btn btn-primary" (click)="closed.emit()">Done</button></ng-container>
    </app-modal>
  `,
})
export class TaskLocationModal {
  protected readonly s = inject(SettingsStore);
  readonly closed = output<void>();
  protected readonly tasks = TASKS;
  protected set(task: TaskKind, where: RunWhere) {
    this.s.runWhere.update((cur) => ({ ...cur, [task]: where }));
  }
}
