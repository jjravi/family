#!/usr/bin/env node
// Spec "Acceptance for v1", proven against the production build in the installed
// Google Chrome (playwright-core, never a downloaded browser). Builds, serves dist/
// on port 4174, runs one check per criterion (a-g) plus a hostile-name check,
// writes evidence to test-results/acceptance/ (report.json, PDFs, PNGs, poster
// screenshots and contact sheets), and always stops the server.
//
//   npm run acceptance     (or: node scripts/acceptance.mjs [--skip-build] [--headed])
//
// The PDF check reads fonts with poppler's pdffonts/pdfinfo/pdftotext when they are
// installed, and otherwise from the PDF's own font dictionaries.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import jsQR from 'jsqr';
import { chromium } from 'playwright-core';
import { assert, build, createChecks, ROOT, startServer, stopOnSignal, stopServer, trackExternalRequests } from './harness.mjs';

const PORT = 4174;
const ORIGIN = `http://localhost:${PORT}`;
const OUT = join(ROOT, 'test-results/acceptance');
const CHATBOT = join(ROOT, 'tests/fixtures/chatbot');
const POSTER = '.stage > svg';
const PRINT_COPY = '#print-root > svg';
const THEMES = ['classic', 'botanical', 'modern'];
const LAYOUTS = ['ped', 'fan', 'desc', 'bowtie', 'butterfly', 'converge'];
const POPPLER = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'].find((dir) => existsSync(join(dir, 'pdffonts')));
const args = new Set(process.argv.slice(2));

const { results, check } = createChecks();
const externalRequests = [];
const pageErrors = [];
let sampleDsl = '';

// --- helpers ----------------------------------------------------------------

/** A share link for `dsl` with style params (Node's deflate-raw; the site decodes any valid stream). */
function linkFor(dsl, params = {}) {
  const style = Object.entries(params).map(([key, value]) => `&${key}=${value}`).join('');
  return `${ORIGIN}/#v=1${style}&d=${deflateRawSync(Buffer.from(dsl, 'utf8')).toString('base64url')}`;
}

function watch(context) {
  trackExternalRequests(context, externalRequests);
  context.on('page', (page) => {
    page.setDefaultTimeout(30_000);
    page.on('pageerror', (error) => pageErrors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
    });
  });
}

async function waitForPoster(page) {
  await page.waitForSelector(POSTER, { state: 'attached' });
  await page.waitForFunction(() => !document.querySelector('.viewport')?.classList.contains('is-stale'));
}

async function open(context, url) {
  const page = await context.newPage();
  await page.goto(url);
  await waitForPoster(page);
  return page;
}

const editor = (page) => page.locator('textarea.code-input');
const hashOf = (page) => page.evaluate(() => location.hash);
const markupOf = (page, selector) => page.locator(selector).evaluate((svg) => svg.outerHTML);
const waitForHashChange = (page, previous) => page.waitForFunction((before) => location.hash !== before, previous);

/** Everything the options bar shows, for comparing two pages. */
function controlsOf(page) {
  return page.evaluate(() => {
    const select = (label) => [...document.querySelectorAll('.options .field')].find((f) => f.querySelector('label')?.textContent === label)?.querySelector('select')?.value;
    const toggles = Object.fromEntries([...document.querySelectorAll('label.toggle')].map((l) => [l.textContent, l.querySelector('input').checked]));
    return { layout: select('Layout'), theme: select('Theme'), page: select('Page'), orientation: select('Orientation'), ...toggles };
  });
}

async function paste(page, text) {
  await page.evaluate((value) => navigator.clipboard.writeText(value), text);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+V');
}

async function download(page, button) {
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.getByRole('button', { name: button }).click()]);
  return { name: file.suggestedFilename(), path: await file.path() };
}

function pngInfo(bytes) {
  assert(bytes.subarray(1, 4).toString() === 'PNG', 'not a PNG file');
  const info = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), dpi: null };
  for (let offset = 8; offset < bytes.length; ) {
    const length = bytes.readUInt32BE(offset);
    if (bytes.toString('latin1', offset + 4, offset + 8) === 'pHYs' && bytes[offset + 16] === 1) {
      info.dpi = Math.round((bytes.readUInt32BE(offset + 8) * 0.0254) * 100) / 100;
    }
    offset += 12 + length;
  }
  return info;
}

