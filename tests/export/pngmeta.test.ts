import { crc32 as zlibCrc32, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, withPngDpi } from '../../src/export/pngmeta';

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlibCrc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** A valid 2 × 1 RGBA PNG, optionally with extra chunks before IDAT. */
function tinyPng(extra: Buffer[] = []): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const scanline = Buffer.from([0, 255, 0, 0, 255, 0, 0, 255, 255]);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      ...extra,
      chunk('IDAT', deflateSync(scanline)),
      chunk('IEND', new Uint8Array(0)),
    ]),
  );
}

function readChunks(png: Uint8Array): { type: string; data: Buffer; crcOk: boolean }[] {
  const buffer = Buffer.from(png);
  const chunks = [];
  for (let offset = 8; offset < buffer.length; ) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const crcOk = buffer.readUInt32BE(offset + 8 + length) === zlibCrc32(buffer.subarray(offset + 4, offset + 8 + length));
    chunks.push({ type, data, crcOk });
    offset += 12 + length;
  }
  return chunks;
}

function physOf(data: Buffer) {
  return { x: data.readUInt32BE(0), y: data.readUInt32BE(4), unit: data[8] };
}

describe('crc32', () => {
  it('matches the standard check values and zlib', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082);
    const bytes = new Uint8Array(1000).map((_, i) => (i * 7919) & 0xff);
    expect(crc32(bytes)).toBe(zlibCrc32(bytes));
    expect(crc32(bytes, 10, 500)).toBe(zlibCrc32(bytes.subarray(10, 500)));
  });
});

describe('withPngDpi', () => {
  it('adds a valid pHYs chunk right after IHDR, in pixels per meter', () => {
    const chunks = readChunks(withPngDpi(tinyPng(), 300));
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);
    expect(chunks.every((c) => c.crcOk)).toBe(true);
    expect(physOf(chunks[1]!.data)).toEqual({ x: 11811, y: 11811, unit: 1 });
  });

  it('replaces an existing pHYs', () => {
    const old = Buffer.alloc(9);
    old.writeUInt32BE(2835, 0);
    old.writeUInt32BE(2835, 4);
    old[8] = 1;
    const chunks = readChunks(withPngDpi(tinyPng([chunk('pHYs', old)]), 150));
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);
    expect(physOf(chunks[1]!.data)).toEqual({ x: 5906, y: 5906, unit: 1 });
  });

  it('keeps every other byte intact', () => {
    const png = tinyPng();
    const out = withPngDpi(png, 72);
    expect(out.length).toBe(png.length + 21);
    expect(Buffer.from(out.subarray(0, 33)).equals(Buffer.from(png.subarray(0, 33)))).toBe(true);
    expect(Buffer.from(out.subarray(54)).equals(Buffer.from(png.subarray(33)))).toBe(true);
  });

  it('rejects input that is not a well-formed PNG', () => {
    expect(() => withPngDpi(new TextEncoder().encode('GIF89a......'), 300)).toThrow(/Not a PNG/);
    const png = tinyPng();
    expect(() => withPngDpi(png.subarray(0, png.length - 5), 300)).toThrow(/Truncated/);
    const noHeader = Buffer.concat([Buffer.from(png.subarray(0, 8)), chunk('IEND', new Uint8Array(0))]);
    expect(() => withPngDpi(new Uint8Array(noHeader), 300)).toThrow(/IHDR/);
  });
});
