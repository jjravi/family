// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { preparePrint, printPoster } from '../../src/export/print';
import { pageGeometry } from '../../src/style';

const POSTER =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18in" height="24in" viewBox="0 0 1296 1728" aria-labelledby="title">' +
  '<title id="title">The Kim &amp; Ruiz Family</title><path id="arc" d="M0 0h10"/><text><textPath href="#arc">Rose</textPath></text></svg>';

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('preparePrint', () => {
  it('keeps a copy of the poster in #print-root, sized to the page, with an @page rule', () => {
    document.body.innerHTML = '<div id="app"><svg><path id="arc"/></svg></div>';
    preparePrint(POSTER, pageGeometry('18x24', 'portrait'));

    const root = document.getElementById('print-root')!;
    expect(root.parentElement).toBe(document.body);
    expect([root.style.width, root.style.height]).toEqual(['18in', '24in']);
    const svg = root.querySelector('svg')!;
    expect([svg.getAttribute('width'), svg.getAttribute('height')]).toEqual(['18in', '24in']);
    expect(svg.getAttribute('aria-labelledby')).toBe('print-title');
    expect(root.querySelector('textPath')!.getAttribute('href')).toBe('#print-arc');
    expect(document.querySelectorAll('[id="arc"]')).toHaveLength(1);
    expect(document.getElementById('print-page')!.textContent).toBe('@page { size: 18in 24in; margin: 0; }');
    expect(document.getElementById('print-page')!.parentElement).toBe(document.head);
  });

  it('replaces the copy and the page size on every call', () => {
    preparePrint(POSTER, pageGeometry('18x24', 'portrait'));
    preparePrint(POSTER.replace('Rose', 'Mary'), pageGeometry('a3', 'landscape'));
    expect(document.querySelectorAll('#print-root')).toHaveLength(1);
    expect(document.querySelectorAll('#print-page')).toHaveLength(1);
    const root = document.getElementById('print-root')!;
    expect(root.textContent).toContain('Mary');
    expect(root.textContent).not.toContain('Rose');
    expect([root.style.width, root.style.height]).toEqual(['420mm', '297mm']);
    expect(document.getElementById('print-page')!.textContent).toBe('@page { size: 420mm 297mm; margin: 0; }');
  });

  it('moves #print-root back under <body> if the UI re-rendered it elsewhere', () => {
    preparePrint(POSTER, pageGeometry('8x10', 'portrait'));
    const app = document.createElement('main');
    document.body.append(app);
    app.append(document.getElementById('print-root')!);
    preparePrint(POSTER, pageGeometry('8x10', 'portrait'));
    expect(document.getElementById('print-root')!.parentElement).toBe(document.body);
  });
});

describe('printPoster', () => {
  it('prepares the print copy, then opens the print dialog', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      expect(document.getElementById('print-page')!.textContent).toContain('24in 18in');
    });
    printPoster(POSTER, pageGeometry('18x24', 'landscape'));
    expect(print).toHaveBeenCalledTimes(1);
  });
});

describe('print.css', () => {
  // Not new URL(path, import.meta.url): under jsdom, Vite rewrites that into an http:// asset URL.
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/export/print.css'), 'utf8');
  const printBlock = css.slice(css.indexOf('@media print'));

  it('hides the print copy on screen', () => {
    expect(css.slice(0, css.indexOf('@media print'))).toMatch(/#print-root\s*\{\s*display:\s*none;\s*\}/);
  });

  it('prints only the poster, with exact colors', () => {
    expect(printBlock).toMatch(/body > :not\(#print-root\)\s*\{\s*display:\s*none !important;/);
    expect(printBlock).toMatch(/#print-root\s*\{[^}]*display:\s*block !important;/);
    expect(printBlock).toContain('-webkit-print-color-adjust: exact;');
    expect(printBlock).toContain('print-color-adjust: exact;');
  });
});
