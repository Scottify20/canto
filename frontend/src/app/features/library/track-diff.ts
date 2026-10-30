import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LibraryStore } from '../../core/library.store';
import { Proposal, TAG_FIELDS, TAG_LABELS, TagField, Track } from '../../core/models';

/** Side-by-side review of proposed tag changes for one track, with per-field accept boxes. */
@Component({
  selector: 'app-track-diff',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center gap-2 mb-2">
      <span class="text-xs font-semibold">Match:</span>
      <select class="select select-xs w-auto max-w-md" (change)="lib.selectCandidate(track(), +$any($event.target).value)">
        @for (c of proposal().candidates; track $index) {
          <option [value]="$index" [selected]="$index === proposal().selected">
            {{ c.similarity }}% · {{ c.source }} · {{ c.fields.artist }} – {{ c.fields.title }}{{ c.fields.album ? ' (' + c.fields.album + ')' : '' }}
          </option>
        }
      </select>
      <div class="grow"></div>
      <button class="btn btn-xs btn-ghost" (click)="lib.dismiss(track().id)">Dismiss</button>
      <button class="btn btn-xs btn-success" [disabled]="lib.busy()[track().id] === 'save'" (click)="lib.applyProposal(track().id)">
        @if (lib.busy()[track().id] === 'save') { <span class="loading loading-spinner loading-xs"></span> }
        Apply selected
      </button>
    </div>
    <table class="table table-xs">
      <thead><tr><th class="w-8"></th><th class="w-28">Field</th><th>Current</th><th>Proposed</th></tr></thead>
      <tbody>
        @for (f of rows(); track f.field) {
          <tr [class.opacity-50]="!proposal().accept[f.field]">
            <td><input type="checkbox" class="checkbox checkbox-xs checkbox-success" [checked]="proposal().accept[f.field]" (change)="lib.toggleAccept(track().id, f.field)" [attr.aria-label]="'Accept ' + f.label" /></td>
            <td class="font-medium">{{ f.label }}</td>
            <td class="line-through opacity-60">{{ f.current || '—' }}</td>
            <td class="text-success font-semibold bg-success/10">{{ f.proposed }}</td>
          </tr>
        } @empty {
          <tr><td colspan="4" class="opacity-60">This candidate changes nothing — pick another match.</td></tr>
        }
      </tbody>
    </table>
  `,
})
export class TrackDiff {
  lib = inject(LibraryStore);
  track = input.required<Track>();
  proposal = input.required<Proposal>();

  rows = computed(() => {
    const t = this.track();
    const fields = this.proposal().candidates[this.proposal().selected]?.fields;
    const changed = new Set<TagField>(this.lib.changedFields(t, this.proposal()));
    return TAG_FIELDS.filter((f) => changed.has(f)).map((field) => ({
      field,
      label: TAG_LABELS[field],
      current: t[field],
      proposed: fields?.[field],
    }));
  });
}
