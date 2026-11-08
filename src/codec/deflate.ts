export interface InflateResult {
  /** Everything inflated before the stream ended or failed. */
  bytes: Uint8Array<ArrayBuffer>;
  /**
   * Null when the stream inflated completely; `invalid` for bad, truncated, or
   * trailing data; `too-large` when the output passed the byte limit.
   */
  error: 'invalid' | 'too-large' | null;
}

/** Raw DEFLATE (RFC 1951, no zlib or gzip header) through the native CompressionStream. */
export async function deflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const result = await pump(bytes, new CompressionStream('deflate-raw'), Number.POSITIVE_INFINITY);
  if (result.error) throw new Error('deflate-raw compression failed');
  return result.bytes;
}

/**
 * Inflates raw DEFLATE through the native DecompressionStream. Never rejects:
 * failures come back as `error`, with whatever was inflated before them (a
 * link cut short in transit still yields the start of its text). Stops once
 * the output exceeds `maxBytes`, so a tiny payload cannot inflate into
 * gigabytes.
 */
export async function inflateRaw(bytes: Uint8Array<ArrayBuffer>, maxBytes: number): Promise<InflateResult> {
  const result = await pump(bytes, new DecompressionStream('deflate-raw'), maxBytes);
  if (result.error !== null || bytes.length === 0) return result;
  // Some runtimes (Node 22, older browsers) ignore data after the end of the stream. A
  // complete stream needs its last byte, so if the input inflates without it, that byte is junk.
  const shorter = await pump(bytes.subarray(0, -1), new DecompressionStream('deflate-raw'), maxBytes);
  return shorter.error === null ? { bytes: result.bytes, error: 'invalid' } : result;
}

async function pump(
  input: Uint8Array<ArrayBuffer>,
  transform: CompressionStream | DecompressionStream,
  maxBytes: number,
): Promise<InflateResult> {
  const writer = transform.writable.getWriter();
  // Errors surface on the readable side; the writer's promises only need handling.
  writer
    .write(input)
    .then(() => writer.close())
    .catch(() => {});
  const reader = transform.readable.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return { bytes: concat(chunks, length), error: null };
      chunks.push(value);
      length += value.length;
      if (length > maxBytes) {
        reader.cancel().catch(() => {});
        return { bytes: concat(chunks, length), error: 'too-large' };
      }
    }
  } catch {
    return { bytes: concat(chunks, length), error: 'invalid' };
  }
}

function concat(chunks: readonly Uint8Array[], length: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
