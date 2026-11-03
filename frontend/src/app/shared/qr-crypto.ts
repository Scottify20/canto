/**
 * Pairing QR codes are sealed with AES-256-GCM so a generic scanner only sees opaque text.
 * The key is built into the app, so this is obfuscation (it keeps the address and PIN from being
 * readable or tapped open by other apps), not a secret: the PIN remains the real access control.
 */
const PREFIX = 'CANTO1.';
const APP_KEY = 'canto-pairing-v1/7f3a9c1e-52d8-4b60-9a17-e4c0b8d2a6f5';

interface PairingData { u: string; p?: string }

const canSeal = () => typeof crypto !== 'undefined' && !!crypto.subtle;

async function key(): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(APP_KEY));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Encrypted pairing text; falls back to the plain address where WebCrypto is unavailable (non-secure page). */
export async function sealPairing(url: string, pin?: string): Promise<string> {
  const plain = pin ? `${url}/?pin=${pin}` : url;
  if (!canSeal()) return plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify({ u: url, p: pin || undefined } satisfies PairingData));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), data));
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return PREFIX + toB64(out);
}

export const isSealedPairing = (text: string) => text.startsWith(PREFIX);

/** Decrypts a pairing code; null when it isn't one of ours or was tampered with. */
export async function openPairing(text: string): Promise<PairingData | null> {
  if (!isSealedPairing(text) || !canSeal()) return null;
  try {
    const bytes = fromB64(text.slice(PREFIX.length));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await key(), bytes.slice(12));
    const data = JSON.parse(new TextDecoder().decode(plain)) as PairingData;
    return typeof data.u === 'string' ? data : null;
  } catch {
    return null;
  }
}
