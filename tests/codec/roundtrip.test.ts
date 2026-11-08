import { describe, expect, it } from 'vitest';
import { decode } from '../../src/codec/decode';
import { encode } from '../../src/codec/encode';
import { EXAMPLE_DSL, SAMPLE_DSL } from '../../src/dsl/sample';
import { DEFAULT_STYLE, type Style } from '../../src/style';
import { randomDsl, randomStyle, seededRandom } from './random';

const style = (overrides: Partial<Style> = {}): Style => ({ ...DEFAULT_STYLE, ...overrides });

async function expectRoundTrip(dsl: string, input: Style): Promise<string> {
  const fragment = await encode(dsl, input);
  const result = await decode(fragment);
  expect(result).toEqual({ status: 'ok', dsl, style: input, warnings: [] });
  return fragment;
}

describe('encode', () => {
  it('writes only v and d for the default style', async () => {
    const fragment = await encode(EXAMPLE_DSL, DEFAULT_STYLE);
    expect(fragment).toMatch(/^v=1&d=[A-Za-z0-9_-]+$/);
  });

  it('writes v first, readable non-default style params in a fixed order, and d last', async () => {
    const fragment = await encode(
      'A -> B\nfocus: A',
      style({ layout: 'fan', theme: 'modern', dates: false, traits: true, living: true, qr: false, size: 'a3', orientation: 'landscape' }),
    );
    expect(fragment).toMatch(/^v=1&l=fan&t=modern&dates=0&traits=1&living=1&qr=0&size=a3&o=landscape&d=[A-Za-z0-9_-]+$/);
  });

  it('omits each param that equals DEFAULT_STYLE', async () => {
    const fragment = await encode('x', style({ theme: 'botanical' }));
    expect(fragment).toMatch(/^v=1&t=botanical&d=[A-Za-z0-9_-]+$/);
  });

  it('is deterministic and URL-safe', async () => {
    const first = await encode(SAMPLE_DSL, style({ traits: true }));
    expect(await encode(SAMPLE_DSL, style({ traits: true }))).toBe(first);
    expect(first).toMatch(/^[A-Za-z0-9=&._-]+$/);
  });

  it('round-trips the spec example, the sample, and the empty tree', async () => {
    await expectRoundTrip(EXAMPLE_DSL, DEFAULT_STYLE);
    await expectRoundTrip(SAMPLE_DSL, style({ layout: 'bowtie', orientation: 'landscape' }));
    await expectRoundTrip('', DEFAULT_STYLE);
  });

  it('keeps a byte-order mark, CRLF line endings, and trailing whitespace exactly', async () => {
    await expectRoundTrip('\ufeffRose Kim 1932 -> Mary\r\nfocus: Mary \r\n\t', DEFAULT_STYLE);
  });
});

describe('decode(encode(dsl, style)) property', () => {
  it('returns the same DSL and style for random Unicode text and random styles', async () => {
    const random = seededRandom(20261107);
    for (let i = 0; i < 400; i++) {
      const dsl = randomDsl(random, i % 50 === 0 ? 3000 : 120);
      const input = randomStyle(random);
      const fragment = await expectRoundTrip(dsl, input);
      expect(fragment.startsWith('v=1&')).toBe(true);
      expect(fragment).toMatch(/&d=[A-Za-z0-9_-]+$/);
    }
  });

  it('also decodes with a leading # or as part of a whole share URL', async () => {
    const random = seededRandom(7);
    for (let i = 0; i < 20; i++) {
      const dsl = randomDsl(random, 60);
      const input = randomStyle(random);
      const fragment = await encode(dsl, input);
      for (const form of [`#${fragment}`, `https://family.jostache.com/#${fragment}`]) {
        expect(await decode(form)).toEqual({ status: 'ok', dsl, style: input, warnings: [] });
      }
    }
  });
});
