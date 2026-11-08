#!/usr/bin/env node
// End-to-end check of the production build in the installed Google Chrome
// (playwright-core, never a downloaded browser). Builds with Vite, serves the
// build with `vite preview` on port 4173, runs every check, writes screenshots
// to test-results/e2e/, and always stops the server.
//
//   npm run e2e            (or: node scripts/e2e.mjs [--skip-build] [--headed])

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { assert, build, createChecks, ROOT, startServer, stopOnSignal, stopServer, trackExternalRequests } from './harness.mjs';

const PORT = 4173;
const ORIGIN = `http://localhost:${PORT}`;
const OUT = join(ROOT, 'test-results/e2e');
const args = new Set(process.argv.slice(2));

const { results, check } = createChecks();
const externalRequests = [];
const pageErrors = [];

// --- page helpers -----------------------------------------------------------

const POSTER = '.stage > svg';

function track(context) {
  trackExternalRequests(context, externalRequests);
  context.on('page', watchPage);
}

function watchPage(page) {
  page.setDefaultTimeout(20_000);
  page.on('pageerror', (error) => pageErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
  });
}

const hashOf = (page) => page.evaluate(() => location.hash);
const posterMarkup = (page) => page.locator(POSTER).evaluate((svg) => svg.outerHTML);
const editor = (page) => page.locator('textarea.code-input');
const waitForHashChange = (page, previous) => page.waitForFunction((before) => location.hash !== before, previous);

async function waitForPoster(page) {
  await page.waitForSelector(POSTER, { state: 'attached' });
  await page.waitForFunction(() => !document.querySelector('.viewport')?.classList.contains('is-stale'));
}

async function screenshot(page, name, options = {}) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, ...options });
  console.log(`      screenshot: ${path}`);
  return path;
}

