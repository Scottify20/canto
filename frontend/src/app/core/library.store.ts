import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService, errorMessage } from './api.service';
import { JobStore } from './job.store';
import { COLUMNS, ColumnKey, LibraryFilter, Proposal, TAG_FIELDS, TagField, Track } from './models';
import { SettingsStore } from './settings.store';
import { ToastService } from './toast.service';

type Busy = 'match' | 'lyrics' | 'save';

export function sameValue(a: unknown, b: unknown): boolean {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

/** Formats that keep every sample of the source */
const LOSSLESS = /flac|alac|wav|aiff|ape|wavpack|wv|dsd|dsf|tta|pcm/i;

@Injectable({ providedIn: 'root' })
export class LibraryStore {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private settings = inject(SettingsStore);
  readonly jobs = inject(JobStore);

  readonly tracks = signal<Track[]>([]);
  readonly loading = signal(false);
  readonly search = signal('');
  readonly filter = signal<LibraryFilter>('all');
  readonly sortKey = signal<ColumnKey>('artist');
  readonly sortDir = signal<1 | -1>(1);
  readonly page = signal(0);
  readonly selected = signal<ReadonlySet<number>>(new Set());
  readonly proposals = signal<Record<number, Proposal>>({});
  readonly busy = signal<Record<number, Busy>>({});
  readonly batch = signal<{ label: string; done: number; total: number } | null>(null);
  private batchCancelled = false;

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const filter = this.filter();
    const proposals = this.proposals();
    let rows = this.tracks().filter((t) => {
      if (q && !`${t.title} ${t.artist} ${t.album} ${t.path}`.toLowerCase().includes(q)) return false;
      switch (filter) {
        case 'no-lyrics': return !t.has_lrc || !t.has_ttml;
        case 'no-ttml': return !t.has_ttml;
        case 'no-lrc': return !t.has_lrc;
        case 'no-key': return !t.initial_key;
        case 'no-gain': return t.rg_track_gain === '';
        case 'no-bpm': return !t.bpm;
        case 'no-tags': return !t.album || !t.year || !t.genre || !t.albumartist;
        case 'complete-lyrics': return t.has_lrc && t.has_ttml;
        case 'surround': return t.channels > 2;
        case 'stereo': return t.channels <= 2;
        case 'animated': return t.animated.length > 0;
        case 'no-animated': return t.animated.length === 0;
        case 'lossless': return LOSSLESS.test(t.format);
        case 'lossy': return !LOSSLESS.test(t.format);
        case 'recent': return t.added * 1000 > Date.now() - 7 * 864e5;
        case 'no-cover': return !t.has_cover;
        case 'missing': return !t.exists;
        case 'duplicates': return t.dup_group !== null;
        case 'review': return !!proposals[t.id];
        default: return true;
      }
    });
    const key = this.sortKey();
    const dir = this.sortDir();
    rows = [...rows].sort((a, b) => dir * this.compare(a, b, key));
    return rows;
  });

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.settings.pageSize())));
  /** Zero-based page index, always within [0, pageCount - 1]. */
  readonly currentPage = computed(() => Math.max(0, Math.min(this.page(), this.pageCount() - 1)));
  readonly pageRows = computed(() => {
    const size = this.settings.pageSize();
    const page = this.currentPage();
    return this.filtered().slice(page * size, (page + 1) * size);
  });
  readonly pendingCount = computed(() => Object.keys(this.proposals()).length);
  readonly stats = computed(() => {
    const t = this.tracks();
    return {
      total: t.length,
      lrc: t.filter((x) => x.has_lrc).length,
      ttml: t.filter((x) => x.has_ttml).length,
      cover: t.filter((x) => x.has_cover).length,
      missing: t.filter((x) => !x.exists).length,
      duplicates: t.filter((x) => x.dup_group !== null).length,
    };
  });
  /** Targets for bulk actions: the selection if any, otherwise everything that passes the filters. */
  readonly targetIds = computed(() => {
    const sel = this.selected();
    return sel.size ? [...sel] : this.filtered().map((t) => t.id);
  });

  constructor() {
    this.jobs.onChange = (finished) => {
      void this.load(true);
      if (finished) this.bumpCovers();
    };
  }

  private compare(a: Track, b: Track, key: ColumnKey): number {
    const value = (t: Track): string | number => {
      switch (key) {
        case 'status': return Number(t.has_lrc) + Number(t.has_ttml) + Number(t.has_cover);
        case 'year': case 'length': case 'rg_track_gain': case 'added': case 'bitrate': case 'bpm': case 'track': return Number(t[key]) || 0;
        default: return String(t[key as keyof Track] ?? '').toLowerCase();
      }
    };
    const [x, y] = [value(a), value(b)];
    return x < y ? -1 : x > y ? 1 : a.id - b.id;
  }

  async load(quiet = false) {
    if (!quiet) this.loading.set(true);
    try {
      const tracks = await this.api.tracks();
      this.tracks.set(tracks);
      const ids = new Set(tracks.map((t) => t.id));
      this.selected.update((s) => new Set([...s].filter((id) => ids.has(id))));
    } catch (e) {
      if (!quiet) this.toast.error(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  // ---- view state ---------------------------------------------------------
  setSearch(q: string) { this.search.set(q); this.page.set(0); }
  setFilter(f: LibraryFilter) { this.filter.set(f); this.page.set(0); }
  sortBy(key: ColumnKey) {
    if (this.sortKey() === key) this.sortDir.update((d) => (d === 1 ? -1 : 1));
    else { this.sortKey.set(key); this.sortDir.set(1); }
  }
  /** Last row picked without Shift; Shift+click extends the selection from here. */
  private anchor: number | null = null;

  toggleSelect(id: number) {
    this.selected.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    this.anchor = id;
  }
  /** Click handling shared by checkboxes and rows: Ctrl/Cmd toggles one row, Shift adds the range from the anchor. */
  pick(id: number, mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }, on = !this.selected().has(id)) {
    if (mods.shiftKey && this.anchor !== null) {
      const order = this.filtered().map((t) => t.id);
      const a = order.indexOf(this.anchor);
      const b = order.indexOf(id);
      if (a >= 0 && b >= 0) {
        const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
        this.selected.update((s) => { const n = new Set(s); for (const r of range) on ? n.add(r) : n.delete(r); return n; });
        return;
      }
    }
    this.selected.update((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });
    this.anchor = id;
  }
  selectPage(on: boolean) {
    this.selected.update((s) => {
      const n = new Set(s);
      for (const t of this.pageRows()) on ? n.add(t.id) : n.delete(t.id);
      return n;
    });
  }
  selectAllFiltered() { this.selected.set(new Set(this.filtered().map((t) => t.id))); }
  clearSelection() { this.selected.set(new Set()); }

  /** Bumped whenever a cover changes so <img> URLs bypass the browser cache. */
  readonly coverVersion = signal(0);

  patch(track: Track) {
    this.tracks.update((list) => list.map((t) => (t.id === track.id ? track : t)));
  }
  bumpCovers() { this.coverVersion.update((v) => v + 1); }
  private setBusy(id: number, state: Busy | null) {
    this.busy.update((b) => {
      const next = { ...b };
      state ? (next[id] = state) : delete next[id];
      return next;
    });
  }

  // ---- metadata matching & review -------------------------------------------------
  /** Fields whose proposed value differs from what the track has now. */
  changedFields(track: Track, proposal: Proposal): TagField[] {
    const fields = proposal.candidates[proposal.selected]?.fields;
    if (!fields) return [];
    return TAG_FIELDS.filter((f) => fields[f] !== '' && fields[f] != null && !sameValue(track[f], fields[f]));
  }

  private buildProposal(track: Track, candidates: Proposal['candidates'], selected = 0): Proposal {
    const proposal: Proposal = { candidates, selected, accept: {} };
    for (const f of this.changedFields(track, proposal)) proposal.accept[f] = true;
    return proposal;
  }

  selectCandidate(track: Track, index: number) {
    const current = this.proposals()[track.id];
    if (current) this.proposals.update((p) => ({ ...p, [track.id]: this.buildProposal(track, current.candidates, index) }));
  }
  toggleAccept(id: number, field: TagField) {
    this.proposals.update((all) => {
      const p = all[id];
      return p ? { ...all, [id]: { ...p, accept: { ...p.accept, [field]: !p.accept[field] } } } : all;
    });
  }
  dismiss(id: number) {
    this.proposals.update((all) => { const n = { ...all }; delete n[id]; return n; });
  }

  async findMatch(track: Track, announce = true) {
    this.setBusy(track.id, 'match');
    try {
      const candidates = await this.api.match(track.id);
      const proposal = candidates.length ? this.buildProposal(track, candidates) : null;
      if (proposal && this.changedFields(track, proposal).length) {
        this.proposals.update((p) => ({ ...p, [track.id]: proposal }));
      } else if (announce) {
        this.toast.info(candidates.length ? `“${track.title}” already matches the best result` : `No match found for “${track.title}”`);
      }
    } catch (e) {
      if (announce) this.toast.error(errorMessage(e));
    } finally {
      this.setBusy(track.id, null);
    }
  }

  async applyProposal(id: number) {
    const track = this.tracks().find((t) => t.id === id);
    const proposal = this.proposals()[id];
    if (!track || !proposal) return;
    const candidate = proposal.candidates[proposal.selected];
    const payload: Record<string, string | number> = {};
    for (const f of this.changedFields(track, proposal)) {
      if (proposal.accept[f]) payload[f] = candidate.fields[f];
    }
    if (!Object.keys(payload).length) { this.dismiss(id); return; }
    for (const [k, v] of Object.entries(candidate.provenance ?? {})) if (v) payload[k] = v;
    this.setBusy(id, 'save');
    try {
      this.patch(await this.api.updateTags(id, payload));
      this.dismiss(id);
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.setBusy(id, null);
    }
  }

  async saveTags(id: number, tags: Record<string, string | number>) {
    this.setBusy(id, 'save');
    try {
      this.patch(await this.api.updateTags(id, tags));
      this.dismiss(id);
      this.toast.success('Tags saved');
      return true;
    } catch (e) {
      this.toast.error(errorMessage(e));
      return false;
    } finally {
      this.setBusy(id, null);
    }
  }

  // ---- batch helpers (client-side sequential loops with cancel) ---------------------
  cancelBatch() { this.batchCancelled = true; }

  async fetchMatches(ids: number[]) {
    const byId = new Map(this.tracks().map((t) => [t.id, t]));
    const todo = ids.filter((id) => byId.has(id) && !this.proposals()[id]);
    if (!todo.length) { this.toast.info('Nothing to fetch'); return; }
    this.batchCancelled = false;
    for (let i = 0; i < todo.length && !this.batchCancelled; i++) {
      this.batch.set({ label: 'Matching metadata', done: i, total: todo.length });
      await this.findMatch(byId.get(todo[i])!, false);
    }
    this.batch.set(null);
    this.toast.success(`Review ${this.pendingCount()} proposed change(s)`);
  }

  async applyAll() {
    const ids = Object.keys(this.proposals()).map(Number);
    this.batchCancelled = false;
    for (let i = 0; i < ids.length && !this.batchCancelled; i++) {
      this.batch.set({ label: 'Saving tags', done: i, total: ids.length });
      await this.applyProposal(ids[i]);
    }
    this.batch.set(null);
    this.toast.success('Saved reviewed changes');
  }

  // ---- lyrics ---------------------------------------------------------------------------
  private lyricsOptions() {
    return { overwrite_lrc: this.settings.overwriteLrc(), overwrite_ttml: this.settings.overwriteTtml(), embed: this.settings.embedLyrics() };
  }

  async fetchLyrics(track: Track) {
    this.setBusy(track.id, 'lyrics');
    try {
      const { result, track: updated } = await this.api.trackLyrics(track.id, this.lyricsOptions());
      this.patch(updated);
      const text = result.message.replace(/^\[[^\]]+\]\s*/, '');
      (result.status === 'success' ? this.toast.success : result.status === 'error' ? this.toast.error : this.toast.info)(text);
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.setBusy(track.id, null);
    }
  }

  startLyricsBatch(ids: number[] | null) {
    return this.jobs.start(() => this.api.startLyrics(ids, this.lyricsOptions()));
  }

  startAnalysis(ids: number[] | null, force = this.settings.reanalyze()) {
    return this.jobs.start(() => this.api.startAnalysis(ids, force));
  }

  startCovers(ids: number[] | null, force = false) {
    return this.jobs.start(() => this.api.startCovers(ids, force));
  }

  // ---- removing tracks ------------------------------------------------------------------
  async remove(ids: number[], deleteFiles: boolean) {
    try {
      const { removed } = await this.api.removeTracks(ids, deleteFiles);
      this.toast.success(`${removed} track(s) removed${deleteFiles ? ' and deleted from disk' : ' from the library (files kept)'}`);
      await this.load(true);
    } catch (e) {
      this.toast.error(errorMessage(e));
    }
  }

  async clear(deleteFiles: boolean) {
    try {
      const { removed } = await this.api.clearLibrary(deleteFiles);
      this.proposals.set({});
      this.toast.success(`Library cleared (${removed} track(s))${deleteFiles ? ', files deleted' : ', files kept'}`);
      await this.load(true);
    } catch (e) {
      this.toast.error(errorMessage(e));
    }
  }

  async pruneMissing() {
    try {
      const { removed } = await this.api.pruneMissing();
      this.toast.success(removed ? `Removed ${removed} entr${removed === 1 ? 'y' : 'ies'} whose files are gone` : 'No missing files found');
      await this.load(true);
    } catch (e) {
      this.toast.error(errorMessage(e));
    }
  }

  async removeLyrics(id: number, kind: 'lrc' | 'ttml') {
    try {
      this.patch(await this.api.deleteLyrics(id, kind));
    } catch (e) {
      this.toast.error(errorMessage(e));
    }
  }

  readonly columns = COLUMNS;
}
