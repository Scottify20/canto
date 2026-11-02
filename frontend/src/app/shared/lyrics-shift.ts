const LRC_STAMP = /([\[<])(\d+):(\d{1,2})(?:([.:])(\d{1,3}))?([\]>])/g;
const TTML_ATTR = /\b(begin|end)="([^"]+)"/g;

export function isTtml(text: string): boolean {
  return /<tt[\s>]/.test(text);
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

function fraction(ms: number, digits: number): string {
  const scaled = Math.round(ms / 10 ** (3 - digits));
  return pad(scaled, digits);
}

function shiftLrc(text: string, deltaMs: number): string {
  return text.replace(LRC_STAMP, (_m, open, min, sec, sep, frac, close) => {
    const digits = frac ? frac.length : 0;
    const fracMs = frac ? Number(frac.padEnd(3, '0')) : 0;
    const total = Math.max(0, (Number(min) * 60 + Number(sec)) * 1000 + fracMs + deltaMs);
    const m = Math.floor(total / 60000);
    const s = Math.floor((total % 60000) / 1000);
    const rest = total % 1000;
    const tail = digits ? `${sep}${fraction(rest, digits)}` : '';
    return `${open}${pad(m)}:${pad(s)}${tail}${close}`;
  });
}

function shiftClock(value: string, deltaMs: number): string {
  const v = value.trim();
  const unit = v.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
  if (unit) {
    const ms = Number(unit[1]) * { ms: 1, s: 1000, m: 60000, h: 3600000 }[unit[2] as 'ms' | 's' | 'm' | 'h'];
    return `${(Math.max(0, ms + deltaMs) / 1000).toFixed(3).replace(/\.?0+$/, '')}s`;
  }
  const parts = v.split(':');
  if (parts.some((p) => Number.isNaN(Number(p)))) return value;
  const seconds = parts.reduce((acc, p) => acc * 60 + Number(p), 0);
  const total = Math.max(0, Math.round(seconds * 1000 + deltaMs));
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const ms = total % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

function shiftTtml(text: string, deltaMs: number): string {
  return text.replace(TTML_ATTR, (_m, name, value) => `${name}="${shiftClock(value, deltaMs)}"`);
}

/** Moves every timestamp by `deltaMs` (negative = earlier). Works on LRC (incl. word stamps) and TTML. */
export function shiftLyrics(text: string, deltaMs: number): string {
  if (!deltaMs) return text;
  return isTtml(text) ? shiftTtml(text, deltaMs) : shiftLrc(text, deltaMs);
}
