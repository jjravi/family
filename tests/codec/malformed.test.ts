import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decode } from '../../src/codec/decode';
import { encode } from '../../src/codec/encode';
import { EXAMPLE_DSL, SAMPLE_DSL } from '../../src/dsl/sample';
import { DEFAULT_STYLE } from '../../src/style';
import { seededRandom } from './random';

const payloadOf = async (dsl: string) => new URLSearchParams(await encode(dsl, DEFAULT_STYLE)).get('d')!;
const rawPayload = (bytes: Uint8Array) => Buffer.from(deflateRawSync(bytes)).toString('base64url');
const defaults = { ...DEFAULT_STYLE };

describe('decode: empty links', () => {
  it('treats an empty fragment, a bare #, or no d as empty', async () => {
    for (const fragment of ['', '#', '   ', 'v=1', '#v=1&d=', 'v=1&d=%20%0A']) {
      expect(await decode(fragment), JSON.stringify(fragment)).toEqual({ status: 'empty', style: defaults });
    }
  });

  it('keeps the style params of an empty link', async () => {
    expect(await decode('#t=modern&traits=1')).toEqual({ status: 'empty', style: { ...defaults, theme: 'modern', traits: true } });
    expect(await decode('v=1&size=a2&o=landscape')).toEqual({ status: 'empty', style: { ...defaults, size: 'a2', orientation: 'landscape' } });
  });

  it('returns a fresh, mutable style object', async () => {
    const result = await decode('');
    expect(result.style).not.toBe(DEFAULT_STYLE);
    expect(Object.isFrozen(result.style)).toBe(false);
  });
});

describe('decode: versions', () => {
  it('reports a future version and still recovers the DSL when the payload reads as v1', async () => {
    const result = await decode(`v=2&t=modern&d=${await payloadOf(EXAMPLE_DSL)}`);
    expect(result).toMatchObject({ status: 'error', reason: 'unsupported-version', dsl: EXAMPLE_DSL, style: { theme: 'modern' } });
    if (result.status === 'error') expect(result.message).toMatch(/newer version.*2/);
  });

  it('reports a missing version, recovering the DSL', async () => {
    const result = await decode(`d=${await payloadOf(EXAMPLE_DSL)}`);
    expect(result).toMatchObject({ status: 'error', reason: 'unsupported-version', dsl: EXAMPLE_DSL });
    if (result.status === 'error') expect(result.message).toMatch(/no version/);
  });

  it('reports unknown and unreadable versions with dsl null when nothing reads', async () => {
    for (const fragment of ['v=99', 'v=2&d=***', 'v=abc&d=AAAA', 'v=0']) {
      const result = await decode(fragment);
      expect(result, fragment).toMatchObject({ status: 'error', reason: 'unsupported-version', dsl: null, style: defaults });
      if (result.status === 'error') expect(result.message).not.toMatch(/\n/);
    }
  });

  it('checks v before d: a future link is never reported as corrupt', async () => {
    expect(await decode('v=3&d=!!!!')).toMatchObject({ status: 'error', reason: 'unsupported-version' });
  });
});

describe('decode: corrupt payloads', () => {
  it('rejects characters outside base64url', async () => {
    const result = await decode('v=1&d=ab!cd');
    expect(result).toMatchObject({ status: 'error', reason: 'corrupt', dsl: null, style: defaults });
    if (result.status === 'error') expect(result.message).toMatch(/damaged/);
  });

  it('rejects data that does not inflate', async () => {
    expect(await decode('v=1&d=AAAA')).toMatchObject({ status: 'error', reason: 'corrupt', dsl: null });
    expect(await decode('v=1&d=_____w')).toMatchObject({ status: 'error', reason: 'corrupt', dsl: null });
  });

  it('recovers the start of a link cut short', async () => {
    const payload = await payloadOf(SAMPLE_DSL);
    for (const cut of [1, 2, 3, 40]) {
      const result = await decode(`v=1&t=modern&d=${payload.slice(0, -cut)}`);
      expect(result, `cut ${cut}`).toMatchObject({ status: 'error', reason: 'corrupt', style: { theme: 'modern' } });
      if (result.status !== 'error') continue;
      expect(result.dsl).not.toBeNull();
      expect(result.dsl!.length).toBeGreaterThan(SAMPLE_DSL.length / 2);
      expect(SAMPLE_DSL.startsWith(result.dsl!)).toBe(true);
    }
  });

  it('flags invalid UTF-8 and still shows the lossy text', async () => {
    const result = await decode(`v=1&d=${rawPayload(new Uint8Array([0x66, 0xff, 0x6f]))}`);
    expect(result).toMatchObject({ status: 'error', reason: 'corrupt', dsl: 'f\ufffdo' });
    if (result.status === 'error') expect(result.message).toMatch(/UTF-8/);
  });

  it('refuses to inflate a decompression bomb', async () => {
    const result = await decode(`v=1&d=${rawPayload(new Uint8Array(3_000_000).fill(0x61))}`);
    expect(result).toMatchObject({ status: 'error', reason: 'corrupt', dsl: null });
    if (result.status === 'error') expect(result.message).toMatch(/more tree data/);
  });

  it('reports junk after the end of the data as corrupt, keeping the whole text', async () => {
    const result = await decode(`v=1&d=${await payloadOf(EXAMPLE_DSL)}AAAAAAAA`);
    expect(result).toMatchObject({ status: 'error', reason: 'corrupt', dsl: EXAMPLE_DSL });
  });
});