/** Page count, size, and fonts of a PDF: poppler when installed, else the PDF's own dictionaries. */
function pdfReport(file) {
  const run = (tool, after = []) => execFileSync(join(POPPLER, tool), [file, ...after], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (POPPLER) {
    const info = run('pdfinfo');
    const [width, height] = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info).slice(1).map(Number);
    const fonts = run('pdffonts')
      .split('\n')
      .slice(2)
      .filter(Boolean)
      .map((row) => /^(\S+)\s+(.+?)\s{2,}(\S+)\s+(yes|no)\s+(yes|no)\s+(yes|no)\s+\d+\s+\d+\s*$/.exec(row))
      .filter(Boolean)
      .map(([, name, type, , emb]) => ({ name: name.replace(/^[A-Z]{6}\+/, ''), type, embedded: emb === 'yes' }));
    return { tool: 'poppler', pages: Number(/Pages:\s+(\d+)/.exec(info)[1]), width, height, fonts, text: run('pdftotext', ['-']) };
  }
  const pdf = readFileSync(file).toString('latin1');
  const box = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/.exec(pdf);
  const type3 = /\/Subtype\s*\/Type3\b/.test(pdf);
  const fonts = [...new Set([...pdf.matchAll(/\/FontName\s*\/[A-Z]{6}\+([\w-]+)/g)].map((m) => m[1]))].map((name) => ({
    name,
    type: /\/FontFile2\b/.test(pdf) ? 'TrueType (FontFile2)' : 'unknown',
    embedded: true,
  }));
  if (type3) fonts.push({ name: '(Type 3 font)', type: 'Type 3', embedded: true });
  return { tool: 'pdf dictionaries', pages: (pdf.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length, width: Number(box?.[1]), height: Number(box?.[2]), fonts, text: null };
}

/** RGB of page 1 at fractions (fx, fy) of its width and height, rendered at 10 DPI by poppler's pdftoppm. */
function pdfPixel(file, fx, fy) {
  const prefix = file.replace(/\.pdf$/, '-10dpi');
  execFileSync(join(POPPLER, 'pdftoppm'), ['-r', '10', '-singlefile', file, prefix]);
  const ppm = readFileSync(`${prefix}.ppm`);
  const [header, width, height] = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(ppm.toString('latin1', 0, 32));
  const offset = header.length + 3 * (Math.floor(fy * Number(height)) * Number(width) + Math.floor(fx * Number(width)));
  return [ppm[offset], ppm[offset + 1], ppm[offset + 2]];
}

/**
 * Measures every text element of the poster on screen in real Chrome. Clones the
 * SVG at 1 CSS px per point, then builds an ink quad per glyph: its position and
 * rotation from the SVG text API (so textPath glyphs follow their arc) and its ink
 * box from canvas measureText in the same font. Reports glyph collisions between
 * different text elements, glyphs past the page's safe margin, and glyphs over the
 * QR code. Runs in the page.
 */
function measureInPage({ margin, tolerance }) {
  const source = document.querySelector('.stage > svg');
  const [, , width, height] = source.getAttribute('viewBox').split(/\s+/).map(Number);
  document.getElementById('acceptance-host')?.remove();
  const host = document.createElement('div');
  host.id = 'acceptance-host';
  host.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px;z-index:2147483647;visibility:hidden;pointer-events:none`;
  const svg = source.cloneNode(true);
  svg.setAttribute('style', `display:block;width:${width}px;height:${height}px;max-width:none;max-height:none`);
  for (const element of svg.querySelectorAll('[id]')) element.id = `m-${element.id}`;
  for (const element of svg.querySelectorAll('[href]')) {
    const href = element.getAttribute('href');
    if (href.startsWith('#')) element.setAttribute('href', `#m-${href.slice(1)}`);
  }
  host.append(svg);
  document.body.append(host);
  window.scrollTo(0, 0);

  const toRoot = svg.getScreenCTM().inverse();
  const context = document.createElement('canvas').getContext('2d');
  const runs = [];
  for (const text of svg.querySelectorAll('text')) {
    const content = text.textContent;
    const style = getComputedStyle(text);
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const m = toRoot.multiply(text.getScreenCTM());
    const quads = [];
    const count = text.getNumberOfChars();
    for (let i = 0; i < count; i++) {
      const code = content.codePointAt(i);
      const glyph = String.fromCodePoint(code);
      if (code > 0xffff) i++;
      if (/\s/u.test(glyph)) continue;
      let start;
      let rotation;
      try {
        start = text.getStartPositionOfChar(i - (code > 0xffff ? 1 : 0));
        rotation = text.getRotationOfChar(i - (code > 0xffff ? 1 : 0));
      } catch {
        continue;
      }
      const ink = context.measureText(glyph);
      const [left, right, ascent, descent] = [ink.actualBoundingBoxLeft, ink.actualBoundingBoxRight, ink.actualBoundingBoxAscent, ink.actualBoundingBoxDescent];
      if (left + right <= 0 || ascent + descent <= 0) continue;
      const a = (rotation * Math.PI) / 180;
      const [ux, uy, nx, ny] = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)];
      const corner = (along, across) => {
        const x = start.x + ux * along + nx * across;
        const y = start.y + uy * along + ny * across;
        return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
      };
      quads.push([corner(-left, -ascent), corner(right, -ascent), corner(right, descent), corner(-left, descent)]);
    }
    const xs = quads.flat().map((p) => p.x);
    const ys = quads.flat().map((p) => p.y);
    runs.push({
      text: content,
      owner: text.closest('[data-id]')?.getAttribute('data-id') ?? text.closest('g[class]')?.getAttribute('class') ?? null,
      quads,
      box: quads.length ? { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } : null,
    });
  }

  /** Penetration depth of two convex polygons (0 when apart), by the separating axis theorem. */
  const depth = (p, q) => {
    let best = Infinity;
    for (const poly of [p, q]) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const axis = { x: (a.y - b.y) / len, y: (b.x - a.x) / len };
        const project = (poly2) => poly2.map((v) => v.x * axis.x + v.y * axis.y);
        const pp = project(p);
        const qq = project(q);
        const overlap = Math.min(Math.max(...pp), Math.max(...qq)) - Math.max(Math.min(...pp), Math.min(...qq));
        if (overlap <= 0) return 0;
        best = Math.min(best, overlap);
      }
    }
    return best;
  };

  const overlaps = [];
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const [r, s] = [runs[i], runs[j]];
      if (!r.box || !s.box || r.box.x1 < s.box.x0 || s.box.x1 < r.box.x0 || r.box.y1 < s.box.y0 || s.box.y1 < r.box.y0) continue;
      let worst = 0;
      for (const p of r.quads) for (const q of s.quads) worst = Math.max(worst, depth(p, q));
      if (worst > tolerance) overlaps.push(`"${r.text}" (${r.owner}) x "${s.text}" (${s.owner}) by ${worst.toFixed(2)} pt`);
    }
  }
  const outside = runs
    .filter((r) => r.box && (r.box.x0 < margin - tolerance || r.box.y0 < margin - tolerance || r.box.x1 > width - margin + tolerance || r.box.y1 > height - margin + tolerance))
    .map((r) => `"${r.text}" (${r.owner}) reaches ${JSON.stringify(Object.fromEntries(Object.entries(r.box).map(([k, v]) => [k, Math.round(v)])))}`);
  const qrGroup = svg.querySelector('g.qr');
  let overQr = [];
  if (qrGroup) {
    const rect = qrGroup.getBoundingClientRect();
    const p0 = new DOMPoint(rect.left, rect.top).matrixTransform(toRoot);
    const p1 = new DOMPoint(rect.right, rect.bottom).matrixTransform(toRoot);
    const square = [{ x: p0.x, y: p0.y }, { x: p1.x, y: p0.y }, { x: p1.x, y: p1.y }, { x: p0.x, y: p1.y }];
    overQr = runs.filter((r) => r.quads.some((q) => depth(q, square) > tolerance)).map((r) => `"${r.text}" (${r.owner})`);
  }
  return {
    page: { width, height },
    texts: runs.length,
    glyphs: runs.reduce((sum, r) => sum + r.quads.length, 0),
    smallest: Math.min(...[...svg.querySelectorAll('text')].map((t) => parseFloat(getComputedStyle(t).fontSize))),
    overlaps,
    outside,
    overQr,
    qr: Boolean(qrGroup),
  };
}

