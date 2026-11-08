import jsQR from 'jsqr';
import qrcode from 'qrcode-generator';
import { describe, expect, it } from 'vitest';
import { encode } from '../../src/codec/encode';
import { SAMPLE_DSL } from '../../src/dsl/sample';
import { DEFAULT_STYLE } from '../../src/style';
import {
  QR_BYTE_CAPACITY,
  QR_MAX_BYTES,
  QR_MAX_VERSION,
  QR_MIN_MODULE,
  QR_MIN_SIZE,
  QR_QUIET_ZONE,
  qrPlan,
  qrSvg,
  type QrErrorCorrection,
} from '../../src/render/qr';
import { seededRandom } from '../codec/random';

const SITE = 'https://family.jostache.com/';
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const MARKUP = /^<g transform="translate\((\S+) (\S+)\) scale\((\S+)\)" shape-rendering="crispEdges"><path fill="([^"]*)" d="([^"]*)"\/><\/g>$/;

/** A share-URL-shaped ASCII string of exactly `length` characters. */
function urlOfLength(length: number, seed = 1): string {
  const random = seededRandom(seed);
  let url = `${SITE}#v=1&d=`;
  while (url.length < length) url += BASE64URL[Math.floor(random() * 64)];
  return url.slice(0, length);
}

function libraryVersion(text: string, ecc: QrErrorCorrection): number {
  const code = qrcode(0, ecc);
  code.addData(text, 'Byte');
  code.make();
  return (code.getModuleCount() - 17) / 4;
}

function parseMarkup(markup: string) {
  const match = MARKUP.exec(markup);
  if (!match) throw new Error(`unexpected QR markup: ${markup.slice(0, 120)}`);
  const [, x, y, scale, fill, d] = match;
  return { x: Number(x), y: Number(y), scale: Number(scale), fill: fill!, d: d! };
}

/** Rectangles of a path made of `M/m`, `h`, `v`, `z` commands, in path units. */
function pathRectangles(d: string): [number, number, number, number][] {
  const rectangles: [number, number, number, number][] = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let box = [0, 0, 0, 0];
  for (const [, command, args] of d.matchAll(/([MmHhVvZz])([^MmHhVvZz]*)/g)) {
    const n = args!.trim() === '' ? [] : args!.trim().split(/[\s,]+/).map(Number);
    if (command === 'M' || command === 'm') {
      x = command === 'M' ? n[0]! : x + n[0]!;
      y = command === 'M' ? n[1]! : y + n[1]!;
      [startX, startY] = [x, y];
      box = [x, y, x, y];
    } else if (command === 'h' || command === 'v') {
      if (command === 'h') x += n[0]!;
      else y += n[0]!;
      box = [Math.min(box[0]!, x), Math.min(box[1]!, y), Math.max(box[2]!, x), Math.max(box[3]!, y)];
    } else if (command === 'z' || command === 'Z') {
      rectangles.push(box as [number, number, number, number]);
      [x, y] = [startX, startY];
    } else {
      throw new Error(`unexpected path command ${command}`);
    }
  }
  return rectangles;
}

/** Paints the dark rectangles black on white, `pixelsPerUnit` pixels per path unit, `units` units square. */
function rasterize(d: string, units: number, pixelsPerUnit: number): { pixels: Uint8ClampedArray; side: number } {
  const side = units * pixelsPerUnit;
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
  for (const [left, top, right, bottom] of pathRectangles(d)) {
    for (let py = top * pixelsPerUnit; py < bottom * pixelsPerUnit; py++) {
      for (let px = left * pixelsPerUnit; px < right * pixelsPerUnit; px++) pixels.fill(0, (py * side + px) * 4, (py * side + px) * 4 + 3);
    }
  }
  return { pixels, side };
}

function scan(text: string): string | undefined {
  const plan = qrPlan(text)!;
  const markup = qrSvg(text, 10, 20, plan.size, '#1b1b1b')!;
  const { pixels, side } = rasterize(parseMarkup(markup).d, plan.modules + 2 * QR_QUIET_ZONE, 4);
  return jsQR(pixels, side, side, { inversionAttempts: 'dontInvert' })?.data;
}

describe('QR_BYTE_CAPACITY', () => {
  it('matches qrcode-generator at every boundary a plan can use', () => {
    for (const ecc of ['M', 'L'] as const) {
      for (let version = 1; version <= QR_MAX_VERSION; version++) {
        const capacity = QR_BYTE_CAPACITY[ecc][version - 1]!;
        expect(libraryVersion('x'.repeat(capacity), ecc), `${ecc}${version}`).toBe(version);
        expect(libraryVersion('x'.repeat(capacity + 1), ecc), `${ecc}${version}+1`).toBe(version + 1);
      }
    }
  });

  it('caps plans at version 22: the budget is exactly what version 22 holds at L', () => {
    expect(QR_MAX_BYTES).toBe(1003);
    expect(QR_MAX_VERSION).toBe(22);
    expect(QR_BYTE_CAPACITY.L[QR_MAX_VERSION - 1]).toBe(QR_MAX_BYTES);
  });

  it('avoids version 23, which jsQR misreads at L (its alignment table says 74 where ISO 18004 says 78)', () => {
    const text = urlOfLength(1024, 23);
    const code = qrcode(23, 'L');
    code.addData(text, 'Byte');
    code.make();
    const count = code.getModuleCount();
    const side = (count + 8) * 4;
    const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (!code.isDark(row, col)) continue;
        for (let dy = 0; dy < 4; dy++) {
          const start = (((row + 4) * 4 + dy) * side + (col + 4) * 4) * 4;
          for (let i = start; i < start + 16; i += 4) pixels.fill(0, i, i + 3);
        }
      }
    }
    // If this starts passing, a fixed jsQR is installed and the budget may grow to 1091 bytes (version 23 at L).
    expect(jsQR(pixels, side, side)?.data).not.toBe(text);
  });
});

