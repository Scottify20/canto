import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService, errorMessage } from './api.service';
import { Job } from './models';
import { ToastService } from './toast.service';

const POLL_MS = 1500;

/** Tracks the single background job (import / lyrics / analysis) via polling. */
@Injectable({ providedIn: 'root' })
export class JobStore {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly job = signal<Job | null>(null);
  readonly log = signal<string[]>([]);
  readonly running = computed(() => this.job()?.status === 'running');
  readonly progress = computed(() => {
    const j = this.job();
    return j && j.total > 0 ? Math.min(100, Math.round((j.done / j.total) * 100)) : null;
  });

  /** Called when a job ends or makes visible progress so the table can refresh. */
  onChange?: (finished: boolean) => void;

  private timer?: ReturnType<typeof setInterval>;
  private lastProgress = -1;
  private jobId = '';
  private inFlight = false;
  private announced = '';

  /** Pick up a job that was started before a page reload. */
  async resume() {
    try {
      const job = await this.api.currentJob();
      if (job && job.status === 'running') this.adopt(job);
    } catch {
      /* offline */
    }
  }

  async start(launch: () => Promise<Job>) {
    try {
      this.adopt(await launch());
    } catch (e) {
      this.toast.error(errorMessage(e));
    }
  }

  private adopt(job: Job) {
    this.jobId = job.id;
    this.log.set(job.log);
    this.job.set(job);
    this.lastProgress = -1;
    this.poll();
  }

  private poll() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), POLL_MS);
  }

  private async tick() {
    if (this.inFlight) return; // slow links (phone over QR) would otherwise stack overlapping polls
    this.inFlight = true;
    try {
      const sent = this.jobId;
      const job = await this.api.currentJob(this.log().length);
      if (!job || job.id !== this.jobId || sent !== this.jobId) return;
      if (job.log.length) this.log.update((l) => [...l, ...job.log]);
      this.job.set({ ...job, log: [] });
      if (job.status !== 'running') {
        clearInterval(this.timer);
        if (this.announced !== job.id) {
          this.announced = job.id;
          this.announce(job);
        }
        this.onChange?.(true);
      } else if (job.done !== this.lastProgress) {
        this.lastProgress = job.done;
        this.onChange?.(false);
      }
    } catch {
      /* transient network error: keep polling */
    } finally {
      this.inFlight = false;
    }
  }

  private announce(job: Job) {
    if (job.status === 'done') this.toast.success(job.message || `${job.kind} finished`);
    else if (job.status === 'cancelled') this.toast.warn(`${job.kind} cancelled`);
    else this.toast.error(job.message || `${job.kind} failed`);
  }

  async cancel() {
    await this.api.cancelJob().catch(() => undefined);
  }

  clear() {
    if (!this.running()) {
      this.job.set(null);
      this.log.set([]);
    }
  }
}
