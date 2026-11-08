import { DATA_PARAM, VERSION_PARAM, parseFragment, styleFromParams } from './params';
import { decodePayload } from './payload';
import { CODEC_VERSION, type DecodeResult } from './types';

type Params = ReadonlyMap<string, string>;
type VersionDecoder = (params: Params) => Promise<DecodeResult>;

async function decodeV1(params: Params): Promise<DecodeResult> {
  const { style, warnings } = styleFromParams(params);
  const payload = params.get(DATA_PARAM) ?? '';
  if (payload === '') return { status: 'empty', style };
  const result = await decodePayload(payload);
  if (!result.ok) return { status: 'error', reason: 'corrupt', message: result.message, dsl: result.partial, style };
  return { status: 'ok', dsl: result.dsl, style, warnings };
}

/** One decoder per released codec version, kept forever: framed prints carry old links for years. */
const DECODERS: ReadonlyMap<number, VersionDecoder> = new Map([[1, decodeV1]]);

function versionMessage(version: string | undefined, recovered: boolean): string {
  const what =
    version === undefined
      ? 'This link has no version number (v=)'
      : /^\d+$/.test(version) && Number(version) > CODEC_VERSION
        ? `This link was made by a newer version of Family Tree (link version ${version})`
        : `This link has an unknown version (v=${JSON.stringify(version.slice(0, 20))})`;
  return recovered ? `${what}; its tree text is shown but may not draw as intended.` : `${what}, so its tree could not be read.`;
}

/** Missing or unknown `v`: best effort with the v1 rules, so a readable tree still reaches the editor. */
async function decodeUnsupported(params: Params, version: string | undefined): Promise<DecodeResult> {
  const { style } = styleFromParams(params);
  const payload = params.get(DATA_PARAM) ?? '';
  if (version === undefined && payload === '') return { status: 'empty', style };
  const recovered = payload === '' ? null : await decodePayload(payload);
  const dsl = recovered?.ok ? recovered.dsl : null;
  return { status: 'error', reason: 'unsupported-version', message: versionMessage(version, dsl !== null), dsl, style };
}

/**
 * Decodes a URL fragment, with or without its leading `#` (parsed with
 * URLSearchParams; a whole URL also works). Checks `v` before touching `d` and
 * dispatches to the decoder for that version; a decoder is kept for every
 * version ever released. Never rejects: failures are `{ status: 'error' }`,
 * and invalid or unknown params fall back to DEFAULT_STYLE values with a
 * warning each. Tolerates percent-encoding, stray whitespace, and `&amp;` from
 * mangled links. See DecodeResult for the outcomes:
 * - no `d` (or an empty one): `empty`, with the style from any params given;
 * - missing or unknown `v`: `unsupported-version`, with `dsl` set when the
 *   payload still reads as v1 text;
 * - bad base64url, inflate failure, or invalid UTF-8: `corrupt`, with `dsl`
 *   set to whatever text survived.
 * A frozen v1 URL fixture (tests/codec) must keep decoding in every future version.
 */
export async function decode(fragment: string): Promise<DecodeResult> {
  const params = parseFragment(fragment);
  const version = params.get(VERSION_PARAM);
  const decoder = version !== undefined && /^\d+$/.test(version) ? DECODERS.get(Number(version)) : undefined;
  return decoder ? decoder(params) : decodeUnsupported(params, version);
}