describe('qrPlan', () => {
  it('prefers error correction M while it fits within QR_MAX_VERSION, then falls back to L', () => {
    expect(qrPlan('')).toMatchObject({ version: 1, modules: 21, ecc: 'M' });
    expect(qrPlan(urlOfLength(100))).toMatchObject({ version: 6, ecc: 'M' });
    expect(qrPlan(urlOfLength(779))).toMatchObject({ version: 22, modules: 105, ecc: 'M' });
    expect(qrPlan(urlOfLength(780))).toMatchObject({ version: 19, modules: 93, ecc: 'L' });
    expect(qrPlan(urlOfLength(QR_MAX_BYTES))).toMatchObject({ version: 22, modules: 105, ecc: 'L' });
    for (let length = 0; length <= QR_MAX_BYTES; length += 7) {
      expect(qrPlan(urlOfLength(length))!.version).toBeLessThanOrEqual(QR_MAX_VERSION);
    }
  });

  it('returns null over budget or for non-ASCII text', () => {
    expect(qrPlan(urlOfLength(QR_MAX_BYTES + 1))).toBeNull();
    expect(qrPlan(`${SITE}#v=1&d=é`)).toBeNull();
    expect(qrPlan(`${SITE}#🌳`)).toBeNull();
  });

  it('prints at least 2 cm, and grows so every module is at least 0.35 mm', () => {
    expect(QR_MIN_SIZE).toBeCloseTo((20 / 25.4) * 72, 9);
    expect(QR_MIN_MODULE).toBeCloseTo((0.35 / 25.4) * 72, 9);
    expect(qrPlan('short')!.size).toBe(56.7);
    for (let length = 0; length <= QR_MAX_BYTES; length += 13) {
      const plan = qrPlan(urlOfLength(length))!;
      const modulePt = plan.size / (plan.modules + 2 * QR_QUIET_ZONE);
      expect(plan.size).toBeGreaterThanOrEqual(QR_MIN_SIZE);
      expect(modulePt).toBeGreaterThanOrEqual(QR_MIN_MODULE);
      if (plan.size > QR_MIN_SIZE + 0.01) expect(modulePt).toBeLessThan(QR_MIN_MODULE + 0.001);
    }
  });

  it("plans SAMPLE_DSL's share URL at M, version 22, about 4 cm", async () => {
    const url = `${SITE}#${await encode(SAMPLE_DSL, DEFAULT_STYLE)}`;
    const plan = qrPlan(url)!;
    expect(plan).toMatchObject({ version: 22, modules: 105, ecc: 'M' });
    expect((plan.size / 72) * 25.4).toBeCloseTo(39.55, 1);
  });
});

