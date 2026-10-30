import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild, ElementRef } from '@angular/core';
import { JobStore } from '../../core/job.store';
import { Icon } from '../../shared/icon';

const LABELS = { import: 'Importing', lyrics: 'Fetching lyrics', analyze: 'Analysing audio', covers: 'Fetching covers' } as const;

@Component({
  selector: 'app-job-console',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (jobs.job(); as job) {
      <section class="glass-panel anim-pop p-3 flex flex-col gap-2">
        <div class="flex items-center gap-2">
          @if (job.status === 'running') { <span class="loading loading-spinner loading-sm text-primary"></span> }
          @else if (job.status === 'done') { <app-icon name="ok" class="text-success" /> }
          @else { <app-icon name="warn" class="text-warning" /> }
          <div class="grow min-w-0">
            <div class="font-semibold leading-tight">{{ label() }}</div>
            <div class="text-xs opacity-70 truncate">{{ job.message || (job.total ? job.done + ' / ' + job.total : 'Starting…') }}</div>
          </div>
          <button class="btn btn-xs btn-ghost" (click)="open.set(!open())">{{ open() ? 'Hide log' : 'Show log' }}</button>
          @if (job.status === 'running') {
            <button class="btn btn-xs btn-error btn-soft" (click)="jobs.cancel()">Cancel</button>
          } @else {
            <button class="btn btn-xs btn-circle btn-ghost" aria-label="Dismiss" (click)="jobs.clear()"><app-icon name="x" /></button>
          }
        </div>
        @if (jobs.progress() !== null) { <progress class="progress progress-primary w-full" [value]="jobs.progress()" max="100"></progress> }
        @else if (job.status === 'running') { <progress class="progress progress-primary w-full"></progress> }
        @if (open()) {
          <pre #logBox class="text-xs bg-base-300/60 rounded-lg p-2 max-h-48 overflow-auto whitespace-pre-wrap break-words">{{ jobs.log().join('\\n') }}</pre>
        }
      </section>
    }
  `,
})
export class JobConsole {
  jobs = inject(JobStore);
  open = signal(false);
  private logBox = viewChild<ElementRef<HTMLElement>>('logBox');
  label = computed(() => {
    const j = this.jobs.job();
    return j ? LABELS[j.kind] : '';
  });

  constructor() {
    effect(() => {
      this.jobs.log();
      const el = this.logBox()?.nativeElement;
      if (el) queueMicrotask(() => (el.scrollTop = el.scrollHeight));
    });
  }
}