// --- criteria ---------------------------------------------------------------

async function chatbotRoundTrip(context) {
  const description = readFileSync(join(CHATBOT, 'description.txt'), 'utf8').trim();
  const replies = ['reply-chatgpt.txt', 'reply-claude.txt', 'reply-gemini.txt'];
  const page = await open(context, `${ORIGIN}/`);
  sampleDsl = await editor(page).inputValue();
  await page.getByRole('button', { name: 'Copy prompt' }).click();
  await page.getByText('Copied. Paste it into your chatbot.').waitFor();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  assert(prompt.startsWith('Turn my family description into the text format below'), 'not the create prompt');
  assert(prompt.endsWith('My family:\n'), 'the prompt should end where the user types the request');
  mkdirSync(join(OUT, 'chatbot'), { recursive: true });
  // What the user sends: the pasted prompt with their description typed after it.
  writeFileSync(join(OUT, 'chatbot/create-prompt.txt'), `${prompt}${description}\n`);
  const drawn = ['Harold Bennett', 'Margaret Bennett', 'Giuseppe Rossi', 'Lucia Rossi', 'Robert Bennett', 'Elena Rossi', 'Chidi Okafor', 'Ngozi Okafor', 'Daniel Okafor', 'Ada'];
  const evidence = [];
  for (const file of replies) {
    const reply = readFileSync(join(CHATBOT, file), 'utf8');
    const before = await hashOf(page);
    // As a user would: click into the tree and paste; a whole-tree reply replaces what is there.
    await page.evaluate((value) => navigator.clipboard.writeText(value), reply);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+V');
    await waitForHashChange(page, before);
    await waitForPoster(page);
    const text = await editor(page).inputValue();
    assert(!text.includes('```'), `${file}: the code fence was not removed`);
    const errors = await page.locator('.diag.error').count();
    const warnings = await page.locator('.diag.warning').count();
    assert(errors === 0, `${file}: ${errors} errors: ${await page.locator('.diagnostics').innerText()}`);
    const ids = await page.locator(`${POSTER} [data-id]`).evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-id')));
    for (const name of drawn) assert(ids.some((id) => id === name), `${file}: ${name} is not on the poster (${ids.join(', ')})`);
    assert(ids.some((id) => id.startsWith('Sophie')), `${file}: Sophie is not on the poster`);
    assert((await page.title()).startsWith('The Bennett & Okafor Family'), `${file}: tab title ${await page.title()}`);
    await page.screenshot({ path: join(OUT, `chatbot/${file.replace('.txt', '.png')}`) });
    evidence.push(`${file}: 0 errors, ${warnings} warnings, ${new Set(ids).size} people drawn`);
  }
  await page.close();
  return evidence.join('; ');
}