function pngDimensions(bytes) {
  assert(bytes.subarray(1, 4).toString() === 'PNG', 'not a PNG file');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function readClipboard(page) {
  return page.evaluate(() => navigator.clipboard.readText());
}

// --- checks -----------------------------------------------------------------

async function desktopChecks(context) {
  const page = await context.newPage();
  let sample = '';

  await check('sample poster renders on an empty URL and the URL gains a fragment', async () => {
    await page.goto(`${ORIGIN}/`);
    await waitForPoster(page);
    await page.waitForFunction(() => location.hash.length > 1);
    const hash = await hashOf(page);
    assert(/^#v=1&(.+&)?d=[\w-]+$/.test(hash), `unexpected fragment ${hash}`);
    sample = await editor(page).inputValue();
    assert(sample.includes('focus: Sarah + Dave Ruiz'), 'editor does not hold the sample');
    const svg = page.locator(POSTER);
    assert((await svg.locator('[data-id]').count()) > 0, 'poster has no person nodes');
    assert((await page.title()).startsWith('The Kim & Ruiz Family'), `tab title is ${await page.title()}`);
    assert((await page.locator('.notice').count()) === 0, `unexpected notices: ${await page.locator('.notices').innerText()}`);
    await screenshot(page, 'desktop');
  });

  await check('editing the DSL redraws the poster and rewrites the URL (reload restores the edit)', async () => {
    const before = await hashOf(page);
    const markup = await posterMarkup(page);
    const edited = sample.replace('title: The Kim & Ruiz Family', 'title: The Ruiz Family Tree');
    await editor(page).fill(edited);
    await waitForHashChange(page, before);
    await waitForPoster(page);
    assert((await posterMarkup(page)) !== markup, 'poster did not change');
    assert((await page.title()).startsWith('The Ruiz Family Tree'), `tab title is ${await page.title()}`);
    await page.reload();
    await waitForPoster(page);
    assert((await editor(page).inputValue()) === edited, 'reload lost the edit');
    await editor(page).fill(sample);
    await page.waitForFunction(() => document.title.startsWith('The Kim & Ruiz Family'));
  });

  await check('toggling traits and dates changes the SVG and the URL, and a reload restores both', async () => {
    await waitForPoster(page);
    const traits = page.getByLabel('Traits', { exact: true });
    const dates = page.getByLabel('Dates', { exact: true });
    assert((await dates.isChecked()) && !(await traits.isChecked()), 'unexpected default toggles');
    const hash0 = await hashOf(page);
    const svg0 = await posterMarkup(page);
    await traits.check();
    await waitForHashChange(page, hash0);
    const hash1 = await hashOf(page);
    const svg1 = await posterMarkup(page);
    assert(hash1.includes('traits=1'), `traits missing from ${hash1}`);
    assert(svg1 !== svg0, 'traits toggle did not change the SVG');
    await dates.uncheck();
    await waitForHashChange(page, hash1);
    const hash2 = await hashOf(page);
    const svg2 = await posterMarkup(page);
    assert(hash2.includes('dates=0'), `dates missing from ${hash2}`);
    assert(svg2 !== svg1, 'dates toggle did not change the SVG');
    await page.reload();
    await waitForPoster(page);
    assert((await hashOf(page)) === hash2, 'reload changed the URL');
    assert((await traits.isChecked()) && !(await dates.isChecked()), 'reload lost the toggles');
    assert((await posterMarkup(page)) === svg2, 'reload drew a different SVG');
  });

  await check('a pasted link (hashchange) reloads the tree and style without a page load', async () => {
    const toggled = await hashOf(page);
    const traitsChecked = () =>
      [...document.querySelectorAll('label.toggle')].find((label) => label.textContent === 'Traits')?.querySelector('input')?.checked;
    await page.evaluate(() => {
      window.__sameDocument = true;
      location.hash = '';
    });
    await page.waitForFunction(() => /^#v=1&d=/.test(location.hash));
    assert(!(await page.evaluate(traitsChecked)), 'default style not restored');
    await page.evaluate((hash) => (location.hash = hash), toggled);
    await page.waitForFunction(traitsChecked);
    assert((await hashOf(page)) === toggled, 'URL changed after loading the link');
    assert(await page.evaluate(() => window.__sameDocument === true), 'the page reloaded');
  });

  await check('layout options follow the focus count and a layout choice reaches the URL', async () => {
    await page.goto(`${ORIGIN}/`);
    await waitForPoster(page);
    const layout = page.getByLabel('Layout', { exact: true });
    const options = await layout.locator('option').allTextContents();
    assert(options.join() === 'Bowtie,Butterfly,Converging,Descendants', `couple layouts: ${options}`);
    assert((await layout.inputValue()) === 'converge', 'auto layout should show Converging');
    const before = await hashOf(page);
    await layout.selectOption('bowtie');
    await waitForHashChange(page, before);
    assert((await hashOf(page)).includes('l=bowtie'), 'layout missing from URL');
    assert((await page.getByLabel('Orientation').locator('option').first().textContent()) === 'Auto (landscape)', 'auto orientation label');
    await waitForPoster(page);
    await screenshot(page, 'desktop-bowtie');
    const single = 'Rose Kim 1932-2019 + Al Kim 1930-2001 -> Mary 1955\nfocus: Mary\n';
    const beforeSingle = await hashOf(page);
    await editor(page).fill(single);
    await waitForHashChange(page, beforeSingle);
    const singleOptions = await layout.locator('option').allTextContents();
    assert(singleOptions.join() === 'Pedigree,Fan,Descendants', `single layouts: ${singleOptions}`);
    assert((await layout.inputValue()) === 'ped', 'bowtie is not offered for one focus, so Pedigree should show');
    const beforeFan = await hashOf(page);
    await layout.selectOption('fan');
    await waitForHashChange(page, beforeFan);
    await waitForPoster(page);
    assert((await page.getByLabel('Orientation').locator('option').first().textContent()) === 'Auto (landscape)', 'fans default to landscape');
    assert((await page.locator(POSTER).getAttribute('width')) === '24in', 'the fan poster is not landscape');
  });

  await check('a parse error dims the preview, lists the error with its line, and keeps the URL', async () => {
    await page.goto(`${ORIGIN}/`);
    await waitForPoster(page);
    const hash = await hashOf(page);
    const broken = sample.replace('John -> Leo 1988', 'John -> -> Leo 1988');
    const line = broken.split('\n').findIndex((text) => text.includes('-> ->')) + 1;
    await editor(page).fill(broken);
    await page.waitForSelector('.viewport.is-stale');
    const item = page.locator('.diag.error').first();
    const text = await item.textContent();
    assert(text.startsWith(`Line ${line}`), `diagnostic: ${text}`);
    assert(await page.locator('.diagnostics.has-errors').isVisible(), 'error list not highlighted');
    assert(/Fix the errors/.test(await page.locator('.stale-badge').innerText()), 'stale badge hidden');
    assert((await page.locator(POSTER).count()) === 1, 'last good poster removed');
    assert((await hashOf(page)) === hash, 'failing DSL reached the URL');
    await item.click();
    const selected = await editor(page).evaluate((area) => area.value.slice(area.selectionStart, area.selectionEnd));
    assert(selected === broken.split('\n')[line - 1], `selected ${JSON.stringify(selected)}`);
    await screenshot(page, 'desktop-error');
    await editor(page).fill(sample);
    await waitForPoster(page);
  });

  await check('a fenced chatbot reply pasted into the editor is unwrapped', async () => {
    const tree = 'Ann Lee 1950 + Bo Lee 1948 -> Cy Lee 1980\nfocus: Cy Lee';
    await page.evaluate((text) => navigator.clipboard.writeText(text), '```\n' + tree + '\n```\n');
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('ControlOrMeta+V');
    await page.waitForFunction((expected) => document.querySelector('textarea.code-input').value === expected, tree);
    await waitForPoster(page);
    assert((await page.title()).startsWith('Cy Lee'), `tab title is ${await page.title()}`);
  });

  await check('Copy link copies the current URL; Copy prompt teaches the format and carries the user’s own tree', async () => {
    await page.goto(`${ORIGIN}/`);
    await waitForPoster(page);
    await page.getByRole('button', { name: 'Copy link' }).click();
    await page.getByRole('button', { name: 'Copied' }).waitFor();
    const href = await page.evaluate(() => location.href);
    assert((await readClipboard(page)) === href && href.includes('#v=1&'), 'clipboard does not hold the share URL');
    assert((await page.getByRole('textbox').count()) === 1, 'the sidebar should have a single text box');
    const copyPrompt = page.getByRole('button', { name: 'Copy prompt' });
    await copyPrompt.click();
    await page.getByText('Copied. Paste it into your chatbot.').waitFor();
    const createPrompt = await readClipboard(page);
    assert(createPrompt.startsWith('Turn my family description'), 'not the create prompt');
    assert(createPrompt.endsWith('My family:\n'), 'the prompt should end where the user types the request');
    assert(!createPrompt.includes('Rose Kim'), 'create prompt should not carry the sample tree');
    await editor(page).fill(`${sample}Mary + Carl Ott -> Eve 1995\n`);
    await page.getByText('The prompt includes your tree.', { exact: false }).waitFor();
    await copyPrompt.click();
    await page.getByText('Copied with your tree. Paste it into your chatbot.').waitFor();
    const editPrompt = await readClipboard(page);
    assert(editPrompt.startsWith('Update my family tree') && editPrompt.includes('Carl Ott'), 'edit prompt lacks the current tree');
    assert(editPrompt.endsWith('The change I want:\n'), 'the edit prompt should end where the user types the request');
  });

  await check('Ctrl+V of a chatbot reply replaces the tree, keeping only its code block', async () => {
    await page.goto(`${ORIGIN}/`);
    await waitForPoster(page);
    const first = 'Ann Lee 1950 + Bo Lee 1948 -> Cy Lee 1980\nfocus: Cy Lee';
    await page.evaluate((text) => navigator.clipboard.writeText(text), `Here is the tree:\n\n\`\`\`text\n${first}\n\`\`\`\n\nWant changes?`);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+V');
    await page.waitForFunction((expected) => document.querySelector('textarea.code-input').value === expected, first);
    await waitForPoster(page);
    await page.waitForFunction(() => document.title.startsWith('Cy Lee'));
    const second = 'Di Kay 1960 + Ed Kay 1958 -> Flo Kay 1990\nfocus: Flo Kay';
    await page.evaluate((text) => navigator.clipboard.writeText(text), '```\n' + second + '\n```');
    await editor(page).click();
    await page.keyboard.press('End');
    await page.keyboard.press('ControlOrMeta+V');
    await page.waitForFunction((expected) => document.querySelector('textarea.code-input').value === expected, second);
    await page.getByText('Replaced your tree with the pasted one.', { exact: false }).waitFor();
    await page.waitForFunction(() => document.title.startsWith('Flo Kay'));
  });

  await check('wheel zooms around the cursor and double-click fits again', async () => {
    await page.goto(`${ORIGIN}/`);
    await waitForPoster(page);
    const level = page.locator('.zoom-level');
    const fitLevel = await level.textContent();
    const box = await page.locator('.viewport').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -600);
    await page.waitForFunction((fit) => document.querySelector('.zoom-level').textContent !== fit, fitLevel);
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction((fit) => document.querySelector('.zoom-level').textContent === fit, fitLevel);
  });

  await check('dragging the sidebar edge resizes it, the poster stays fitted, and a reload keeps the width', async () => {
    await page.goto(`${ORIGIN}/`);
    await waitForPoster(page);
    const sideWidth = () => page.evaluate(() => document.querySelector('aside.side').getBoundingClientRect().width);
    const splitter = page.getByRole('separator', { name: 'Resize the tree panel' });
    const before = await sideWidth();
    const handle = await splitter.boundingBox();
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 240, y, { steps: 8 });
    await page.mouse.up();
    const after = await sideWidth();
    assert(Math.abs(after - (before + 240)) <= 2, `sidebar is ${after}px wide, expected about ${before + 240}px`);
    await page.waitForFunction(() => {
      const viewport = document.querySelector('.viewport').getBoundingClientRect();
      const stage = document.querySelector('.stage').getBoundingClientRect();
      return stage.left >= viewport.left && stage.right <= viewport.right + 1;
    });
    await screenshot(page, 'desktop-wide-sidebar');
    await page.reload();
    await waitForPoster(page);
    assert(Math.abs((await sideWidth()) - after) <= 1, `reload restored ${await sideWidth()}px instead of ${after}px`);
    await splitter.dblclick();
    assert(Math.abs((await sideWidth()) - before) <= 1, `double-click left the sidebar at ${await sideWidth()}px`);
  });

  await check('Print: the hidden print copy and @page size follow the poster; print media shows the poster alone', async () => {
    await page.goto(`${ORIGIN}/`);
    await waitForPoster(page);
    const pageRule = await page.locator('#print-page').textContent();
    assert(pageRule.includes('size: 18in 24in') && pageRule.includes('margin: 0'), `@page rule: ${pageRule}`);
    assert((await page.locator('#print-root > svg').count()) === 1, 'no print copy');
    await page.emulateMedia({ media: 'print' });
    assert(!(await page.locator('.app').isVisible()), 'app UI visible in print media');
    assert(await page.locator('#print-root > svg').isVisible(), 'print copy hidden in print media');
    await screenshot(page, 'print-media');
    // Clear the emulation rather than forcing 'screen': page.pdf() honours an emulated screen medium.
    await page.emulateMedia({ media: null });
    const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1');
    const box = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/.exec(pdf);
    assert(box && Math.round(box[1]) === 1296 && Math.round(box[2]) === 1728, `PDF page box ${box?.slice(1)}`);
    const pages = (pdf.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;
    assert(pages === 1, `PDF has ${pages} pages, expected 1`);
    const fonts = [...new Set([...pdf.matchAll(/\/FontName\s*\/[A-Z]{6}\+([\w-]+)/g)].map((match) => match[1]))];
    assert(fonts.some((name) => name.startsWith('PlayfairDisplay')), `PDF fonts: ${fonts.join(', ') || 'none'}`);
    assert(!/\/Subtype\s*\/Type3\b/.test(pdf), 'PDF has Type 3 fonts, which print shops may reject');
    assert(/\/FontFile2\b/.test(pdf), 'PDF embeds no TrueType font files');
    console.log(`      PDF fonts: ${fonts.join(', ')}`);
  });

  await check('Download SVG and PNG: file names, inlined fonts, 5400 × 7200 px at 300 DPI', async () => {
    await page.goto(`${ORIGIN}/`);
    await waitForPoster(page);
    const [svgDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download SVG' }).click()]);
    assert(svgDownload.suggestedFilename() === 'kim-ruiz-family-18x24.svg', `SVG name ${svgDownload.suggestedFilename()}`);
    const svg = readFileSync(await svgDownload.path(), 'utf8');
    assert(svg.startsWith('<svg') && svg.includes('@font-face') && svg.includes('data:font/woff2;base64,'), 'SVG lacks inlined fonts');
    const [pngDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByRole('button', { name: 'Download PNG' }).click(),
    ]);
    assert(pngDownload.suggestedFilename() === 'kim-ruiz-family-18x24.png', `PNG name ${pngDownload.suggestedFilename()}`);
    const png = readFileSync(await pngDownload.path());
    const size = pngDimensions(png);
    assert(size.width === 5400 && size.height === 7200, `PNG is ${size.width} × ${size.height}`);
    await page.getByText('5400 × 7200 px, 300 DPI').waitFor();
    const thumb = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = Object.assign(document.createElement('canvas'), { width: 540, height: 720 });
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let inked = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 450) inked++;
      return { dataUrl: canvas.toDataURL('image/png'), inked: inked / (canvas.width * canvas.height) };
    }, png.toString('base64'));
    const thumbPath = join(OUT, 'png-export-thumbnail.png');
    writeFileSync(thumbPath, Buffer.from(thumb.dataUrl.split(',')[1], 'base64'));
    console.log(`      PNG thumbnail: ${thumbPath} (${(thumb.inked * 100).toFixed(1)}% inked)`);
    assert(thumb.inked > 0.005, 'the PNG looks blank');
  });

  await check('engine notices show beside the preview (a link too long for the QR corner)', async () => {
    let seed = 7;
    const word = () =>
      Array.from({ length: 9 }, () => {
        seed = (seed * 48271) % 2147483647;
        return String.fromCharCode(97 + (seed % 26));
      }).join('');
    const children = Array.from({ length: 70 }, () => `${word()} ${word()}`);
    const big = `Root Person 1950 + Other Person 1952 -> ${children.join(', ')}\nfocus: Root Person\n`;
    const before = await hashOf(page);
    await editor(page).fill(big);
    await waitForHashChange(page, before);
    await page.locator('.notice', { hasText: 'link too long for QR' }).waitFor();
    assert((await hashOf(page)).length > 1024, 'test tree should exceed the QR budget');
  });

  await check('every theme renders (screenshots)', async () => {
    await page.goto(`${ORIGIN}/`);
    await waitForPoster(page);
    for (const theme of ['botanical', 'modern']) {
      const before = await hashOf(page);
      await page.getByLabel('Theme').selectOption(theme);
      await waitForHashChange(page, before);
      await waitForPoster(page);
      assert((await hashOf(page)).includes(`t=${theme}`), `theme ${theme} missing from URL`);
      await screenshot(page, `desktop-${theme}`);
    }
  });

  await check('a link from a newer version shows a one-line message', async () => {
    await page.goto(`${ORIGIN}/#v=99&d=abc`);
    await page.locator('.banner').waitFor();
    const message = await page.locator('.banner').textContent();
    assert(/newer version/i.test(message), `banner: ${message}`);
  });

  await check('loads, renders, and exports offline after one visit (service worker)', async () => {
    await page.goto(`${ORIGIN}/`);
    await waitForPoster(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await context.setOffline(true);
    try {
      await page.reload();
      await waitForPoster(page);
      const hash = await hashOf(page);
      assert(hash.startsWith('#v=1&'), `offline reload lost the URL state: ${hash}`);
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download SVG' }).click()]);
      const svg = readFileSync(await download.path(), 'utf8');
      assert(svg.includes('data:font/woff2;base64,'), 'offline SVG export could not embed the fonts');
    } finally {
      await context.setOffline(false);
    }
  });

  return page;
}

