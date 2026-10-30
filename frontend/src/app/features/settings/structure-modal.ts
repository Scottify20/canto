import { ChangeDetectionStrategy, Component, OnInit, inject, output, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { StructurePreview } from '../../core/models';
import { SettingsStore } from '../../core/settings.store';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';

const PRESETS = [
  { name: 'Artist / Album / Title', value: '$albumartist/$album/$title', note: 'Classic and tidy.' },
  { name: 'Artist / Album / 01 - Title', value: '$albumartist/$album/$track - $title', note: 'Keeps album order when sorted by name.' },
  { name: 'Artist / Title', value: '$albumartist/$title', note: 'Flat per artist; no album folders.' },
  { name: 'Artist - Title (one folder)', value: '$artist - $title', note: 'Everything in a single folder.' },
  { name: 'Genre / Artist / Album / Title', value: '$genre/$albumartist/$album/$title', note: 'Browse by genre first.' },
  { name: 'Year / Album / Title', value: '$year/$album/$title', note: 'Chronological collection.' },
];

const VARIABLES = ['$albumartist', '$artist', '$album', '$title', '$track', '$disc', '$year', '$genre', '$format'];

@Component({
  selector: 'app-structure-modal',
  imports: [Modal, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal title="Library folder structure" icon="structure" widthClass="max-w-3xl" (closed)="closed.emit()">
      <div class="flex flex-col gap-4">
        <div class="text-sm opacity-80">
          The structure decides where each song is stored below your output folder. Build it from <b>variables</b> (filled from the song's tags)
          separated by <code>/</code> for sub-folders. The file extension is added for you.
        </div>

        <div>
          <label class="text-xs font-semibold" for="tpl">Template</label>
          <input id="tpl" class="input input-bordered w-full font-mono" [value]="template()" (input)="change($any($event.target).value)" spellcheck="false" />
          <div class="flex flex-wrap gap-1 mt-2">
            @for (v of variables; track v) {
              <button class="btn btn-xs btn-soft" (click)="insert(v)" [title]="'Insert ' + v">{{ v }}</button>
            }
          </div>
        </div>

        <div>
          <div class="text-xs font-semibold mb-1">Presets</div>
          <div class="grid sm:grid-cols-2 gap-2">
            @for (p of presets; track p.value) {
              <button class="btn btn-sm btn-outline h-auto py-2 justify-start text-left lift" [class.btn-primary]="p.value === template()" (click)="change(p.value)">
                <span class="flex flex-col items-start"><span>{{ p.name }}</span><span class="text-xs font-normal opacity-70">{{ p.note }}</span></span>
              </button>
            }
          </div>
        </div>

        <div>
          <div class="text-xs font-semibold mb-1">Live preview</div>
          <div class="rounded-lg bg-base-300/60 p-3 text-sm font-mono flex flex-col gap-2">
            @for (p of preview()?.samples ?? []; track p.sample) {
              <div>
                <div class="text-xs opacity-60 font-sans">{{ p.sample }}</div>
                <div class="break-all flex items-start gap-1"><app-icon name="folder" [size]="14" class="mt-0.5 opacity-60" /> {{ p.path }}</div>
              </div>
            } @empty { <span class="opacity-60">Type a template to see the result…</span> }
            @if (error()) { <span class="text-error font-sans">{{ error() }}</span> }
          </div>
        </div>

        <div class="collapse collapse-arrow bg-base-content/5 rounded-lg">
          <input type="checkbox" />
          <div class="collapse-title text-sm font-semibold">Guide: tips &amp; advanced syntax</div>
          <div class="collapse-content text-sm flex flex-col gap-2">
            <p><b>Missing tags.</b> If a song has no album, Canto uses <code>Singles</code>, and falls back to the artist when there is no album artist, so you never get empty folder names.</p>
            <p><b>Compilations.</b> Use <code>$albumartist</code> (not <code>$artist</code>) so every track of an album stays in one folder.</p>
            <p><b>Conditionals.</b> <code>%if{{ '{' }}$year,($year) {{ '}' }}$album</code> only adds the year when it exists. Zero padding: <code>%02d{{ '{' }}$track{{ '}' }}</code>.</p>
            <p><b>Illegal characters</b> such as <code>? : * "</code> are replaced automatically.</p>
            <p><b>Existing songs.</b> A new structure applies to future imports. Songs already in the library are moved to match the next time you edit their tags.</p>
          </div>
        </div>
      </div>
      <ng-container actions>
        <button class="btn btn-ghost" (click)="closed.emit()">Cancel</button>
        <button class="btn btn-primary" [disabled]="!template().trim() || !!error()" (click)="save()"><app-icon name="save" /> Save structure</button>
      </ng-container>
    </app-modal>
  `,
})
export class StructureModal implements OnInit {
  private api = inject(ApiService);
  private s = inject(SettingsStore);
  closed = output<void>();

  presets = PRESETS;
  variables = VARIABLES;
  template = signal('');
  preview = signal<StructurePreview | null>(null);
  error = signal('');
  private timer?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    this.template.set(this.s.folderStructure());
    void this.refresh();
  }

  change(value: string) {
    this.template.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh(), 250);
  }

  insert(variable: string) {
    const current = this.template();
    this.change(current.endsWith('/') || !current ? current + variable : `${current}/${variable}`);
  }

  private async refresh() {
    try {
      this.preview.set(await this.api.structurePreview(this.template()));
      this.error.set('');
    } catch {
      this.error.set('This template is not valid. Check brackets and variable names.');
    }
  }

  async save() {
    if (await this.s.save({ folder_structure: this.template().trim() }, true)) this.closed.emit();
  }
}
