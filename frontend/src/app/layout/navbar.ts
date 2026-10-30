import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { SystemCheck } from '../core/models';
import { SettingsStore } from '../core/settings.store';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-navbar',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="glass-bar sticky top-0 z-30">
      <div class="navbar min-h-14 px-3 gap-1">
        <div class="flex-1 flex items-center gap-2 min-w-0">
          <span class="grid place-items-center w-9 h-9 rounded-xl bg-primary text-primary-content shadow"><app-icon name="headphones" [size]="20" /></span>
          <span class="text-xl font-extrabold tracking-tight">Canto</span>
          <span class="text-xs opacity-60 max-md:hidden">local music library</span>
        </div>

        <button class="btn btn-ghost btn-sm tooltip tooltip-bottom" data-tip="Folder structure guide" (click)="structure.emit()">
          <app-icon name="structure" /><span class="max-lg:hidden">Structure</span>
        </button>
        <button class="btn btn-ghost btn-sm tooltip tooltip-bottom" data-tip="Lyrics sources & API keys" (click)="sources.emit()">
          <app-icon name="settings" /><span class="max-lg:hidden">Sources</span>
        </button>
        <button class="btn btn-ghost btn-sm tooltip tooltip-bottom" data-tip="Clean up leftovers and stale entries" (click)="maintenance.emit()">
          <app-icon name="clean" /><span class="max-lg:hidden">Cleanup</span>
        </button>
        <button class="btn btn-ghost btn-sm btn-circle tooltip tooltip-bottom" [attr.data-tip]="s.theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'" aria-label="Toggle theme" (click)="s.theme.set(s.theme() === 'dark' ? 'light' : 'dark')">
          <app-icon [name]="s.theme() === 'dark' ? 'sun' : 'moon'" />
        </button>

        <div class="dropdown dropdown-end">
          <button tabindex="0" class="btn btn-ghost btn-sm gap-2" aria-label="System status">
            <span class="status" [class.status-success]="online()" [class.status-error]="!online()"></span>
            <span class="max-sm:hidden">{{ online() ? 'Online' : 'Offline' }}</span>
          </button>
          <div tabindex="0" class="dropdown-content glass-strong rounded-box z-40 w-72 p-3 mt-2 shadow-xl">
            <div class="font-semibold mb-2">Engine tools</div>
            @if (!online()) { <p class="text-sm text-error">The backend is not reachable. Start it on port 8000.</p> }
            <ul class="text-sm flex flex-col gap-1">
              @for (c of checks(); track c.name) {
                <li class="flex items-start gap-2">
                  <app-icon [name]="c.ok ? 'ok' : 'no'" [size]="16" [class]="c.ok ? 'text-success' : 'text-error'" />
                  <span><b>{{ c.name }}</b> <span class="opacity-70">– {{ c.purpose }}</span></span>
                </li>
              }
            </ul>
          </div>
        </div>
      </div>
    </header>
  `,
})
export class Navbar {
  s = inject(SettingsStore);
  online = input(false);
  checks = input<SystemCheck[]>([]);
  structure = output<void>();
  sources = output<void>();
  maintenance = output<void>();
}