describe('qrSvg', () => {
  it('scans back to the exact text: a short URL, the sample share URL, and a URL at the budget', async () => {
    const sample = `${SITE}#${await encode(SAMPLE_DSL, DEFAULT_STYLE)}`;
    for (const url of [`${SITE}#v=1&d=AwA`, sample, urlOfLength(QR_MAX_BYTES, 99)]) {
      expect(scan(url), `${url.length} bytes`).toBe(url);
    }
  });

  it('draws exactly the modules of the planned code', () => {
    const text = urlOfLength(300, 5);
    const plan = qrPlan(text)!;
    const code = qrcode(plan.version as Parameters<typeof qrcode>[0], plan.ecc);
    code.addData(text, 'Byte');
    code.make();
    const units = plan.modules + 2 * QR_QUIET_ZONE;
    const { pixels, side } = rasterize(parseMarkup(qrSvg(text, 0, 0, plan.size, 'black')!).d, units, 2);
    for (let row = -QR_QUIET_ZONE; row < plan.modules + QR_QUIET_ZONE; row++) {
      for (let col = -QR_QUIET_ZONE; col < plan.modules + QR_QUIET_ZONE; col++) {
        const inside = row >= 0 && col >= 0 && row < plan.modules && col < plan.modules;
        const offset = (((row + QR_QUIET_ZONE) * 2 + 1) * side + (col + QR_QUIET_ZONE) * 2 + 1) * 4;
        expect(pixels[offset] === 0, `${row},${col}`).toBe(inside && code.isDark(row, col));
      }
    }
  });

  it('is one <g> with one crisp path that spans exactly (x, y) to (x + size, y + size)', () => {
    const text = urlOfLength(500, 3);
    const plan = qrPlan(text)!;
    const markup = qrSvg(text, 1180.5, 1610.25, plan.size, '#2f3b2f')!;
    const { x, y, scale, fill, d } = parseMarkup(markup);
    expect([x, y, fill]).toEqual([1180.5, 1610.25, '#2f3b2f']);
    expect(scale * (plan.modules + 2 * QR_QUIET_ZONE)).toBeCloseTo(plan.size, 3);
    expect(markup.match(/<path/g)).toHaveLength(1);
    const rectangles = pathRectangles(d);
    expect(Math.min(...rectangles.map((r) => r[0]))).toBe(QR_QUIET_ZONE);
    expect(Math.min(...rectangles.map((r) => r[1]))).toBe(QR_QUIET_ZONE);
    expect(Math.max(...rectangles.map((r) => r[2]))).toBe(QR_QUIET_ZONE + plan.modules);
    expect(Math.max(...rectangles.map((r) => r[3]))).toBe(QR_QUIET_ZONE + plan.modules);
    expect(rectangles.every((r) => r[3] - r[1] === 1 && Number.isInteger(r[0]) && r[2] > r[0])).toBe(true);
  });

  it('is deterministic and escapes the color', () => {
    const text = urlOfLength(200, 8);
    expect(qrSvg(text, 0, 0, 60, 'red')).toBe(qrSvg(text, 0, 0, 60, 'red'));
    expect(qrSvg(text, 0, 0, 60, '"/><script>')).toContain('fill="&#34;/&#62;&#60;script&#62;"');
  });

  it('returns null whenever qrPlan does', () => {
    expect(qrSvg(urlOfLength(QR_MAX_BYTES + 1), 0, 0, 60, 'black')).toBeNull();
    expect(qrSvg(`${SITE}#Inés`, 0, 0, 60, 'black')).toBeNull();
  });
});
