import { physicalSize, type PageGeometry } from '../style';
import { prefixIds } from './markup';
import './print.css';

const ROOT_ID = 'print-root';
const PAGE_STYLE_ID = 'print-page';
/** Prefix for ids in the print copy, so they never collide with the on-screen poster's. */
const ID_PREFIX = 'print-';

/**
 * Makes the browser's own print (Cmd+P as well as printPoster) print this
 * poster alone on one sheet of exactly its page size. Keeps a hidden
 * `<div id="print-root">`, a direct child of `<body>`, holding a copy of the
 * poster (ids prefixed with `print-`) sized to physicalSize(page), plus a
 * `<style id="print-page">@page { size: <w> <h>; margin: 0 }</style>` in
 * `<head>`; print.css hides everything else in print media and nothing on
 * screen. Call after every successful render. Fonts come from the page, so
 * `loadFonts()` must have resolved. Browser only.
 */
export function preparePrint(svg: string, page: PageGeometry): void {
  const { width, height } = physicalSize(page);

  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
  }
  if (root.parentElement !== document.body) document.body.append(root);
  root.style.width = width;
  root.style.height = height;
  root.innerHTML = prefixIds(svg, ID_PREFIX);
  const poster = root.querySelector('svg');
  poster?.setAttribute('width', width);
  poster?.setAttribute('height', height);

  let pageStyle = document.getElementById(PAGE_STYLE_ID);
  if (!pageStyle) {
    pageStyle = document.createElement('style');
    pageStyle.id = PAGE_STYLE_ID;
    document.head.append(pageStyle);
  }
  pageStyle.textContent = `@page { size: ${width} ${height}; margin: 0; }`;
}

/**
 * Prints the poster alone through the browser's print dialog, the primary
 * Save-as-PDF path: preparePrint(svg, page), then `window.print()`. Nothing to
 * restore afterwards; the print copy stays hidden on screen. Browser only.
 */
export function printPoster(svg: string, page: PageGeometry): void {
  preparePrint(svg, page);
  window.print();
}
