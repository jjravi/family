import type { Style } from '../style';
import { DATA_PARAM, VERSION_PARAM, styleToParams } from './params';
import { encodePayload } from './payload';
import { CODEC_VERSION } from './types';

/**
 * Builds the URL fragment, WITHOUT the leading `#`, for a DSL text and style:
 * `v=1`, then one readable param per non-default style field (`l`, `t`,
 * `dates`, `traits`, `living`, `qr`, `size`, `o`, in that order), then
 * `d=<payload>` last, where payload = base64url, no padding (RFC 4648 §5), of
 * deflate-raw (CompressionStream) of the UTF-8 DSL. For example
 * `v=1&t=botanical&traits=1&d=q1ZKLs0r...`. Params equal to DEFAULT_STYLE are
 * omitted (frozen for v1, so omission is stable and keeps links short for the
 * QR budget). The DSL is encoded exactly as given (comments and formatting
 * included). Deterministic within a runtime: the same input always yields the
 * same string (other zlib builds may compress differently, and every result
 * decodes the same).
 *
 * Contract: for well-formed Unicode `dsl` and a valid `style`,
 * `decode(encode(dsl, style))` resolves to `{ status: 'ok' }` with the
 * identical `dsl` and `style` and no warnings.
 */
export async function encode(dsl: string, style: Style): Promise<string> {
  const params = new URLSearchParams([[VERSION_PARAM, String(CODEC_VERSION)], ...styleToParams(style)]);
  params.append(DATA_PARAM, await encodePayload(dsl));
  return params.toString();
}