describe('decode: mangled but readable links', () => {
  it('undoes percent-encoding of values and of the whole fragment', async () => {
    const payload = await payloadOf(EXAMPLE_DSL);
    const escaped = payload.replaceAll('-', '%2D').replaceAll('_', '%5F');
    const expected = { status: 'ok', dsl: EXAMPLE_DSL, style: { ...defaults, theme: 'modern' }, warnings: [] };
    expect(await decode(`v=1&t=mod%65rn&d=${escaped}`)).toEqual(expected);
    expect(await decode(encodeURIComponent(`v=1&t=modern&d=${payload}`))).toEqual(expected);
  });

  it('ignores stray whitespace, padding, &amp; separators, and the standard base64 alphabet', async () => {
    const payload = await payloadOf(SAMPLE_DSL);
    const expected = { status: 'ok', dsl: SAMPLE_DSL, style: { ...defaults, traits: true }, warnings: [] };
    const broken = `${payload.slice(0, 30)}\n  ${payload.slice(30, 60)}%20${payload.slice(60)}`;
    expect(await decode(`  #v=1&traits=1&d=${broken}  \n`)).toEqual(expected);
    expect(await decode(`v=1&amp;traits=1&amp;d=${payload}`)).toEqual(expected);
    expect(await decode(` v = 1 & traits = 1 & d=${payload}==`)).toEqual(expected);
    const standard = payload.replaceAll('-', '%2B').replaceAll('_', '/');
    expect(await decode(`v=1&traits=1&d=${standard}`)).toEqual(expected);
  });

  it('lets the last of a repeated param win', async () => {
    const result = await decode(`v=1&t=modern&t=botanical&d=${await payloadOf('A')}`);
    expect(result).toMatchObject({ status: 'ok', style: { theme: 'botanical' }, warnings: [] });
  });
});

describe('decode: style params', () => {
  it('falls back to the default with one warning per invalid value or unknown param', async () => {
    const payload = await payloadOf('A');
    const result = await decode(`v=1&foo=bar&t=dark&dates=yes&o=sideways&qr=&l=fan&d=${payload}&utm_source=mail`);
    expect(result).toMatchObject({ status: 'ok', dsl: 'A', style: { ...defaults, layout: 'fan' } });
    if (result.status !== 'ok') return;
    expect(result.warnings).toHaveLength(6);
    for (const word of ['theme "dark"', 'dates setting "yes"', 'orientation "sideways"', 'QR setting ""', '"foo"', '"utm_source"']) {
      expect(result.warnings.some((warning) => warning.includes(word)), word).toBe(true);
    }
  });

  it('accepts enum values in any case, and auto for layout and orientation', async () => {
    const result = await decode(`v=1&t=Modern&size=A3&l=AUTO&o=auto&d=${await payloadOf('A')}`);
    expect(result).toEqual({ status: 'ok', dsl: 'A', style: { ...defaults, theme: 'modern', size: 'a3' }, warnings: [] });
  });

  it('keeps warnings short when a value is huge', async () => {
    const result = await decode(`v=1&t=${'x'.repeat(5000)}&d=${await payloadOf('A')}`);
    if (result.status !== 'ok') throw new Error(result.status);
    expect(result.warnings[0]!.length).toBeLessThan(120);
  });
});

describe('decode never rejects', () => {
  it('resolves for random garbage', async () => {
    const random = seededRandom(404);
    const alphabet = 'v=1&d#%+-_ /\n\tAZaz09é😀\u0000';
    for (let i = 0; i < 300; i++) {
      let text = random() < 0.5 ? 'v=1&d=' : '';
      const length = Math.floor(random() * 60);
      for (let j = 0; j < length; j++) text += alphabet[Math.floor(random() * alphabet.length)];
      const result = await decode(text);
      expect(['empty', 'ok', 'error']).toContain(result.status);
    }
  });
});
