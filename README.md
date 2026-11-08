# Family Tree

A static website that turns a short description of a family into a styled, printable family-tree poster, with the whole tree and its style encoded in the page URL.

https://family.jostache.com

It draws one person's ancestors (pedigree or fan), anyone's descendants, or a couple's two ancestries in one chart (bowtie, butterfly, or converging), in three themes (classic, botanical, modern), on pages from 8×10 in to 24×36 in or A4 to A2. There is no backend, no account, and no built-in AI: the site writes a prompt for your own chatbot and draws the text it sends back. After the first visit it works offline.

## How to use it

1. Press **Copy prompt**. It teaches a chatbot the tree format and, once you have a tree of your own, carries that tree too.
2. Paste it into ChatGPT, Claude, or Gemini, describe your family (or the change you want) after it, and send. The reply is a few lines of text, one per couple and their children.
3. Paste the reply into **Your family tree**. A reply with a whole tree replaces the old one, and only its code block is kept. Errors point to a line you can fix in place, and you can always edit the text directly.
4. Choose the layout, theme, page size, and orientation, and whether to show dates, trait words, the birth years of living people, and the QR code.
5. **Print / Save PDF** opens the print dialog at the poster's exact page size (choose *Save as PDF* for a print shop), **Download PNG** gives 300 DPI, and **Download SVG** embeds its fonts. **Copy link** copies the URL, which is the saved file; the QR code on the print reopens the same tree.

## Privacy

The link is the data. Names, years, and trait words live in the URL fragment, which browsers never send to the server, but anyone with the link or a photo of the QR code can read the tree. *Hide living birth years* leaves those years off the print without removing them from the link. The site loads nothing from other servers and has no analytics.

## Development

Requires Node 22.12 or later. `npm run e2e` and `npm run acceptance` also need Google Chrome; they drive it through playwright-core and never download a browser.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm test` | Unit tests, including golden SVG snapshots (no browser or network needed) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Type-check, then build the static site into `dist/` |
| `npm run preview` | Serve the built `dist/`, with its service worker and CSP |
| `npm run e2e` | Build, serve, and check the UI flows in Chrome (screenshots in `test-results/e2e/`) |
| `npm run acceptance` | Build, serve, and check the v1 acceptance criteria in Chrome (evidence, including poster contact sheets, in `test-results/acceptance/`) |

- A snapshot change must be intentional: review the diff, then run `npx vitest run -u`.
- The acceptance PDF check reads fonts with poppler's `pdffonts` when it is installed (`brew install poppler`) and from the PDF's own font tables otherwise.
- Design and decisions: [dev/FamilyTreev0.1.md](dev/FamilyTreev0.1.md).

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`: `npm ci`, `npm test`, and `npm run build`, then it publishes `dist/` to GitHub Pages. One-time setup:

1. In the repository on GitHub, **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. In your DNS for jostache.com, add a **CNAME record `family` → `jjravi.github.io`**.
3. In **Settings → Pages → Custom domain**, enter `family.jostache.com` and save (the build also ships `public/CNAME`). Once the DNS check passes, tick **Enforce HTTPS**.

## License

MIT for the code (see [LICENSE](LICENSE)); the bundled fonts are under the SIL Open Font License 1.1 (license texts in `src/themes/fonts/`).
