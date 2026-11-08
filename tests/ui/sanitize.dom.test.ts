// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { preparePrint } from '../../src/export/print';
import { approxMeasurer } from '../../src/layout/measure';
import { renderPoster } from '../../src/pipeline';
import { DEFAULT_STYLE } from '../../src/style';
import { sanitizeSvg } from '../../src/ui/sanitize';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

describe('sanitizeSvg', () => {
  it('passes clean poster markup through unchanged', () => {
    const markup =
      `<svg ${NS} viewBox="0 0 10 10" aria-label="The Kim &amp; Ruiz Family"><title>Kim</title>` +
      '<defs><path id="arc" d="M0 0h10"/><linearGradient id="g"/></defs>' +
      '<text font-family="\'Playfair Display\', serif"><textPath href="#arc">Rosé</textPath></text>' +
      '<rect fill="url(#g)" width="1" height="1"/><use href="#arc"/></svg>';
    const safe = sanitizeSvg(markup)!;
    expect(safe.markup).toBe(markup);
    expect(safe.element.getAttribute('viewBox')).toBe('0 0 10 10');
    expect(safe.element.querySelector('textPath')?.getAttribute('href')).toBe('#arc');
  });

  it('removes script, handlers, foreign content, animation, and external references', () => {
    const markup =
      `<svg ${NS} onload="alert(1)"><script>alert(2)</script><foreignObject><div>x</div></foreignObject>` +
      '<a href="javascript:alert(3)"><text>kept</text></a><image href="https://evil.example/x.png"/>' +
      '<rect style="fill:url(https://evil.example/f)"/><set attributeName="href" to="javascript:alert(4)"/>' +
      '<style>@import url(https://evil.example/s.css);</style><use href="#ok"/></svg>';
    const safe = sanitizeSvg(markup)!;
    expect(safe.markup).not.toMatch(/script|onload|foreignObject|javascript|evil\.example|<set|@import/i);
    expect(safe.element.querySelector('text')?.textContent).toBe('kept');
    expect(safe.element.querySelector('use')?.getAttribute('href')).toBe('#ok');
  });

  it('keeps embedded raster images', () => {
    const markup = `<svg ${NS}><image href="data:image/png;base64,iVBORw0KGgo="/></svg>`;
    expect(sanitizeSvg(markup)!.markup).toBe(markup);
  });

  it('returns null when there is no svg', () => {
    expect(sanitizeSvg('<p>not a poster</p>')).toBeNull();
  });
});

describe('a poster of hostile names', () => {
  it('needs no cleaning, shows the names as text, and prints without markup injection', () => {
    const hostile = '<img src=x onerror=alert(1)> &';
    const dsl = `title: <script>alert(2)</script>\nRose + ${hostile} "quotes" -> <b onmouseover=alert(3)>Kid</b>\nfocus: <b onmouseover=alert(3)>Kid</b>\n`;
    const result = renderPoster({ dsl, style: { ...DEFAULT_STYLE, traits: true }, shareUrl: null, measure: approxMeasurer });
    expect(result.ok).toBe(true);
    const safe = sanitizeSvg(result.svg!)!;
    expect(safe.markup).toBe(result.svg);
    for (const root of [safe.element, (preparePrint(safe.markup, result.page!), document.getElementById('print-root')!)]) {
      expect(root.querySelectorAll('img, script, b, foreignObject')).toHaveLength(0);
      for (const element of [root, ...root.querySelectorAll('*')]) {
        for (const attribute of element.attributes) expect(attribute.name, element.localName).not.toMatch(/^on/i);
      }
      const text = [...root.querySelectorAll('text')].map((t) => t.textContent).join(' ');
      expect(text).toContain('<script>alert(2)</script>');
      expect(text).toContain('quotes');
    }
    expect(safe.element.querySelector('title')!.textContent).toBe('<script>alert(2)</script>');
    expect(safe.element.querySelector(`[data-id="${CSS.escape(hostile)}"]`)).not.toBeNull();
  });
});
