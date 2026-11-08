import { DEFAULT_STYLE, isLayoutId, isOrientation, isPageSizeId, isThemeId, type Style } from '../style';

/** Codec version param, written first and checked before anything else is decoded. */
export const VERSION_PARAM = 'v';
/** Tree payload param, written last so the readable style params stay easy to hand-edit. */
export const DATA_PARAM = 'd';

interface ParamCodec<T> {
  key: string;
  /** Names the setting in warnings. */
  label: string;
  format(value: T): string;
  /** The value of a trimmed raw param, or undefined when it is not valid. */
  parse(raw: string): T | undefined;
}

function flag(key: string, label: string): ParamCodec<boolean> {
  return {
    key,
    label,
    format: (on) => (on ? '1' : '0'),
    parse: (raw) => (raw === '1' ? true : raw === '0' ? false : undefined),
  };
}

function choice<T extends string>(key: string, label: string, isValid: (value: unknown) => value is T): ParamCodec<T> {
  return {
    key,
    label,
    format: (value) => value,
    parse: (raw) => {
      const value = raw.toLowerCase();
      return isValid(value) ? value : undefined;
    },
  };
}

/** A choice whose null means "auto": omitted by encode() (the v1 default), also accepted spelled `auto`. */
function autoChoice<T extends string>(key: string, label: string, isValid: (value: unknown) => value is T): ParamCodec<T | null> {
  const inner = choice(key, label, isValid);
  return {
    key,
    label,
    format: (value) => value ?? 'auto',
    parse: (raw) => (raw.toLowerCase() === 'auto' ? null : inner.parse(raw)),
  };
}

/** Codec v1 style params. Keys and value spellings are part of the link format: never change them for v1. */
const STYLE_PARAMS: { readonly [K in keyof Style]: ParamCodec<Style[K]> } = {
  layout: autoChoice('l', 'layout', isLayoutId),
  theme: choice('t', 'theme', isThemeId),
  dates: flag('dates', 'dates setting'),
  traits: flag('traits', 'traits setting'),
  living: flag('living', 'living setting'),
  qr: flag('qr', 'QR setting'),
  size: choice('size', 'page size', isPageSizeId),
  orientation: autoChoice('o', 'orientation', isOrientation),
};

/** URL order of the style params, between `v` and `d`. */
const STYLE_FIELDS: readonly (keyof Style)[] = ['layout', 'theme', 'dates', 'traits', 'living', 'qr', 'size', 'orientation'];

const KNOWN_KEYS: ReadonlySet<string> = new Set([VERSION_PARAM, DATA_PARAM, ...STYLE_FIELDS.map((field) => STYLE_PARAMS[field].key)]);

const MAX_QUOTED = 40;

function quote(text: string): string {
  return JSON.stringify(text.length > MAX_QUOTED ? `${text.slice(0, MAX_QUOTED)}…` : text);
}

function safeDecodeURIComponent(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Splits a URL fragment into params with URLSearchParams (which also undoes
 * percent-encoding). Accepts the fragment with or without its `#`, or a whole
 * URL, and tolerates what links pick up in transit: surrounding whitespace, a
 * fragment percent-encoded as a whole, and HTML-escaped `&amp;` separators.
 * Keys and values are trimmed; when a key repeats, the last value wins.
 */
export function parseFragment(fragment: string): Map<string, string> {
  let text = fragment.trim();
  const hash = text.indexOf('#');
  if (hash >= 0) text = text.slice(hash + 1);
  text = text.replace(/&amp;/gi, '&');
  if (!text.includes('=') && /%3d/i.test(text)) text = safeDecodeURIComponent(text);
  const params = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(text)) {
    const name = key.trim();
    if (name) params.set(name, value.trim());
  }
  return params;
}

function formatField<K extends keyof Style>(field: K, style: Style): [string, string] | null {
  const value = style[field];
  if (value === DEFAULT_STYLE[field]) return null;
  const param: ParamCodec<Style[K]> = STYLE_PARAMS[field];
  return [param.key, param.format(value)];
}

/** The style as v1 params in URL order, omitting every value equal to DEFAULT_STYLE (a v1 decoder reads a missing param as its default). */
export function styleToParams(style: Style): [string, string][] {
  return STYLE_FIELDS.map((field) => formatField(field, style)).filter((entry) => entry !== null);
}

function readField<K extends keyof Style>(field: K, params: ReadonlyMap<string, string>, style: Style, warnings: string[]): void {
  const param: ParamCodec<Style[K]> = STYLE_PARAMS[field];
  const raw = params.get(param.key);
  if (raw === undefined) return;
  const value = param.parse(raw);
  if (value === undefined) warnings.push(`Ignored the link's ${param.label} ${quote(raw)}; using the default.`);
  else style[field] = value;
}

/**
 * The style from v1 params: a missing param takes its DEFAULT_STYLE value, an
 * invalid one takes it too plus a warning, and every unknown param adds a
 * warning. Never throws. Enum values are case-insensitive.
 */
export function styleFromParams(params: ReadonlyMap<string, string>): { style: Style; warnings: string[] } {
  const style: Style = { ...DEFAULT_STYLE };
  const warnings: string[] = [];
  for (const field of STYLE_FIELDS) readField(field, params, style, warnings);
  for (const key of params.keys()) {
    if (!KNOWN_KEYS.has(key)) warnings.push(`Ignored the unknown link setting ${quote(key)}.`);
  }
  return { style, warnings };
}
