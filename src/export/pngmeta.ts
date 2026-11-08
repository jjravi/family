const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const METERS_PER_INCH = 0.0254;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (ISO 3309, as PNG uses it) of `bytes[start, end)`. */
export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

/** The pHYs chunk for `dpi`, in pixels per meter as PNG requires (300 DPI = 11811). */
function physChunk(dpi: number): Uint8Array {
  const data = new Uint8Array(9);
  const view = new DataView(data.buffer);
  const perMeter = Math.round(dpi / METERS_PER_INCH);
  view.setUint32(0, perMeter);
  view.setUint32(4, perMeter);
  data[8] = 1;
  return chunk('pHYs', data);
}

/**
 * `png` with a pHYs chunk declaring `dpi`, so print software opens it at its
 * physical size. The chunk goes right after IHDR (it must precede IDAT); an
 * existing pHYs is dropped. Throws when `png` is not a well-formed PNG.
 */
export function withPngDpi(png: Uint8Array, dpi: number): Uint8Array<ArrayBuffer> {
  if (png.length < 8 || SIGNATURE.some((byte, i) => png[i] !== byte)) throw new Error('Not a PNG file.');
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const kept: Uint8Array[] = [];
  let offset = 8;
  while (offset < png.length) {
    if (offset + 12 > png.length) throw new Error('Truncated PNG chunk.');
    const end = offset + 12 + view.getUint32(offset);
    if (end > png.length) throw new Error('Truncated PNG chunk.');
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    if (offset === 8 && type !== 'IHDR') throw new Error('PNG does not start with IHDR.');
    if (type === 'IHDR') kept.push(png.subarray(offset, end), physChunk(dpi));
    else if (type !== 'pHYs') kept.push(png.subarray(offset, end));
    offset = end;
  }
  const out = new Uint8Array(8 + kept.reduce((sum, part) => sum + part.length, 0));
  out.set(SIGNATURE);
  let position = 8;
  for (const part of kept) {
    out.set(part, position);
    position += part.length;
  }
  return out;
}
