import type { PageGeometry } from '../style';
import { setRootAttributes } from './markup';
import { withPngDpi } from './pngmeta';
import { inlineFonts } from './svg';

export interface PngExport {
  /** `image/png`, with a pHYs chunk declaring `dpi`. */
  blob: Blob;
  /** Pixel width. */
  width: number;
  /** Pixel height. */
  height: number;
  /** DPI actually used (lower than requested after a fallback). */
  dpi: number;
}

/** Tried in order after the requested DPI fails, skipping any at or above it. */
const FALLBACK_DPI = [240, 200, 150, 120, 96, 72];
/** Largest canvas side and area current browsers allow; bigger canvases are not even attempted. */
const MAX_CANVAS_SIDE = 32_767;
const MAX_CANVAS_AREA = 268_435_456;
/** A frame, or this long when frames are throttled (background tab). */
const FRAME_TIMEOUT_MS = 100;

/** Pixel size of the page at `dpi`: 18x24 portrait at 300 DPI is 5400 × 7200. */
export function pngSize(page: PageGeometry, dpi: number): { width: number; height: number } {
  return { width: Math.round((page.width / 72) * dpi), height: Math.round((page.height / 72) * dpi) };
}

/** The DPIs to try for a request: the request, then lower FALLBACK_DPI steps. */
export function dpiAttempts(dpi: number): number[] {
  return [dpi, ...FALLBACK_DPI.filter((step) => step < dpi)];
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    const timer: ReturnType<typeof setTimeout> = setTimeout(resolve, FRAME_TIMEOUT_MS);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function loadImage(svg: string): Promise<{ image: HTMLImageElement; release: () => void }> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  return { image, release: () => URL.revokeObjectURL(url) };
}

/** Draws `image` onto a white canvas of the given size and encodes it; null when the browser cannot make a canvas that big. */
async function rasterize(image: HTMLImageElement, width: number, height: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  try {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const draw = () => {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
    };
    draw();
    // Fonts embedded in an SVG image can finish loading after decode(); the second draw picks them up.
    await nextFrame();
    draw();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } catch {
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Rasterizes the poster to PNG. Pixel size = page size in inches × dpi, so
 * 18x24 portrait at the default 300 DPI is 5400 × 7200. Inlines fonts first,
 * draws the SVG through an `<img>` onto a white canvas, encodes with
 * `canvas.toBlob`, and adds a pHYs chunk so the file carries its DPI. When the
 * browser cannot make a canvas that large (toBlob yields null or throws), it
 * retries at lower DPI steps (240, 200, 150, 120, 96, 72) and reports the DPI
 * used. Rejects when fonts cannot be fetched, the SVG does not load as an
 * image, or every step fails. Browser only.
 */
export async function exportPng(svg: string, page: PageGeometry, dpi = 300): Promise<PngExport> {
  const inlined = await inlineFonts(svg);
  for (const attempt of dpiAttempts(dpi)) {
    const { width, height } = pngSize(page, attempt);
    if (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE || width * height > MAX_CANVAS_AREA) continue;
    // The image's own size matches the canvas, so every browser rasterizes the vectors at full resolution.
    const sized = setRootAttributes(inlined, { width: String(width), height: String(height), preserveAspectRatio: 'none' });
    const { image, release } = await loadImage(sized);
    try {
      const blob = await rasterize(image, width, height);
      if (!blob) continue;
      const png = withPngDpi(new Uint8Array(await blob.arrayBuffer()), attempt);
      return { blob: new Blob([png], { type: 'image/png' }), width, height, dpi: attempt };
    } finally {
      release();
    }
  }
  throw new Error(`This browser cannot create a canvas large enough for a PNG of this poster, even at ${dpiAttempts(dpi).at(-1)} DPI.`);
}
