import type { FontFaceEntry } from '../themes/fonts';
import { embeddedFontCss, facesForSvg } from './fontembed';
import { insertIntoRoot } from './markup';

const dataUrls = new Map<string, Promise<string>>();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function fetchDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load the font file ${url} (HTTP ${response.status}).`);
  return `data:font/woff2;base64,${toBase64(new Uint8Array(await response.arrayBuffer()))}`;
}

/** The face's file as a base64 data URL; fetched once per page, retried after a failure. */
function fontDataUrl(face: FontFaceEntry): Promise<string> {
  let pending = dataUrls.get(face.url);
  if (!pending) {
    pending = fetchDataUrl(face.url);
    pending.catch(() => dataUrls.delete(face.url));
    dataUrls.set(face.url, pending);
  }
  return pending;
}

/**
 * Returns `svg` with the bundled fonts it uses embedded: `<defs><style>` right
 * after the root `<svg ...>` start tag, holding fontFaceCss() rules whose src
 * is a `data:font/woff2;base64,...` URL of that face's bytes (fetched from
 * FontFaceEntry.url: same-origin, and offline through the service worker).
 * Embeds only what the SVG needs (see facesForSvg: the families named in its
 * font declarations, italic faces when it uses italic, and the unicode subsets
 * of its characters); returns `svg` unchanged when it names no bundled family.
 * Required for SVG download and for PNG export, because an SVG drawn through an
 * `<img>` cannot use the page's fonts. Rejects when a font file cannot be
 * fetched. Browser only.
 */
export async function inlineFonts(svg: string): Promise<string> {
  const faces = facesForSvg(svg);
  if (faces.length === 0) return svg;
  const urls = new Map(await Promise.all(faces.map(async (face) => [face, await fontDataUrl(face)] as const)));
  return insertIntoRoot(svg, `<defs><style>${embeddedFontCss(faces, (face) => urls.get(face)!)}</style></defs>`);
}

/** The poster as a standalone `image/svg+xml` Blob with fonts inlined, ready for downloadBlob(). Browser only. */
export async function exportSvg(svg: string): Promise<Blob> {
  return new Blob([await inlineFonts(svg)], { type: 'image/svg+xml' });
}
