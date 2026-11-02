import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  text: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  show(kind: Toast['kind'], text: string, ms = 4500) {
    if (this.toasts().some((t) => t.kind === kind && t.text === text)) return;
    const toast = { id: this.nextId++, kind, text };
    this.toasts.update((list) => [...list.slice(-3), toast]);
    setTimeout(() => this.dismiss(toast.id), ms);
  }
  info = (text: string) => this.show('info', text);
  success = (text: string) => this.show('success', text);
  warn = (text: string) => this.show('warning', text);
  error = (text: string) => this.show('error', text, 8000);

  dismiss(id: number) {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
