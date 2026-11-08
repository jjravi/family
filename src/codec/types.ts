import type { Style } from '../style';

/** Version written as `v=` by encode(). Old versions keep decoding forever: printed QR codes carry them for years. */
export const CODEC_VERSION = 1;

/**
 * Outcome of decoding a URL fragment. `style` is always usable: params that are
 * missing take DEFAULT_STYLE values.
 * - `empty`: no tree in the URL (no `d` param); the UI loads the sample.
 * - `ok`: `warnings` lists ignored or invalid style params (the defaults were used).
 * - `error`: `unsupported-version` (missing, unknown, or future `v`) or `corrupt`
 *   (bad base64url, inflate failure, invalid UTF-8). `dsl` is the best-effort
 *   recovered text, or null; `message` is one line for the user.
 */
export type DecodeResult =
  | { status: 'empty'; style: Style }
  | { status: 'ok'; dsl: string; style: Style; warnings: string[] }
  | {
      status: 'error';
      reason: 'unsupported-version' | 'corrupt';
      message: string;
      dsl: string | null;
      style: Style;
    };
