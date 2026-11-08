const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const VALUES: Int8Array = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

/** Base64url (RFC 4648 §5) without padding. */
export function encodeBase64Url(bytes: Uint8Array): string {
  let out = '';
  const whole = bytes.length - (bytes.length % 3);
  for (let i = 0; i < whole; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += ALPHABET[n >>> 18]! + ALPHABET[(n >>> 12) & 63]! + ALPHABET[(n >>> 6) & 63]! + ALPHABET[n & 63]!;
  }
  const rest = bytes.length - whole;
  if (rest > 0) {
    const n = (bytes[whole]! << 16) | (rest === 2 ? bytes[whole + 1]! << 8 : 0);
    out += ALPHABET[n >>> 18]! + ALPHABET[(n >>> 12) & 63]!;
    if (rest === 2) out += ALPHABET[(n >>> 6) & 63]!;
  }
  return out;
}

/**
 * Decodes unpadded base64url. Null when `text` holds a character outside the
 * base64url alphabet (padding included) or has an impossible length (4n + 1).
 * Non-zero bits in the last character are ignored.
 */
export function decodeBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (text.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let length = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const value = code < 128 ? VALUES[code]! : -1;
    if (value < 0) return null;
    buffer = ((buffer << 6) | value) & 0x3fff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[length++] = (buffer >>> bits) & 0xff;
    }
  }
  return out;
}
