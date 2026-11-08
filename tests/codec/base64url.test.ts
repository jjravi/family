import { describe, expect, it } from 'vitest';
import { decodeBase64Url, encodeBase64Url } from '../../src/codec/base64url';
import { seededRandom } from './random';

const ascii = (text: string) => new TextEncoder().encode(text);

describe('base64url', () => {
  it('matches the RFC 4648 test vectors, without padding', () => {
    const vectors: [string, string][] = [
      ['', ''],
      ['f', 'Zg'],
      ['fo', 'Zm8'],
      ['foo', 'Zm9v'],
      ['foob', 'Zm9vYg'],
      ['fooba', 'Zm9vYmE'],
      ['foobar', 'Zm9vYmFy'],
    ];
    for (const [plain, encoded] of vectors) {
      expect(encodeBase64Url(ascii(plain))).toBe(encoded);
      expect(decodeBase64Url(encoded)).toEqual(ascii(plain));
    }
  });

  it('uses - and _ instead of + and /', () => {
    expect(encodeBase64Url(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe('-_-_');
    expect(decodeBase64Url('-_-_')).toEqual(new Uint8Array([0xfb, 0xff, 0xbf]));
  });

  it('agrees with Node in both directions on random bytes', () => {
    const random = seededRandom(4648);
    for (let i = 0; i < 300; i++) {
      const bytes = new Uint8Array(Math.floor(random() * 70)).map(() => Math.floor(random() * 256));
      const encoded = encodeBase64Url(bytes);
      expect(encoded).toBe(Buffer.from(bytes).toString('base64url'));
      expect(decodeBase64Url(encoded)).toEqual(bytes);
    }
  });

  it('rejects characters outside the alphabet and impossible lengths', () => {
    for (const bad of ['Zg==', 'Zm+v', 'Zm/v', 'Zm9v*', 'Zm9 v', 'Zé', 'Z', 'Zm9vY']) {
      expect(decodeBase64Url(bad), bad).toBeNull();
    }
  });

  it('ignores non-zero trailing bits', () => {
    expect(decodeBase64Url('Zh')).toEqual(ascii('f'));
  });
});