async function togglesChangePrintAndUrl(context) {
  const page = await open(context, `${ORIGIN}/`);
  const traits = page.getByLabel('Traits', { exact: true });
  const dates = page.getByLabel('Dates', { exact: true });
  assert((await dates.isChecked()) && !(await traits.isChecked()), 'unexpected default toggles');
  const print0 = await markupOf(page, PRINT_COPY);
  assert(print0.includes('>b. 1980<') && !print0.includes('brave · curious'), 'default print copy should show dates and no traits');
  const hash0 = await hashOf(page);
  await traits.check();
  await waitForHashChange(page, hash0);
  await waitForPoster(page);
  const hash1 = await hashOf(page);
  const print1 = await markupOf(page, PRINT_COPY);
  assert(hash1.includes('traits=1') && print1 !== print0 && print1.includes('brave · curious'), 'traits did not reach the URL and the print copy');
  await dates.uncheck();
  await waitForHashChange(page, hash1);
  await waitForPoster(page);
  const hash2 = await hashOf(page);
  const print2 = await markupOf(page, PRINT_COPY);
  assert(hash2.includes('dates=0') && print2 !== print1 && !print2.includes('b. 1980') && print2.includes('brave · curious'), 'dates did not reach the URL and the print copy');
  await page.reload();
  await waitForPoster(page);
  assert((await hashOf(page)) === hash2, 'reload changed the URL');
  assert((await traits.isChecked()) && !(await dates.isChecked()), 'reload lost the toggles');
  assert((await markupOf(page, PRINT_COPY)) === print2, 'reload drew a different print copy');
  await page.close();
  return `URL ${hash0.replace(/&d=.*/, '')} -> ${hash1.replace(/&d=.*/, '')} -> ${hash2.replace(/&d=.*/, '')}; print copy changed both times; reload restored toggles and an identical print copy`;
}

