import { LAYOUT_IDS, ORIENTATIONS, PAGE_SIZE_IDS, THEME_IDS, type Style } from '../../src/style';

export type Random = () => number;

/** Mulberry32: a tiny seeded PRNG, so a failing case reproduces from its seed. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(random: Random, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

const PIECES = [
  // DSL-shaped ASCII
  'Rose Kim', ' 1932-2019', ' "kind, passionate"', ' + ', ' -> ', ', ', '  # comment', 'focus: ', 'title: ', '?', '@2', 'c1927',
  // whitespace and line endings
  '\n', '\r\n', '\t', '   ', '\r',
  // accents, precomposed and combining
  'Inés Vega', 'José Ñúñez', 'Zoë', 'Ångström', 'e\u0301', 'n\u0303', 'Đặng Thị Ngọc', 'Łukasz Żółć', 'a\u0308\u0332',
  // CJK and Hangul
  '王秀英', '李', '山田太郎', '김민준',
  // emoji: astral, ZWJ sequences, flags, skin tones, variation selectors
  '🌳', '👨‍👩‍👧‍👦', '🇰🇷', '👍🏽', '❤️',
  // right-to-left, with direction marks
  'عائشة', 'שרה', '\u200f', '\u202e',
  // curly quotes from chatbots
  '“warm, Godly”', '‘', '’',
  // characters with meaning in URLs, HTML, or codecs
  '&', '=', '%', '#', '+', '/', '\\', '<svg>', '%3D', '&amp;',
  // edge code points
  '\u0000', '\ufeff', '\ufffd', '\uffff', '\u{10ffff}',
];

/** A random well-formed code point (no lone surrogates) from a mix of scripts and planes. */
function randomCodePoint(random: Random): string {
  const ranges: readonly [number, number][] = [
    [0x20, 0x7e],
    [0xa0, 0x24f],
    [0x300, 0x36f],
    [0x590, 0x6ff],
    [0x2000, 0x2bff],
    [0x4e00, 0x9fff],
    [0xac00, 0xd7a3],
    [0xe000, 0xfffd],
    [0x1f300, 0x1faff],
    [0x10000, 0x10ffff],
  ];
  const [low, high] = pick(random, ranges);
  return String.fromCodePoint(low + Math.floor(random() * (high - low + 1)));
}

/** Random DSL-ish text of up to roughly `maxPieces` pieces; sometimes empty, sometimes BOM-prefixed. */
export function randomDsl(random: Random, maxPieces: number): string {
  const count = Math.floor(random() * (maxPieces + 1));
  let text = random() < 0.05 ? '\ufeff' : '';
  for (let i = 0; i < count; i++) text += random() < 0.7 ? pick(random, PIECES) : randomCodePoint(random);
  return text;
}

export function randomStyle(random: Random): Style {
  return {
    layout: pick(random, [null, ...LAYOUT_IDS]),
    theme: pick(random, THEME_IDS),
    dates: random() < 0.5,
    traits: random() < 0.5,
    living: random() < 0.5,
    qr: random() < 0.5,
    size: pick(random, PAGE_SIZE_IDS),
    orientation: pick(random, [null, ...ORIENTATIONS]),
  };
}
