import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AnimatedCovers,
  CoverCandidate,
  CoverInfo,
  DuplicateGroup,
  FsListing,
  InboxScan,
  Job,
  LyricsCandidate,
  LyricsContent,
  LyricsResult,
  MaintenanceScan,
  MatchCandidate,
  RemoteInfo,
  Settings,
  SettingsUpdate,
  StructurePreview,
  SystemCheck,
  Track,
  TrackDetails
} from './models';

export const isNativeAndroid =
  (window as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() === 'android';

// The Android app cannot reach 127.0.0.1 on the computer; the address is saved by scanning the QR code in Remote control.
function androidApiBase(): string {
  return `${localStorage.getItem('canto.serverUrl') ?? ''}/api`;
}

// Tauri serves the UI from tauri.localhost (Windows) or localhost (Linux); the backend is always local.
const isDesktopApp = location.hostname === 'tauri.localhost';

export const PIN_KEY = 'canto.pin';
/** PIN for a shared computer, saved when the phone connects; sent as X-Canto-Pin (and ?pin= on media URLs) */
export const savedPin = () => (isNativeAndroid ? (localStorage.getItem(PIN_KEY) ?? '') : '');

export const API_BASE = isNativeAndroid
  ? androidApiBase()
  : location.port === '4200' || location.port === '4300'
    ? '/api'
    : `http://${isDesktopApp ? '127.0.0.1' : location.hostname || '127.0.0.1'}:8010/api`;

export interface LyricsOptions {
  overwrite_lrc: boolean;
  overwrite_ttml: boolean;
  embed: boolean;
}

export function errorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      if (isNativeAndroid) {
        return API_BASE === '/api'
          ? 'Not connected to a computer. Open Remote control and scan the QR code shown on the computer.'
          : `Cannot reach the backend at ${API_BASE}. Is Sharing on, on the computer? Rescan the QR code in Remote control if the address changed.`;
      }
      return 'Cannot reach the backend (is it running on port 8010?)';
    }
    if (err.status === 401 && isNativeAndroid) return 'The PIN is missing or wrong. Open Remote control and scan the QR code on the computer again.';
    if (err.status === 429) return 'Too many wrong PINs. Wait a minute, then rescan the QR code.';
    const detail = err.error?.detail;
    return typeof detail === 'string' ? detail : err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  private pinQuery(sep: '?' | '&') {
    const pin = savedPin();
    return pin ? `${sep}pin=${encodeURIComponent(pin)}` : '';
  }
  audioUrl(id: number): string {
    return `${API_BASE}/tracks/${id}/audio${this.pinQuery('?')}`;
  }
  coverUrl(id: number, size = 96, version = 0): string {
    return `${API_BASE}/tracks/${id}/cover?size=${size}&v=${version}${this.pinQuery('&')}`;
  }
  animatedUrl(id: number, shape: 'square' | 'tall', version = 0): string {
    return `${API_BASE}/tracks/${id}/animated/${shape}?v=${version}${this.pinQuery('&')}`;
  }

  private get<T>(path: string, params: Record<string, string | number> = {}) {
    return firstValueFrom(this.http.get<T>(`${API_BASE}${path}`, { params }));
  }
  private post<T>(path: string, body: unknown = {}) {
    return firstValueFrom(this.http.post<T>(`${API_BASE}${path}`, body));
  }

  remoteInfo() {
    return this.get<RemoteInfo>('/remote');
  }
  setSharing(enabled: boolean) {
    return firstValueFrom(this.http.put<RemoteInfo>(`${API_BASE}/remote`, { enabled }));
  }
  setShareAutoStart(auto_start: boolean) {
    return firstValueFrom(this.http.put<RemoteInfo>(`${API_BASE}/remote`, { auto_start }));
  }
  status() {
    return this.get<{ message: string; checks: SystemCheck[] }>('/status');
  }
  getSettings() {
    return this.get<Settings>('/settings');
  }
  saveSettings(update: SettingsUpdate) {
    return firstValueFrom(this.http.put<Settings>(`${API_BASE}/settings`, update));
  }
  listFolder(path?: string) {
    return this.get<FsListing>('/fs/list', path ? { path } : {});
  }

  tracks() {
    return this.get<{ data: Track[] }>('/tracks').then((r) => r.data);
  }
  details(id: number) {
    return this.get<TrackDetails>(`/tracks/${id}/details`);
  }
  match(id: number) {
    return this.post<{ candidates: MatchCandidate[] }>('/match', { id }).then((r) => r.candidates);
  }
  updateTags(id: number, tags: Record<string, string | number | boolean | null>) {
    return this.post<{ track: Track }>('/tags/update', { id, tags }).then((r) => r.track);
  }
  removeTracks(ids: number[], deleteFiles: boolean) {
    return this.post<{ removed: number }>('/tracks/remove', { ids, delete_files: deleteFiles });
  }
  clearLibrary(deleteFiles: boolean) {
    return this.post<{ removed: number }>('/library/clear', { delete_files: deleteFiles });
  }
  pruneMissing() {
    return this.post<{ removed: number }>('/library/prune-missing');
  }
  duplicates() {
    return this.get<{ groups: DuplicateGroup[] }>('/duplicates').then((r) => r.groups);
  }

  inboxScan(path?: string) {
    return this.post<InboxScan>('/inbox/scan', path ? { path } : {});
  }
  structurePreview(template: string) {
    return this.post<StructurePreview>('/structure/preview', { template });
  }
  maintenanceScan() {
    return this.get<MaintenanceScan>('/maintenance/scan');
  }
  maintenanceRun(actions: string[]) {
    return this.post<{ done: Record<string, number> }>('/maintenance/run', { actions });
  }

  startImport(files: string[] | null) {
    return this.post<Job>('/import', { files });
  }
  startLyrics(ids: number[] | null, options: LyricsOptions) {
    return this.post<Job>('/lyrics', { ids, ...options });
  }
  startAnalysis(ids: number[] | null, force = false) {
    return this.post<Job>('/analyze', { ids, force });
  }
  startCovers(ids: number[] | null, force = false) {
    return this.post<Job>('/covers', { ids, force });
  }
  trackLyrics(id: number, options: LyricsOptions) {
    return this.post<{ result: LyricsResult; track: Track }>('/lyrics/track', { id, ...options });
  }

  readLyrics(id: number) {
    return this.get<{ lyrics: LyricsContent; track: Track }>(`/tracks/${id}/lyrics`);
  }
  lyricsCandidates(id: number) {
    return this.get<{ candidates: LyricsCandidate[] }>(`/tracks/${id}/lyrics/candidates`).then((r) => r.candidates);
  }
  saveLyrics(id: number, kind: 'lrc' | 'ttml', content: string, embed = false) {
    return firstValueFrom(
      this.http.put<{ track: Track; saved_kind: 'lrc' | 'ttml' }>(`${API_BASE}/tracks/${id}/lyrics/${kind}`, { content, embed })
    );
  }
  deleteLyrics(id: number, kind: 'lrc' | 'ttml') {
    return firstValueFrom(this.http.delete<{ track: Track }>(`${API_BASE}/tracks/${id}/lyrics/${kind}`)).then(
      (r) => r.track
    );
  }

  coverInfo(id: number) {
    return this.get<CoverInfo>(`/tracks/${id}/cover/info`);
  }
  coverCandidates(id: number) {
    return this.get<{ candidates: CoverCandidate[]; notes: string[] }>(`/tracks/${id}/cover/candidates`);
  }
  uploadCover(id: number, file: Blob) {
    return this.post<CoverInfo>(`/tracks/${id}/cover`, file);
  }
  animatedList(id: number) {
    return this.get<AnimatedCovers>(`/tracks/${id}/animated`);
  }
  uploadAnimated(id: number, file: File, shape: 'square' | 'tall') {
    return firstValueFrom(
      this.http.post<{ shape: string; animated: AnimatedCovers }>(`${API_BASE}/tracks/${id}/animated`, file, { params: { name: file.name, shape } })
    );
  }
  deleteAnimated(id: number, shape: 'square' | 'tall') {
    return firstValueFrom(this.http.delete(`${API_BASE}/tracks/${id}/animated/${shape}`));
  }
  coverFromUrl(id: number, url: string) {
    return this.post<CoverInfo>(`/tracks/${id}/cover/from-url`, { url });
  }
  deleteCover(id: number) {
    return firstValueFrom(this.http.delete(`${API_BASE}/tracks/${id}/cover`));
  }

  currentJob(since = 0) {
    return this.get<Job | null>('/jobs/current', { since });
  }
  cancelJob() {
    return this.post<{ cancelled: boolean }>('/jobs/cancel');
  }
}
