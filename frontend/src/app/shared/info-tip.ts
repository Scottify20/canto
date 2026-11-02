import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, inject, input, signal, viewChild } from '@angular/core';
import { Icon } from './icon';
import { placeFloating } from './floating';

/** Info icon that reveals a longer explanation on hover, focus or tap. Rendered in the top layer so nothing clips or covers it. */
@Component({
  selector: 'app-info-tip',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex align-middle',
    '(mouseenter)': 'open()',
    '(mouseleave)': 'close()',
    '(document:pointerdown)': 'outside($event)',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    <button #btn type="button" class="opacity-60 hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-help p-0.5 -m-0.5" aria-label="More information"
      [attr.aria-expanded]="shown()" (pointerdown)="touch = $any($event).pointerType !== 'mouse'" (click)="toggle($event)" (focus)="open()" (blur)="close()">
      <app-icon name="info" [size]="size()" />
    </button>
    <div #box popover="manual" role="tooltip" class="floating-tip-box">
      <ng-content />{{ text() }}
    </div>
  `,
})
export class InfoTip implements OnDestroy {
  private btn = viewChild.required<ElementRef<HTMLElement>>('btn');
  private box = viewChild.required<ElementRef<HTMLElement>>('box');
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  text = input('');
  size = input(14);
  shown = signal(false);
  touch = false;
  private readonly onScroll = () => this.close();

  open() {
    if (this.shown()) return;
    const box = this.box().nativeElement;
    box.showPopover();
    placeFloating(box, this.btn().nativeElement.getBoundingClientRect(), 'bottom');
    this.shown.set(true);
    document.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
  }
  close() {
    if (!this.shown()) return;
    const box = this.box().nativeElement;
    if (box.matches(':popover-open')) box.hidePopover();
    this.shown.set(false);
    document.removeEventListener('scroll', this.onScroll, { capture: true });
  }
  toggle(e: Event) {
    e.stopPropagation();
    e.preventDefault();
    if (this.shown() && this.touch) this.close();
    else this.open();
  }
  outside(e: Event) {
    if (this.shown() && !this.host.nativeElement.contains(e.target as Node)) this.close();
  }
  ngOnDestroy() {
    this.close();
  }
}
