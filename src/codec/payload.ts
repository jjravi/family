import { decodeBase64Url, encodeBase64Url } from './base64url';
import { deflateRaw, inflateRaw } from './deflate';

/** Largest DSL a link may inflate to (1 MiB; a 100-person tree is about 3 KB). */
const MAX_DSL_BYTES = 1 << 20;

/** A decoded DSL, or a one-line message plus `partial`: the readable text that survived, else null. */
export type PayloadResult = { ok: true; dsl: string } | { ok: false; message: string; partial: string | null };

const MESSAGES = {
  alphabet: 'This link is damaged: its tree data contains characters that do not belong there.',
  inflate: 'This link is damaged or was cut short, so its tree could not be fully read.',
  tooLarge: 'This link holds more tree data than Family Tree can open.',
  utf8: 'This link is damaged: its tree text is not valid UTF-8.',
} as const;

/** The v1 `d` value: base64url (no padding) of deflate-raw of the UTF-8 DSL, exactly as given. */
export async function encodePayload(dsl: string): Promise<string> {
  return encodeBase64Url(await deflateRaw(new TextEncoder().encode(dsl)));
}

/**
 * Reads a v1 `d` value. Tolerates what mangled links pick up: whitespace
 * anywhere, '=' padding, the standard base64 '+' and '/', and a dangling last
 * character from a link cut short. A byte-order mark in the DSL is kept, so
 * the text round-trips exactly.
 */
export async function decodePayload(value: string): Promise<PayloadResult> {
  const text = value.replace(/\s+/g, '').replace(/=+$/, '').replaceAll('+', '-').replaceAll('/', '_');
  const truncated = text.length % 4 === 1;
  const bytes = decodeBase64Url(truncated ? text.slice(0, -1) : text);
  if (!bytes) return { ok: false, message: MESSAGES.alphabet, partial: null };

  const inflated = await inflateRaw(bytes, MAX_DSL_BYTES);
  if (inflated.error === 'too-large') return { ok: false, message: MESSAGES.tooLarge, partial: null };
  if (inflated.error || truncated) return { ok: false, message: MESSAGES.inflate, partial: readablePrefix(inflated.bytes) };

  try {
    return { ok: true, dsl: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(inflated.bytes) };
  } catch {
    return { ok: false, message: MESSAGES.utf8, partial: new TextDecoder('utf-8', { ignoreBOM: true }).decode(inflated.bytes) || null };
  }
}

/** The text of a partial inflate, minus a character cut in half at the end; null when empty or not UTF-8 (likely garbage). */
function readablePrefix(bytes: Uint8Array<ArrayBuffer>): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes, { stream: true });
    return text === '' ? null : text;
  } catch {
    return null;
  }
}
