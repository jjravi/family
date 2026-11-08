import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FONT_FACES, FONT_FAMILIES, fontStack } from '../../src/themes/fonts';

const fontsDir = new URL('../../src/themes/fonts/', import.meta.url);
const { playfair, greatVibes } = FONT_FAMILIES;

const ROOT = '<svg xmlns="http://www.w3.org/2000/svg" width="18in" height="24in" viewBox="0 0 1296 1728">';
const POSTER = `${ROOT}<rect width="1296" height="1728" fill="#f6efe2"/><text font-family="${fontStack(playfair)}">Rose Kim</text><text font-family="${fontStack(greatVibes)}" font-style="italic">The Kim &amp; Ruiz Family</text></svg>`;

/** fetch() for the vitest asset URLs (`/src/themes/fonts/<file>`), served from disk. */
function diskFetch(failing: ReadonlySet<string> = new Set()) {
  return vi.fn(async (url: string) => {
    const file = url.replace('/src/themes/fonts/', '');
    if (failing.has(file)) return new Response('missing', { status: 404 });
    return new Response(readFileSync(new URL(file, fontsDir)));
  });
}

async function freshSvgModule() {
  vi.resetModules();
  return import('../../src/export/svg');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('inlineFonts', () => {
  it('embeds the used faces as base64 data URLs in <defs><style> right after the root tag', async () => {
    const fetch = diskFetch();
    vi.stubGlobal('fetch', fetch);
    const { inlineFonts } = await freshSvgModule();
    const out = await inlineFonts(POSTER);

    expect(out.startsWith(`${ROOT}<defs><style>@font-face {`)).toBe(true);
    expect(out.endsWith(POSTER.slice(ROOT.length))).toBe(true);
    const sources = [...out.matchAll(/url\("data:font\/woff2;base64,([^"]+)"\)/g)].map((m) => m[1]!);
    const files = ['playfair-display-latin-500-normal.woff2', 'playfair-display-latin-400-italic.woff2', 'great-vibes-latin-400-normal.woff2'];
    const expected = FONT_FACES.filter((f) => files.includes(f.file));
    expect(expected).toHaveLength(3);
    expect(sources).toHaveLength(expected.length);
    expected.forEach((face, i) => {
      expect(Buffer.from(sources[i]!, 'base64').equals(readFileSync(new URL(face.file, fontsDir))), face.file).toBe(true);
    });
    expect(out).not.toContain('/src/themes/fonts/');
    expect(fetch).toHaveBeenCalledTimes(expected.length);
  });

  it('fetches each font file once per page', async () => {
    const fetch = diskFetch();
    vi.stubGlobal('fetch', fetch);
    const { inlineFonts } = await freshSvgModule();
    await inlineFonts(POSTER);
    await inlineFonts(POSTER);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('rejects when a font cannot be fetched, and retries next time', async () => {
    vi.stubGlobal('fetch', diskFetch(new Set(['great-vibes-latin-400-normal.woff2'])));
    const { inlineFonts } = await freshSvgModule();
    await expect(inlineFonts(POSTER)).rejects.toThrow(/great-vibes-latin-400-normal\.woff2.*404/);
    vi.stubGlobal('fetch', diskFetch());
    await expect(inlineFonts(POSTER)).resolves.toContain('data:font/woff2;base64,');
  });

  it('returns the SVG unchanged when it uses no bundled font', async () => {
    const fetch = diskFetch();
    vi.stubGlobal('fetch', fetch);
    const { inlineFonts } = await freshSvgModule();
    const plain = `${ROOT}<rect width="10" height="10"/></svg>`;
    expect(await inlineFonts(plain)).toBe(plain);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('exportSvg', () => {
  it('returns an image/svg+xml Blob of the inlined SVG', async () => {
    vi.stubGlobal('fetch', diskFetch());
    const { exportSvg, inlineFonts } = await freshSvgModule();
    const blob = await exportSvg(POSTER);
    expect(blob.type).toBe('image/svg+xml');
    expect(await blob.text()).toBe(await inlineFonts(POSTER));
  });
});