/** The measurement finds exactly the problems planted in a test SVG, and none in tightly stacked lines. */
async function measurementSelfTest(context) {
  const page = await context.newPage();
  await page.setContent(
    '<div class="stage"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1296 1728" width="1296" height="1728" font-family="serif">' +
      '<defs><path id="arc" d="M200 1000A300 300 0 0 1 800 1000"/></defs>' +
      '<text x="300" y="300" font-size="40">Overlap</text><text x="330" y="310" font-size="40">Overlap</text>' +
      '<text x="300" y="600" font-size="20">Name</text><text x="300" y="623" font-size="14">b. 1980</text>' +
      '<text font-size="40"><textPath href="#arc" startOffset="50%" text-anchor="middle">Arc text here</textPath></text>' +
      '<text x="500" y="712" font-size="40" text-anchor="middle">Crossing</text>' +
      '<text x="20" y="40" font-size="20">Edge</text>' +
      '<g class="qr" transform="translate(1000 1500)"><rect width="100" height="100"/></g><text x="1040" y="1560" font-size="20">QR!</text>' +
      '</svg></div>',
  );
  const found = await page.evaluate(measureInPage, { margin: 54, tolerance: 0.25 });
  await page.close();
  const pairs = found.overlaps.map((o) => o.replace(/ by .*/, ''));
  assert(pairs.length === 2 && pairs.some((p) => p.startsWith('"Overlap"')) && pairs.some((p) => p.includes('"Arc text here"') && p.includes('"Crossing"')), `planted overlaps: ${found.overlaps}`);
  assert(found.outside.length === 1 && found.outside[0].startsWith('"Edge"'), `planted margin breach: ${found.outside}`);
  assert(found.overQr.length === 1 && found.overQr[0].startsWith('"QR!"'), `planted QR overlap: ${found.overQr}`);
}

async function noOverlappingText(browser) {
  const context = await browser.newContext({ viewport: { width: 1728, height: 1728 }, deviceScaleFactor: 0.5 });
  watch(context);
  await measurementSelfTest(context);
  const mia = sampleDsl.replace(/^focus: .*$/m, 'focus: Mia');
  const cases = [];
  for (const layout of LAYOUTS) {
    for (const orientation of layout === 'fan' ? [null, 'portrait'] : [null]) {
      for (const theme of THEMES) {
        for (const toggles of ['dates', 'full']) cases.push({ layout, orientation, theme, toggles });
      }
    }
  }
  const report = [];
  const failures = [];
  mkdirSync(join(OUT, 'posters'), { recursive: true });
  for (const c of cases) {
    const dsl = c.layout === 'ped' || c.layout === 'fan' ? mia : sampleDsl;
    const params = { l: c.layout, ...(c.theme === 'classic' ? {} : { t: c.theme }), ...(c.toggles === 'full' ? { traits: 1 } : {}), ...(c.orientation ? { o: c.orientation } : {}) };
    const page = await open(context, linkFor(dsl, params));
    const svg = page.locator(POSTER);
    assert((await svg.getAttribute('data-layout')) === c.layout && (await svg.getAttribute('data-theme')) === c.theme, `${JSON.stringify(c)} drew the wrong poster`);
    const result = await page.evaluate(measureInPage, { margin: 54, tolerance: 0.25 });
    const name = `${c.layout}${c.orientation ? `-${c.orientation}` : ''}-${c.theme}-${c.toggles === 'full' ? 'dates-traits' : 'dates'}`;
    const notices = await page.locator('.notice').allTextContents();
    report.push({ name, ...result, notices });
    if (result.overlaps.length || result.outside.length || result.overQr.length) failures.push(`${name}: ${[...result.overlaps, ...result.outside, ...result.overQr].join('; ')}`);
    if (c.toggles === 'full') {
      await page.evaluate(() => (document.getElementById('acceptance-host').style.visibility = 'visible'));
      await page.locator('#acceptance-host').screenshot({ path: join(OUT, `posters/${name}.png`) });
    }
    await page.close();
  }
  await contactSheets(context, report.filter((r) => r.name.endsWith('dates-traits')).map((r) => r.name));
  await context.close();
  writeFileSync(join(OUT, 'overlap-report.json'), JSON.stringify(report, null, 2));
  assert(failures.length === 0, failures.join('\n'));
  const glyphs = report.reduce((sum, r) => sum + r.glyphs, 0);
  return `${report.length} posters (${LAYOUTS.length} layouts + portrait fan, ${THEMES.length} themes, dates and dates+traits), ${glyphs} glyphs measured: 0 text overlaps, 0 outside the 0.75 in margin, 0 over the QR (the measurement first found every problem planted in a test SVG)`;
}

