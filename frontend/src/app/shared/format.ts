export function formatDuration(seconds: number): string {
  if (!seconds) return '';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

export function channelLayout(channels: number): string {
  return { 1: 'Mono', 2: 'Stereo', 6: '5.1', 8: '7.1' }[channels] ?? `${channels}ch`;
}

export function formatDate(unixSeconds: number): string {
  return unixSeconds ? new Date(unixSeconds * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
}