async function phoneChecks(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  track(context);
  const page = await context.newPage();
  await check('phone: the tree card stacks above the poster and Copy link stays in view', async () => {
    await page.goto(`${ORIGIN}/`);
    await waitForPoster(page);
    assert(await page.getByRole('button', { name: 'Copy link' }).isVisible(), 'Copy link hidden');
    assert(await page.getByRole('button', { name: 'Copy prompt' }).isVisible(), 'Copy prompt hidden');
    assert(await editor(page).isVisible(), 'editor hidden on a phone');
    assert(!(await page.locator('.splitter').isVisible()), 'the sidebar splitter shows on a phone');
    await screenshot(page, 'phone');
    await screenshot(page, 'phone-full', { fullPage: true });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const box = await page.getByRole('button', { name: 'Copy link' }).boundingBox();
    assert(box && box.y >= 0 && box.y + box.height <= 844, `Copy link scrolled out of view (${JSON.stringify(box)})`);
    const poster = await page.locator('.viewport').boundingBox();
    assert(poster && poster.y < 844, 'the poster should be on screen after scrolling down');
    await page.evaluate(() => window.scrollTo(0, 0));
  });
  await context.close();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (!args.has('--skip-build')) build();
  const server = await startServer(PORT);
  stopOnSignal(server);

  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: !args.has('--headed') });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true });
    track(context);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
    console.log(`Checking ${ORIGIN} in ${browser.version()}`);
    await desktopChecks(context);
    await phoneChecks(browser);
    await check('makes zero requests to other hosts', async () => {
      assert(externalRequests.length === 0, `external requests:\n${externalRequests.join('\n')}`);
    });
    await check('no page errors or console errors (CSP violations included)', async () => {
      assert(pageErrors.length === 0, pageErrors.join('\n'));
    });
  } finally {
    await browser?.close();
    stopServer(server);
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${OUT}`);
  process.exitCode = failed.length > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