async function contactSheets(context, names) {
  const page = await context.newPage();
  for (const group of [...new Set(names.map((n) => n.replace(/-(classic|botanical|modern)-dates-traits$/, '')))]) {
    const images = THEMES.map((theme) => readFileSync(join(OUT, `posters/${group}-${theme}-dates-traits.png`)).toString('base64'));
    await page.setViewportSize({ width: 1940, height: 200 });
    await page.setContent(
      `<body style="margin:0;padding:20px;display:flex;gap:20px;background:#777;align-items:flex-start">${images.map((b) => `<img src="data:image/png;base64,${b}" style="width:620px">`).join('')}</body>`,
    );
    await page.screenshot({ path: join(OUT, `posters/sheet-${group}.png`), fullPage: true });
  }
  await page.close();
}

async function printToPdf(context) {
  const expected = {
    classic: ['PlayfairDisplay-Italic', 'PlayfairDisplay-Medium', 'PlayfairDisplay-SemiBold', 'SourceSans3ExtraLight-Regular'],
    botanical: ['CormorantGaramondLight-Medium', 'CormorantGaramondLight-MediumItalic', 'CormorantGaramondLight-SemiBold', 'GreatVibes-Regular'],
    modern: ['Jost-Light', 'Jost-LightItalic', 'Jost-Medium'],
  };
  const evidence = [];
  const cases = [
    ...THEMES.map((theme) => ({ name: theme, theme, url: linkFor(sampleDsl, { ...(theme === 'classic' ? {} : { t: theme }), traits: 1 }), size: [1296, 1728] })),
    { name: 'fan-landscape', theme: 'classic', url: linkFor(sampleDsl.replace(/^focus: .*$/m, 'focus: Mia'), { l: 'fan', traits: 1 }), size: [1728, 1296] },
  ];
  for (const c of cases) {
    const page = await open(context, c.url);
    const file = join(OUT, `print-${c.name}.pdf`);
    // printBackground: false is the print dialog's default ("Background graphics" off).
    await page.pdf({ path: file, preferCSSPageSize: true, printBackground: false });
    await page.close();
    const pdf = pdfReport(file);
    if (POPPLER && c.theme === 'classic') {
      const [r, g, b] = pdfPixel(file, 0.03, 0.5);
      assert(r > 200 && b < r - 15, `${c.name}: the paper color is missing from the PDF (rgb ${r} ${g} ${b})`);
    }
    assert(pdf.pages === 1, `${c.name}: ${pdf.pages} pages`);
    assert(Math.abs(pdf.width - c.size[0]) <= 0.5 && Math.abs(pdf.height - c.size[1]) <= 0.5, `${c.name}: page ${pdf.width} x ${pdf.height} pt`);
    const names = [...new Set(pdf.fonts.map((f) => f.name))].sort();
    for (const font of pdf.fonts) {
      assert(font.embedded, `${c.name}: ${font.name} is not embedded`);
      assert(!/type ?3/i.test(font.type), `${c.name}: ${font.name} is a Type 3 font`);
    }
    if (pdf.tool === 'poppler') {
      assert(JSON.stringify(names) === JSON.stringify(expected[c.theme]), `${c.name}: fonts ${names.join(', ')}; expected ${expected[c.theme].join(', ')}`);
      assert(pdf.text.includes(c.name === 'fan-landscape' ? 'Mia' : 'Sarah') && !pdf.text.includes('Copy link'), `${c.name}: the PDF does not hold the poster alone`);
    }
    evidence.push(`${c.name}: ${pdf.width}x${pdf.height} pt, ${names.join(' + ')} (${[...new Set(pdf.fonts.map((f) => f.type))].join(', ')}, all embedded)`);
  }
  return `${evidence.join('; ')} [read with ${POPPLER ? 'poppler pdffonts' : 'the PDF font dictionaries'}]`;
}

async function pngAt300Dpi(context) {
  const page = await open(context, `${ORIGIN}/`);
  const file = await download(page, 'Download PNG');
  const bytes = readFileSync(file.path);
  const info = pngInfo(bytes);
  writeFileSync(join(OUT, 'poster-300dpi.png'), bytes);
  assert(info.width === 5400 && info.height === 7200, `PNG is ${info.width} x ${info.height}`);
  assert(info.dpi === 300, `PNG declares ${info.dpi} DPI`);
  await page.getByText('5400 × 7200 px, 300 DPI').waitFor();
  await page.close();
  return `${file.name}: ${info.width} x ${info.height} px, pHYs ${info.dpi} DPI, ${(bytes.length / 1e6).toFixed(1)} MB`;
}

