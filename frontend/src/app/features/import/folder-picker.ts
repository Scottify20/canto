import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { ApiService, errorMessage } from '../../core/api.service';
import { FsListing } from '../../core/models';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';

/** In-browser folder chooser backed by the engine's file system (works headless/over WSL/SSH). */
@Component({
  selector: 'app-folder-picker',
  imports: [Modal, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [title]="title()" icon="folder-open" widthClass="max-w-xl" (closed)="cancelled.emit()">
      <div class="join w-full mb-2">
        <button class="btn btn-sm join-item" [disabled]="!listing()?.parent" (click)="open(listing()!.parent!)" title="Parent folder"><app-icon name="arrow-up" /></button>
        <input
          class="input input-sm join-item w-full font-mono"
          [value]="typed()"
          (input)="typed.set($any($event.target).value)"
          (keydown.enter)="open(typed())"
          aria-label="Folder path"
        />
        <button class="btn btn-sm join-item" (click)="open(typed())">Go</button>
      </div>
      @if (error()) { <div class="alert alert-error alert-soft text-sm mb-2">{{ error() }}</div> }
      <ul class="menu menu-sm bg-base-200 rounded-box h-72 overflow-y-auto flex-nowrap w-full">
        @for (d of listing()?.dirs ?? []; track d.path) {
          <li><button (click)="open(d.path)"><app-icon name="folder" /> {{ d.name }}</button></li>
        } @empty {
          <li class="menu-disabled"><span>No sub-folders</span></li>
        }
      </ul>
      <p class="text-xs opacity-70 mt-2">{{ listing()?.audio_count ?? 0 }} audio file(s) directly in this folder</p>
      <ng-container actions>
        <button class="btn btn-ghost" (click)="cancelled.emit()">Cancel</button>
        <button class="btn btn-primary" [disabled]="!listing()" (click)="picked.emit(listing()!.path)">Select this folder</button>
      </ng-container>
    </app-modal>
  `,
})
export class FolderPicker implements OnInit {
  private api = inject(ApiService);
  title = input('Select folder');
  start = input('');
  picked = output<string>();
  cancelled = output<void>();

  listing = signal<FsListing | null>(null);
  typed = signal('');
  error = signal('');

  ngOnInit() {
    void this.open(this.start());
  }

  async open(path: string): Promise<void> {
    try {
      const l = await this.api.listFolder(path || undefined);
      this.listing.set(l);
      this.typed.set(l.path);
      this.error.set('');
    } catch (e) {
      if (!this.listing()) return this.open('');
      this.error.set(errorMessage(e));
    }
  }
}
