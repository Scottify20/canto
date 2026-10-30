import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { InboxStore } from '../../core/inbox.store';
import { JobStore } from '../../core/job.store';
import { DuplicateAction } from '../../core/models';
import { SettingsStore } from '../../core/settings.store';
import { Icon } from '../../shared/icon';
import { PathField } from './path-field';

@Component({
  selector: 'app-import-panel',
  imports: [PathField, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="glass-panel p-4 flex flex-col gap-3 anim-slide">
      <h2 class="font-bold flex items-center gap-2"><app-icon name="folder-open" class="text-primary" /> Folders</h2>

      <app-path-field label="Input folder (raw songs)" placeholder="/path/to/unsorted" [disabled]="locked()" [value]="s.inputPath()" (valueChange)="setInput($event)"
        hint="Your untouched downloads. Nothing here is changed unless you enable “delete originals”." />
      <app-path-field label="Output folder (organised library)" placeholder="/path/to/music" [disabled]="locked()" [value]="s.outputPath()" (valueChange)="s.set('outputPath', $event)"
        hint="Songs are copied here and renamed using your folder structure." />

      <button class="btn btn-sm btn-outline justify-between" (click)="structure.emit()" title="Edit how files are named and nested">
        <span class="flex items-center gap-2"><app-icon name="structure" /> Folder structure</span>
        <code class="text-xs opacity-70 truncate max-w-40">{{ s.folderStructure() }}</code>
      </button>

      <div class="divider my-0"></div>

      <label class="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" class="toggle toggle-sm toggle-warning mt-0.5" [checked]="s.deleteOriginals()" [disabled]="locked()" (change)="s.set('deleteOriginals', $any($event.target).checked)" />
        <span class="text-sm">
          <span class="font-medium">Delete originals after import</span>
          <span class="block text-xs opacity-70">
            @if (s.deleteOriginals()) { Files are <b>moved</b> into the library (lyrics files follow). Emptied input folders are removed. }
            @else { Files are <b>copied</b>. Your input folder stays untouched. }
          </span>
        </span>
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="font-medium flex items-center gap-1">Duplicates
          <span class="tooltip tooltip-right" data-tip="A duplicate is the same artist + title with almost the same length."><app-icon name="help" [size]="14" class="opacity-60" /></span>
        </span>
        <select class="select select-sm w-full" [disabled]="locked()" [value]="s.duplicateAction()" (change)="s.set('duplicateAction', $any($event.target).value)">
          @for (o of options; track o.value) { <option [value]="o.value" [selected]="o.value === s.duplicateAction()">{{ o.label }}</option> }
        </select>
        <span class="text-xs opacity-70">{{ hint() }}</span>
      </label>

      <button class="btn btn-primary" [disabled]="locked() || !s.inputPath() || !s.outputPath()" (click)="inbox.startImport(true)">
        <app-icon name="download" /> Import everything new
      </button>
    </section>
  `,
})
export class ImportPanel {
  s = inject(SettingsStore);
  inbox = inject(InboxStore);
  private jobs = inject(JobStore);
  structure = output<void>();

  locked = computed(() => this.jobs.running());
  options: { value: DuplicateAction; label: string }[] = [
    { value: 'skip', label: 'Skip duplicates (safe)' },
    { value: 'replace', label: 'Replace if the new file is better' },
    { value: 'keep', label: 'Keep both' },
  ];
  hint = computed(
    () =>
      ({
        skip: 'Songs already in the library (or twice in the inbox) are not imported again.',
        replace: 'The higher-quality copy (format, bitrate, size) wins; the other is removed.',
        keep: 'Every file is imported, even if the song already exists.',
      })[this.s.duplicateAction()],
  );

  setInput(value: string) {
    this.s.set('inputPath', value);
    void this.inbox.refresh(true);
  }
}