async function qrOpensIdenticalTree(browser, context) {
  const page = await open(context, linkFor(sampleDsl, { t: 'botanical', traits: 1, l: 'butterfly' }));
  const original = { href: await page.evaluate(() => location.href), dsl: await editor(page).inputValue(), controls: await controlsOf(page), poster: await markupOf(page, POSTER) };
  const qrBox = await page.locator(`${POSTER} g.qr`).evaluate((g) => {
    const svg = g.ownerSVGElement;
    const toRoot = svg.getScreenCTM().inverse();
    const rect = g.getBoundingClientRect();
    const a = new DOMPoint(rect.left, rect.top).matrixTransform(toRoot);
    const b = new DOMPoint(rect.right, rect.bottom).matrixTransform(toRoot);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  });
  const file = await download(page, 'Download PNG');
  const png = readFileSync(file.path);
  const crop = await page.evaluate(
    async ({ base64, box }) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
      const scale = 300 / 72;
      const pad = 20;
      const x = Math.max(0, Math.floor(box.x * scale) - pad);
      const y = Math.max(0, Math.floor(box.y * scale) - pad);
      const w = Math.min(bitmap.width - x, Math.ceil(box.w * scale) + 2 * pad);
      const h = Math.min(bitmap.height - y, Math.ceil(box.h * scale) + 2 * pad);
      const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let binary = '';
      for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
      return { width: w, height: h, rgba: btoa(binary), png: canvas.toDataURL('image/png').split(',')[1] };
    },
    { base64: png.toString('base64'), box: qrBox },
  );
  writeFileSync(join(OUT, 'qr-crop.png'), Buffer.from(crop.png, 'base64'));
  const decoded = jsQR(new Uint8ClampedArray(Buffer.from(crop.rgba, 'base64')), crop.width, crop.height);
  assert(decoded, 'jsQR found no QR code in the exported PNG');
  assert(decoded.data === original.href, `QR holds ${decoded.data}\nexpected ${original.href}`);
  await page.close();

  const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  watch(fresh);
  const reopened = await open(fresh, decoded.data);
  const again = { dsl: await editor(reopened).inputValue(), controls: await controlsOf(reopened), poster: await markupOf(reopened, POSTER) };
  await fresh.close();
  assert(again.dsl === original.dsl, 'the reopened editor holds different text');
  assert(JSON.stringify(again.controls) === JSON.stringify(original.controls), `controls differ: ${JSON.stringify(again.controls)} vs ${JSON.stringify(original.controls)}`);
  assert(again.poster === original.poster, 'the reopened poster differs');
  return `QR v${decoded.version} (${crop.width}x${crop.height} px crop of the 300 DPI PNG) decodes to the ${decoded.data.length}-char share URL; a fresh browser context shows the same DSL, controls ${JSON.stringify(original.controls)}, and an identical poster`;
}

