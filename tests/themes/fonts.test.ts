import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LAYOUT_IDS, THEME_IDS } from '../../src/style';
import { resolveTheme } from '../../src/themes';
import { FONT_FACES, FONT_FAMILIES, fontFaceCss, fontStack, loadFonts } from '../../src/themes/fonts';
import type { Face } from '../../src/themes/schema';

const fontsDir = new URL('../../src/themes/fonts/', import.meta.url);

/** Every family|weight|style a theme can draw in any layout. */
function drawnFaces(): Set<string> {
  const keys = new Set<string>();
  const add = (face: Face) => keys.add(`${face.family}|${face.weight}|${face.style}`);
  for (const id of THEME_IDS) {
    for (const layout of LAYOUT_IDS) {
      const { type, ornaments } = resolveTheme(id, layout);
      for (const face of [type.display, type.coupleTitle, type.name, type.focusName, type.dates, type.trait]) add(face);
      // The ampersand between partners is set in the couple face, always italic.
      if (ornaments.join === 'ampersand') add({ ...type.coupleTitle, style: 'italic' });
    }
  }
  return keys;
}

describe('FONT_FACES', () => {
  it('resolves every asset import to a URL string (the source path under vitest)', () => {
    expect(FONT_FACES).toHaveLength(22);
    for (const face of FONT_FACES) {
      expect(typeof face.url).toBe('string');
      expect(face.url).toBe(`/src/themes/fonts/${face.file}`);
    }
  });

  it('points at real woff2 files', () => {
    for (const face of FONT_FACES) {
      const bytes = readFileSync(new URL(face.file, fontsDir));
      expect(bytes.subarray(0, 4).toString('latin1'), face.file).toBe('wOF2');
    }
  });

  it('bundles exactly the faces the themes draw, each in latin and latin-ext', () => {
    const keys = FONT_FACES.map((f) => `${f.family}|${f.weight}|${f.style}|${f.subset}`);
    expect(new Set(keys).size).toBe(keys.length);
    const drawn = drawnFaces();
    expect(new Set(FONT_FACES.map((f) => `${f.family}|${f.weight}|${f.style}`))).toEqual(drawn);
    for (const face of drawn) {
      for (const subset of ['latin', 'latin-ext']) expect(keys).toContain(`${face}|${subset}`);
    }
  });

  it('ships static instances only, and no font file the registry does not list', () => {
    for (const face of FONT_FACES) expect(face.file).toMatch(new RegExp(`-${face.subset}-${face.weight}-${face.style}\\.woff2$`));
    const files = readdirSync(fontsDir).filter((file) => file.endsWith('.woff2'));
    expect(files.sort()).toEqual(FONT_FACES.map((f) => f.file).sort());
  });

  it('ships an OFL license text for every family', () => {
    for (const name of ['PlayfairDisplay', 'SourceSans3', 'CormorantGaramond', 'GreatVibes', 'Jost']) {
      const file = new URL(`OFL-${name}.txt`, fontsDir);
      expect(existsSync(file), name).toBe(true);
      expect(readFileSync(file, 'utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1');
    }
  });
});

describe('fontFaceCss', () => {
  it('emits one @font-face per face with its URL and unicode-range', () => {
    const css = fontFaceCss();
    expect(css.match(/@font-face/g)).toHaveLength(FONT_FACES.length);
    for (const face of FONT_FACES) expect(css).toContain(`src: url("${face.url}") format('woff2');`);
    expect(css).toContain("font-family: 'Great Vibes';");
    expect(css).toContain('font-weight: 600;');
    expect(css).not.toMatch(/font-weight: \d+ \d+;/);
    expect(css).toContain('unicode-range: U+0000-00FF,');
    expect(css).not.toMatch(/[<&]/);
  });

  it('lets the caller substitute URLs (e.g. base64 data URLs)', () => {
    const css = fontFaceCss((face) => `data:font/woff2;base64,${face.file}`);
    expect(css).toContain('url("data:font/woff2;base64,jost-latin-300-normal.woff2")');
    expect(css).not.toContain('/src/themes/fonts/');
  });
});

describe('fontStack and loadFonts', () => {
  it('adds a generic fallback', () => {
    expect(fontStack(FONT_FAMILIES.playfair)).toBe("'Playfair Display', serif");
    expect(fontStack(FONT_FAMILIES.greatVibes)).toBe("'Great Vibes', cursive");
  });

  it('is a no-op without a DOM', async () => {
    await expect(loadFonts()).resolves.toBeUndefined();
  });
});
