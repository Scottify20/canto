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
        <div class="flex items-center gap-2 min-w-0 lg:flex-none">
          <span class="grid place-items-center w-9 h-9 rounded-xl bg-primary text-primary-content shadow"><app-icon name="headphones" [size]="20" /></span>
          <span class="text-xl font-extrabold tracking-tight">Canto</span>
          <span class="text-xs opacity-60 max-md:hidden lg:max-2xl:hidden">local music library</span>
        </div>
        <div class="flex-1 min-w-0 flex justify-center"><ng-content select="[navCenter]" /></div>

        <div class="dropdown dropdown-end">
          <button tabindex="0" class="btn btn-ghost btn-sm btn-circle tooltip tooltip-bottom" data-tip="Settings" aria-label="Settings"><app-icon name="settings" /></button>
          <div tabindex="0" class="dropdown-content glass-strong rounded-box z-40 w-72 max-w-[calc(100vw-1rem)] p-3 mt-2 shadow-xl">
            <ul class="menu p-0 w-full">
              <li><button (click)="structure.emit(); close($event)"><app-icon name="structure" /> Folder structure</button></li>
              <li><button (click)="sources.emit(); close($event)"><app-icon name="globe" /> Sources &amp; API keys</button></li>
              <li><button (click)="remote.emit(); close($event)"><app-icon name="qr" /> Remote control (QR)</button></li>
              <li><button (click)="maintenance.emit(); close($event)"><app-icon name="clean" /> Cleanup</button></li>
              <li><button (click)="s.theme.set(s.theme() === 'dark' ? 'light' : 'dark')"><app-icon [name]="s.theme() === 'dark' ? 'sun' : 'moon'" /> {{ s.theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme' }}</button></li>
            </ul>
            <div class="divider my-1"></div>
            <div class="px-2 pb-1">
              <div class="flex items-center justify-between mb-2"><span class="flex items-center gap-2 text-sm font-semibold"><app-icon name="zoom" /> Interface size</span><span class="badge badge-primary badge-sm tabular-nums">{{ s.uiScale() }}%</span></div>
              <input type="range" class="range range-primary range-sm w-full" min="70" max="160" step="5" aria-label="Interface size" [value]="s.uiScale()" (input)="s.uiScale.set(+$any($event.target).value)" />
              <div class="flex justify-between text-xs opacity-60 mt-1"><span>Small</span><span>Large</span></div>
              <button class="btn btn-ghost btn-xs mt-2 w-full" [disabled]="s.uiScale() === 100" (click)="s.uiScale.set(100)">Reset to 100%</button>
            </div>
          </div>
        </div>

        <div class="dropdown dropdown-end">
          <button tabindex="0" class="btn btn-ghost btn-sm gap-2" aria-label="System status">
            <span class="status" [class.status-success]="online()" [class.status-error]="!online()"></span>
            <span class="max-sm:hidden">{{ online() ? 'Online' : 'Offline' }}</span>
          </button>
          <div tabindex="0" class="dropdown-content glass-strong rounded-box z-40 w-72 p-3 mt-2 shadow-xl">
            <div class="font-semibold mb-2">Engine tools</div>
            @if (!online()) { <p class="text-sm text-error">The backend is not reachable. Start it on port 8010.</p> }
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
  remote = output<void>();

  /** Closes the dropdown after picking an entry (daisyUI dropdowns stay open while focused) */
  close(e: Event) {
    (document.activeElement as HTMLElement | null)?.blur();
    e.stopPropagation();
  }
}