async function worksOffline(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  watch(context);
  const page = await open(context, `${ORIGIN}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  try {
    await page.reload();
    await waitForPoster(page);
    assert((await editor(page).inputValue()) === sampleDsl, 'offline reload lost the tree');
    const fonts = await page.evaluate(() =>
      ['500 20px "Playfair Display"', '600 20px "Cormorant Garamond"', '300 20px Jost', '400 20px "Great Vibes"'].map((font) => document.fonts.check(font)),
    );
    assert(fonts.every(Boolean), `fonts unavailable offline: ${fonts}`);
    const fresh = 'Ana Lima 1950 + Rui Lima 1948 -> Bia Lima 1980\nfocus: Bia Lima\n';
    await page.goto(linkFor(fresh, { l: 'fan', t: 'modern' }));
    await page.waitForFunction(() => document.querySelector('.stage > svg')?.getAttribute('data-layout') === 'fan');
    await waitForPoster(page);
    assert((await page.locator(`${POSTER} [data-id="Rui Lima"]`).count()) === 1, 'a new link did not draw offline');
    const svg = readFileSync((await download(page, 'Download SVG')).path, 'utf8');
    assert(svg.includes('data:font/woff2;base64,'), 'offline SVG export could not embed fonts');
  } finally {
    await context.setOffline(false);
    await context.close();
  }
  return 'after one visit, offline: reload restored the sample with all four families loaded, a new link (fan, modern) drew, and the SVG export embedded fonts from the cache';
}

async function hostileName(context) {
  const hostile = '<img src=x onerror=alert(1)> &';
  const dsl = `title: <script>alert(2)</script>\nRose Kim 1950 + ${hostile} "quotes" -> Kid 1980\nfocus: ${hostile} + Rose Kim\n`;
  const page = await open(context, `${ORIGIN}/`);
  const dialogs = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  const before = await hashOf(page);
  await paste(page, dsl);
  await waitForHashChange(page, before);
  await waitForPoster(page);
  await page.waitForTimeout(500);
  const shown = await page.evaluate(() => ({
    text: [...document.querySelectorAll('.stage > svg text')].map((t) => t.textContent).join(' | '),
    injected: document.querySelectorAll('.stage img, .stage script, #print-root img, #print-root script').length,
    handlers: [...document.querySelectorAll('.stage *, #print-root *')].filter((e) => [...e.attributes].some((a) => /^on/i.test(a.name))).length,
    title: document.title,
  }));
  assert(dialogs.length === 0, `script ran: ${dialogs}`);
  assert(shown.injected === 0 && shown.handlers === 0, 'markup was injected into the page');
  assert(shown.text.includes('<script>alert(2)</script>') && shown.text.includes('&'), `poster text: ${shown.text}`);
  const svg = readFileSync((await download(page, 'Download SVG')).path, 'utf8');
  assert(svg.includes('&lt;script&gt;alert(2)&lt;/script&gt;') && !/<img|<script/.test(svg), 'the exported SVG is not escaped');
  const png = pngInfo(readFileSync((await download(page, 'Download PNG')).path));
  const pdfFile = join(OUT, 'print-hostile.pdf');
  await page.pdf({ path: pdfFile, preferCSSPageSize: true, printBackground: true });
  const pdf = pdfReport(pdfFile);
  if (pdf.text !== null) assert(pdf.text.includes('<script>alert(2)</script>'), 'the PDF lacks the title text');
  await page.reload();
  await waitForPoster(page);
  assert((await editor(page).inputValue()) === dsl, 'the link did not round-trip the text');
  assert(dialogs.length === 0, `script ran after reload: ${dialogs}`);
  await page.close();
  return `no dialog, no injected elements or handlers; shown as text, escaped in the SVG export, PNG ${png.width}x${png.height}, PDF text has the title, link reload restores the exact DSL`;
}

// --- main -------------------------------------------------------------------

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (!args.has('--skip-build')) build();
  const server = await startServer(PORT);
  stopOnSignal(server);
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: !args.has('--headed') });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
    watch(context);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
    console.log(`Acceptance for v1 on ${ORIGIN} in Chrome ${browser.version()}${POPPLER ? `, poppler in ${POPPLER}` : ''}`);
    await check('a. chatbot replies (3, with fences, curly quotes, en dashes, bullets) render with zero errors', () => chatbotRoundTrip(context));
    await check('b. dates and traits change the print and the URL; reload restores both', () => togglesChangePrintAndUrl(context));
    await check('c. every theme x layout at 18x24 has no overlapping text (real Chrome glyph boxes)', () => noOverlappingText(browser));
    await check('d. Print -> PDF: one 18x24 page, theme fonts embedded, no Type 3', () => printToPdf(context));
    await check('e. PNG export at 300 DPI is 5400 x 7200 px', () => pngAt300Dpi(context));
    await check('f. the QR code on the print scans and opens the identical tree', () => qrOpensIdenticalTree(browser, context));
    await check('g. loads and renders offline after one visit', () => worksOffline(browser));
    await check('edge: a hostile name stays text through the editor, link, SVG, PNG, and print', () => hostileName(context));
    await check('g. zero requests to other hosts', async () => {
      assert(externalRequests.length === 0, `external requests:\n${externalRequests.join('\n')}`);
      return 'none';
    });
    await check('no page errors or console errors (CSP violations included)', async () => {
      assert(pageErrors.length === 0, pageErrors.join('\n'));
      return 'none';
    });
  } finally {
    await browser?.close();
    stopServer(server);
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ chrome: browser?.version(), results }, null, 2));
  console.log('\nEvidence:');
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}\n        ${r.ok ? r.detail : r.error.split('\n')[0]}`);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} acceptance checks passed. Evidence: ${OUT}`);
  process.exitCode = failed.length > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
