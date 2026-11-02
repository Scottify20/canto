import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, OnInit, inject, output, signal } from '@angular/core';
import { ProviderState } from '../../core/models';
import { SettingsStore } from '../../core/settings.store';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';

interface Row extends ProviderState {
  edits: Record<string, string>;
}

@Component({
  selector: 'app-sources-modal',
  imports: [Modal, Icon, CdkDropList, CdkDrag, CdkDragHandle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal title="Lyrics sources & metadata keys" icon="settings" widthClass="max-w-3xl" (closed)="closed.emit()">
      <p class="text-sm opacity-80 mb-3">
        Canto asks every enabled source for lyrics and keeps the best one: word-synced TTML first, then the most accurate line-synced LRC.
        Sources higher in the list win ties. Drag the handle (or use the arrows) to change priority.
      </p>

      <ul class="flex flex-col gap-2" cdkDropList (cdkDropListDropped)="drop($event)">
        @for (p of rows(); track p.id; let i = $index) {
          <li cdkDrag class="rounded-xl border border-base-content/10 bg-base-100 p-3" cdkDragLockAxis="y">
            <div class="flex items-center gap-2">
              <span cdkDragHandle class="cursor-grab active:cursor-grabbing touch-none opacity-60 hover:opacity-100 p-1" aria-label="Drag to reorder"><app-icon name="menu" [size]="16" /></span>
              <div class="flex flex-col">
                <button class="btn btn-ghost btn-xs btn-square h-5 min-h-0" [disabled]="i === 0" (click)="move(i, -1)" aria-label="Move up"><app-icon name="up" [size]="14" /></button>
                <button class="btn btn-ghost btn-xs btn-square h-5 min-h-0" [disabled]="i === rows().length - 1" (click)="move(i, 1)" aria-label="Move down"><app-icon name="down" [size]="14" /></button>
              </div>
              <div class="grow min-w-0">
                <div class="font-semibold flex flex-wrap items-center gap-1">
                  {{ p.label }}
                  @if (p.word_level) { <span class="badge badge-xs badge-primary badge-soft">word-synced</span> }
                  @if (p.key_required && !hasKeys(p)) { <span class="badge badge-xs badge-warning badge-soft">needs keys</span> }
                </div>
                <div class="text-xs opacity-70">{{ p.description }}</div>
              </div>
              <input type="checkbox" class="toggle toggle-sm toggle-primary" [checked]="p.enabled" (change)="toggle(i, $any($event.target).checked)" [attr.aria-label]="'Enable ' + p.label" />
            </div>
            @if (p.key_fields.length && p.enabled) {
              <div class="grid sm:grid-cols-2 gap-2 mt-3">
                @for (k of p.key_fields; track k.id) {
                  <label class="flex flex-col text-xs gap-1">
                    <span class="font-medium">{{ k.label }} @if (k.set && !p.edits[k.id]) { <span class="text-success">(saved)</span> }</span>
                    <input class="input input-sm input-bordered" [type]="k.secret ? 'password' : 'text'" autocomplete="off"
                      [placeholder]="k.set ? '•••••• keep current' : ''" [value]="p.edits[k.id] ?? (k.secret ? '' : k.value)" (input)="edit(i, k.id, $any($event.target).value)" />
                  </label>
                }
                @if (p.key_url) { <a class="link text-xs sm:col-span-2 inline-flex items-center gap-1" [href]="p.key_url" target="_blank" rel="noopener">How to get these <app-icon name="external" [size]="12" /></a> }
              </div>
            }
          </li>
        }
      </ul>

      <div class="divider">Metadata</div>
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium">Discogs token <span class="opacity-60 font-normal">(optional second metadata database next to MusicBrainz, iTunes and Deezer)</span></span>
        <input class="input input-sm input-bordered" type="password" autocomplete="off" [placeholder]="s.hasDiscogsToken() ? '•••••• saved (type to replace)' : 'Personal access token'" [value]="discogs()" (input)="discogs.set($any($event.target).value)" />
      </label>

      <ng-container actions>
        <button class="btn btn-ghost" (click)="closed.emit()">Cancel</button>
        <button class="btn btn-primary" [disabled]="saving()" (click)="save()"><app-icon name="save" /> Save</button>
      </ng-container>
    </app-modal>
  `,
})
export class SourcesModal implements OnInit {
  s = inject(SettingsStore);
  closed = output<void>();
  rows = signal<Row[]>([]);
  discogs = signal('');
  saving = signal(false);

  ngOnInit() {
    this.rows.set(this.s.providers().map((p) => ({ ...p, edits: {} })));
  }

  hasKeys(p: Row) {
    return p.key_fields.every((k) => k.set || p.edits[k.id] || !k.secret);
  }
  drop(e: CdkDragDrop<Row[]>) {
    this.rows.update((list) => {
      const next = [...list];
      moveItemInArray(next, e.previousIndex, e.currentIndex);
      return next;
    });
  }
  move(i: number, delta: number) {
    this.rows.update((list) => {
      const next = [...list];
      [next[i], next[i + delta]] = [next[i + delta], next[i]];
      return next;
    });
  }
  toggle(i: number, enabled: boolean) {
    this.rows.update((list) => list.map((p, n) => (n === i ? { ...p, enabled } : p)));
  }
  edit(i: number, key: string, value: string) {
    this.rows.update((list) => list.map((p, n) => (n === i ? { ...p, edits: { ...p.edits, [key]: value } } : p)));
  }

  async save() {
    this.saving.set(true);
    const rows = this.rows();
    const ok = await this.s.save(
      {
        lyrics_order: rows.map((p) => p.id),
        providers: rows.map((p) => ({ id: p.id, enabled: p.enabled, keys: p.edits })),
        ...(this.discogs().trim() ? { discogs_token: this.discogs().trim() } : {}),
      },
      true,
    );
    this.saving.set(false);
    if (ok) this.closed.emit();
  }
}
