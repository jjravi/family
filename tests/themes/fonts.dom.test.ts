// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

async function freshFontsModule() {
  vi.resetModules();
  return import('../../src/themes/fonts');
}

afterEach(() => {
  document.head.innerHTML = '';
  Reflect.deleteProperty(document, 'fonts');
});

describe('loadFonts in a DOM', () => {
  it('injects the @font-face rules once, even without document.fonts', async () => {
    const { loadFonts, FONT_FACES } = await freshFontsModule();
    await loadFonts();
    await loadFonts();
    const styles = document.querySelectorAll('style#family-tree-fonts');
    expect(styles).toHaveLength(1);
    expect(styles[0]!.textContent!.match(/@font-face/g)).toHaveLength(FONT_FACES.length);
  });

  it('loads every face with a sample from its subset, then awaits fonts.ready', async () => {
    const load = vi.fn(async () => []);
    let ready = false;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load, ready: Promise.resolve().then(() => (ready = true)) },
    });
    const { loadFonts, FONT_FACES } = await freshFontsModule();
    await loadFonts();
    expect(ready).toBe(true);
    expect(load).toHaveBeenCalledTimes(FONT_FACES.length);
    expect(load).toHaveBeenCalledWith("italic 400 16px 'Playfair Display'", 'A');
    expect(load).toHaveBeenCalledWith("normal 400 16px 'Source Sans 3'", '\u0100');
    expect(load).toHaveBeenCalledWith("normal 600 16px 'Cormorant Garamond'", 'A');
  });

  it('resolves when a face fails to load', async () => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: vi.fn(async () => Promise.reject(new Error('offline'))), ready: Promise.resolve() },
    });
    const { loadFonts } = await freshFontsModule();
    await expect(loadFonts()).resolves.toBeUndefined();
  });
});
