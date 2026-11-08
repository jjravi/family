// @vitest-environment jsdom
import { crc32 as zlibCrc32, deflateSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dpiAttempts, exportPng, pngSize } from '../../src/export/png';
import { pageGeometry } from '../../src/style';

const POSTER = '<svg xmlns="http://www.w3.org/2000/svg" width="18in" height="24in" viewBox="0 0 1296 1728"><rect width="1296" height="1728" fill="#fff"/></svg>';

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(zlibCrc32(body), 8 + data.length);
  return out;
}

/** What canvas.toBlob would produce: a minimal 1 × 1 PNG. */
function encodedPng(): Blob {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const bytes = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from([0, 255, 255, 255]))),
    chunk('IEND', new Uint8Array(0)),
  ]);
  return new Blob([bytes], { type: 'image/png' });
}

const restorers: (() => void)[] = [];

/** Replaces (or defines, where jsdom lacks it) `target[name]` until the test ends. */
function stub<T extends object>(target: T, name: string, value: unknown): void {
  const previous = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, { configurable: true, writable: true, value });
  restorers.push(() => (previous ? Object.defineProperty(target, name, previous) : Reflect.deleteProperty(target, name)));
}

/** Fakes the browser pieces jsdom lacks; canvases above `maxPixels` fail the way browsers do (toBlob yields null). */
function fakeBrowser(maxPixels: number, decode: (image: HTMLImageElement) => Promise<void> = async () => {}) {
  const created: string[] = [];
  const revoked: string[] = [];
  const imageSources: string[] = [];
  const svgTexts = new Map<string, Promise<string>>();
  const drawn: [number, number][] = [];
  stub(URL, 'createObjectURL', (blob: Blob) => {
    const url = `blob:fake-${created.length + 1}`;
    created.push(url);
    svgTexts.set(url, blob.text());
    return url;
  });
  stub(URL, 'revokeObjectURL', (url: string) => void revoked.push(url));
  stub(HTMLImageElement.prototype, 'decode', function (this: HTMLImageElement) {
    imageSources.push(this.src);
    return decode(this);
  });
  stub(HTMLCanvasElement.prototype, 'getContext', function (this: HTMLCanvasElement) {
    const canvas = this;
    return { fillStyle: '', fillRect() {}, drawImage: () => void drawn.push([canvas.width, canvas.height]) };
  });
  stub(HTMLCanvasElement.prototype, 'toBlob', function (this: HTMLCanvasElement, callback: BlobCallback) {
    callback(this.width * this.height > maxPixels ? null : encodedPng());
  });
  return { created, revoked, imageSources, svgTexts, drawn };
}

function physOf(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  const at = buffer.indexOf('pHYs', 0, 'latin1');
  return at < 0 ? null : { x: buffer.readUInt32BE(at + 4), y: buffer.readUInt32BE(at + 8), unit: buffer[at + 12] };
}

beforeEach(() => {
  if (typeof requestAnimationFrame !== 'function') vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 0));
});

afterEach(() => {
  for (const restore of restorers.splice(0).reverse()) restore();
  vi.unstubAllGlobals();
});

describe('pngSize and dpiAttempts', () => {
  it('sizes the page at the DPI: 18x24 at 300 DPI is 5400 x 7200', () => {
    expect(pngSize(pageGeometry('18x24', 'portrait'), 300)).toEqual({ width: 5400, height: 7200 });
    expect(pngSize(pageGeometry('18x24', 'landscape'), 300)).toEqual({ width: 7200, height: 5400 });
    expect(pngSize(pageGeometry('a3', 'portrait'), 300)).toEqual({ width: 3508, height: 4961 });
  });

  it('falls back through lower DPI steps only', () => {
    expect(dpiAttempts(300)).toEqual([300, 240, 200, 150, 120, 96, 72]);
    expect(dpiAttempts(150)).toEqual([150, 120, 96, 72]);
  });
});

describe('exportPng', () => {
  it('renders at the requested DPI, sizing the SVG to the canvas and tagging the PNG with its DPI', async () => {
    const browser = fakeBrowser(Number.POSITIVE_INFINITY);
    const result = await exportPng(POSTER, pageGeometry('18x24', 'portrait'));
    expect(result).toMatchObject({ width: 5400, height: 7200, dpi: 300 });
    expect(result.blob.type).toBe('image/png');
    expect(physOf(new Uint8Array(await result.blob.arrayBuffer()))).toEqual({ x: 11811, y: 11811, unit: 1 });
    const svg = await browser.svgTexts.get(browser.imageSources[0]!)!;
    const root = svg.slice(0, svg.indexOf('>') + 1);
    for (const attribute of ['width="5400"', 'height="7200"', 'preserveAspectRatio="none"', 'viewBox="0 0 1296 1728"']) expect(root).toContain(attribute);
    expect(browser.drawn).toEqual([
      [5400, 7200],
      [5400, 7200],
    ]);
    expect(browser.revoked).toEqual(browser.created);
  });

  it('falls back to a lower DPI when the canvas is too large, and reports it', async () => {
    const browser = fakeBrowser(20_000_000);
    const result = await exportPng(POSTER, pageGeometry('18x24', 'portrait'), 300);
    expect(result).toMatchObject({ width: 3600, height: 4800, dpi: 200 });
    expect(physOf(new Uint8Array(await result.blob.arrayBuffer()))).toEqual({ x: 7874, y: 7874, unit: 1 });
    expect(browser.imageSources).toHaveLength(3);
    expect(browser.revoked).toEqual(browser.created);
  });

  it('rejects when every DPI step fails', async () => {
    const browser = fakeBrowser(0);
    await expect(exportPng(POSTER, pageGeometry('8x10', 'portrait'))).rejects.toThrow(/canvas large enough/);
    expect(browser.revoked).toEqual(browser.created);
  });

  it('rejects when the SVG does not load as an image', async () => {
    const browser = fakeBrowser(Number.POSITIVE_INFINITY, async () => {
      throw new Error('EncodingError');
    });
    await expect(exportPng(POSTER, pageGeometry('8x10', 'portrait'))).rejects.toThrow(/EncodingError/);
    expect(browser.revoked).toEqual(browser.created);
  });
});
