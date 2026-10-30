import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { ApiService, errorMessage } from '../../core/api.service';
import { LibraryStore } from '../../core/library.store';
import { Track, TrackDetails } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';
import { EditCoverTab } from './edit-cover-tab';
import { EditLyricsTab } from './edit-lyrics-tab';
import { EditMetaTab } from './edit-meta-tab';

export type EditTab = 'meta' | 'lyrics' | 'cover';

@Component({
  selector: 'app-edit-modal',
  imports: [Modal, Icon, EditMetaTab, EditLyricsTab, EditCoverTab],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal [title]="track().title || 'Edit track'" icon="edit" widthClass="max-w-4xl w-full" (closed)="closed.emit()">
      <div role="tablist" class="tabs tabs-box tabs-sm mb-3 w-full">
        <button role="tab" class="tab flex-1 gap-1" [class.tab-active]="tab() === 'meta'" (click)="tab.set('meta')"><app-icon name="edit" [size]="14" /> Metadata</button>
        <button role="tab" class="tab flex-1 gap-1" [class.tab-active]="tab() === 'lyrics'" (click)="tab.set('lyrics')"><app-icon name="mic" [size]="14" /> Lyrics</button>
        <button role="tab" class="tab flex-1 gap-1" [class.tab-active]="tab() === 'cover'" (click)="tab.set('cover')"><app-icon name="image" [size]="14" /> Cover</button>
      </div>

      @if (!current().exists) {
        <div class="alert alert-warning alert-soft mb-3 text-sm"><app-icon name="warn" /> The audio file is missing on disk, so nothing can be edited. Remove this entry or restore the file.</div>
      }

      <div class="anim-fade">
        @switch (tab()) {
          @case ('meta') { @if (details(); as d) { <app-edit-meta-tab [details]="d" [disabled]="!current().exists" (saved)="onSaved($event)" /> } @else { <div class="p-8 text-center"><span class="loading loading-spinner"></span></div> } }
          @case ('lyrics') { <app-edit-lyrics-tab [track]="current()" /> }
          @case ('cover') { <app-edit-cover-tab [track]="current()" /> }
        }
      </div>
      <ng-container actions>
        <span class="text-xs opacity-60 grow self-center truncate max-sm:hidden" [title]="current().path">{{ current().path }}</span>
        <button class="btn btn-primary" (click)="closed.emit()">Done</button>
      </ng-container>
    </app-modal>
  `,
})
export class EditModal implements OnInit {
  private api = inject(ApiService);
  private lib = inject(LibraryStore);
  private toast = inject(ToastService);

  track = input.required<Track>();
  initialTab = input<EditTab>('meta');
  closed = output<void>();

  tab = signal<EditTab>('meta');
  details = signal<TrackDetails | null>(null);
  /** The live store copy so badges and the path update after saves. */
  current = () => this.lib.tracks().find((t) => t.id === this.track().id) ?? this.track();

  async ngOnInit() {
    this.tab.set(this.initialTab());
    try {
      this.details.set(await this.api.details(this.track().id));
    } catch (e) {
      this.toast.error(errorMessage(e));
    }
  }

  onSaved(details: TrackDetails) {
    this.details.set(details);
  }
}
