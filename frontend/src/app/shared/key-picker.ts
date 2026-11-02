import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, viewChild } from '@angular/core';
import { placeFloating } from './floating';
import { Icon } from './icon';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CAMELOT_MAJOR = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B'];
const CAMELOT_MINOR = ['5A', '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A', '8A', '3A', '10A'];

interface KeyOption { value: string; camelot: string }

/** Musical key field: type any value, or pick from the 24 keys (with their Camelot wheel codes) */
@Component({
  selector: 'app-key-picker',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-full" #anchor>
      <div class="join w-full">
        <input class="input input-sm input-bordered join-item w-full" type="text" placeholder="e.g. Am" [disabled]="disabled()" [value]="value()" (input)="changed.emit($any($event.target).value)" />
        <button type="button" (click)="toggle()" class="btn btn-sm join-item gap-1 tooltip" data-tip="Pick a key" [disabled]="disabled()" aria-label="Pick a key">
          @if (camelot(); as c) { <span class="badge badge-primary badge-xs">{{ c }}</span> }
          <app-icon name="down" [size]="14" />
        </button>
      </div>
      <div #panel popover="manual" class="glass-strong rounded-box m-0 w-80 max-w-[calc(100vw-1rem)] max-h-[calc(100vh-1rem)] overflow-y-auto p-3 shadow-xl border border-base-content/10 text-base-content" tabindex="-1">
        @for (row of rows; track row.title) {
          <p class="text-xs font-semibold opacity-70 mb-1" [class.mt-2]="!$first">{{ row.title }}</p>
          <div class="grid grid-cols-4 gap-1">
            @for (o of row.options; track o.value) {
              <button type="button" class="btn btn-xs h-9 flex-col gap-0 leading-tight" [class.btn-primary]="isSelected(o)" (click)="pick(o.value, $event)">
                <span class="font-semibold">{{ o.value }}</span>
                <span class="text-[10px] opacity-70">{{ o.camelot }}</span>
              </button>
            }
          </div>
        }
        <div class="mt-3 flex items-center justify-between gap-2">
          <span class="text-[11px] opacity-60">Small code = Camelot wheel (for harmonic mixing)</span>
          <button type="button" class="btn btn-ghost btn-xs" (click)="pick('', $event)">Clear</button>
        </div>
      </div>
    </div>
  `,
})
export class KeyPicker {
  value = input('');
  disabled = input(false);
  changed = output<string>();

  private anchor = viewChild.required<ElementRef<HTMLElement>>('anchor');
  private panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private outside = (e: Event) => {
    const t = e.target as Node;
    if (!this.panel().nativeElement.contains(t) && !this.anchor().nativeElement.contains(t)) this.close();
  };

  toggle() {
    const p = this.panel().nativeElement;
    if (p.matches(':popover-open')) return this.close();
    p.showPopover();
    placeFloating(p, this.anchor().nativeElement.getBoundingClientRect(), 'bottom', 4);
    setTimeout(() => document.addEventListener('pointerdown', this.outside, true));
  }
  close() {
    const p = this.panel().nativeElement;
    if (p.matches(':popover-open')) p.hidePopover();
    document.removeEventListener('pointerdown', this.outside, true);
  }
  rows: { title: string; options: KeyOption[] }[] = [
    { title: 'Major', options: NOTES.map((n, i) => ({ value: n, camelot: CAMELOT_MAJOR[i] })) },
    { title: 'Minor', options: NOTES.map((n, i) => ({ value: n + 'm', camelot: CAMELOT_MINOR[i] })) },
  ];

  camelot = computed(() => {
    const v = this.value().trim();
    return this.rows.flatMap((r) => r.options).find((o) => o.value.toLowerCase() === v.toLowerCase())?.camelot ?? '';
  });

  isSelected(o: KeyOption) {
    return this.value().trim() === o.value;
  }

  pick(value: string, e: Event) {
    this.changed.emit(value);
    this.close();
    e.stopPropagation();
  }
}
