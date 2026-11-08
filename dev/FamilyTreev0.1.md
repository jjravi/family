# Family Tree Stylist — Architecture v0.1

Nov 7, 2026 · @John Ravi

## Overview and goals

A static website that turns a short text description of a family into a styled, printable family-tree poster, with the whole tree encoded in the page URL. There is no backend and no built-in LLM: the site generates a prompt the user pastes into their own chatbot (ChatGPT, Claude, Gemini), the chatbot returns a small text DSL, and the site renders it.

Two primary outputs:

- **Single root.** One focus person; ancestors above or around them (pedigree), or descendants below (descendant chart).
- **Couple mode.** Two focus people; both ancestries rendered together as a bowtie, butterfly, or converging chart sized for a frame (for example 18×24 in over a bed).

Each person carries a name, optional birth and death years, and optional 2–3 descriptive words ("kind, passionate"). Dates and traits are stored in the DSL always and shown on the print only when toggled on.

Target user: one person building a gift or a keepsake in an evening, comfortable pasting text between two browser tabs. Data entry happens in the chatbot; the site is the renderer, the stylist, and the share link.

## Design principles

1. **The DSL is the source of truth.** Every other representation (parsed model, URL payload, SVG) is derived from it and can be regenerated. The LLM, the user, and the URL all speak DSL.
2. **Zero backend.** A single static site on GitHub Pages. No API keys, no database, no analytics. If the repo, Pages, and the jostache.com domain stay up, every link ever shared keeps working.
3. **The URL is the file.** All tree data and style choices live in the URL fragment. Sharing, saving, and bookmarking are the same action. Nothing leaves the browser.
4. **Deterministic rendering.** `render(dsl, style) → SVG` is a pure function. Same URL, same pixels, forever. Any organic jitter is seeded from a hash of the data.
5. **Print first.** The poster is the product. Layout, typography, and export are designed for a fixed physical page size, then shown on screen, not the other way around.
6. **Store everything, show selectively.** Dates and traits are always kept in the DSL; the style layer decides what the print displays. Toggling never loses data.
7. **Human-editable at every layer.** The DSL reads like notes, errors point to a line number, and small fixes never require a round trip to the chatbot.

## System architecture

&#91;embedded content: architecture · 10 components, 1 outside the site\]

The chatbot step is the only part that runs outside the site, and it only ever produces DSL text. Inside the site, data flows one way: DSL → model → layout → SVG → export, with the URL codec and the options bar reading and writing the same DSL and style parameters the editor shows.

## Data model

The model follows GEDCOM's two-entity shape: **persons** and **unions**. A union is a partnership (0–2 partners) with any number of children. This one abstraction handles remarriage, half-siblings, single parents, and unknown partners without special cases.

| Entity | Field | Type | Notes |
| --- | --- | --- | --- |
| Person | `id` | string | Derived from name (+ birth year or `@n` when ambiguous) |
| Person | `name` | string | Display name as written in the DSL |
| Person | `birth` | year or null | Year only in v1 |
| Person | `death` | year or null | `living` is implied when `birth` is set and `death` is null |
| Person | `traits` | string\[\] | 0–3 short words or phrases, display-optional |
| Person | `sourceLine` | int | DSL line number for error reporting |
| Union | `partners` | Person id\[\] | 0, 1, or 2 entries |
| Union | `children` | Person id\[\] | Ordered as written; order is birth order on the print |
| Union | `sourceLine` | int | DSL line number |
| Tree | `persons` | Map | All persons |
| Tree | `unions` | Union\[\] | All unions |
| Tree | `focus` | Person id\[\] | 1 entry (single root) or 2 (couple mode) |
| Tree | `title` | string or null | Optional poster title |

Derived indices built once after parsing: `parentsOf(person)` (the union where the person is a child, at most one in v1), `unionsOf(person)` (unions where the person is a partner), and `generation(person)` relative to the focus. The layout engine reads only these indices, never the DSL text.

The model is deliberately not a general graph API. Cousin marriage and adoption are representable (a person can appear in several unions) but v1 layouts treat the tree as a tree and mark repeats (see Layout engine).

## DSL specification

One union per line, written `partners -> children`. Names are identifiers. The format is direction-agnostic: the same text produces a pedigree, a descendant chart, or a couple chart depending on `focus` and the chosen layout.

```
title: The Kim & Ruiz Family

# partners -> children. Details may be given on first mention or any later one.
Rose Kim 1932-2019 "kind, passionate" + Al Kim 1930-2001 "steady, funny" -> Mary 1955, John 1958
Mary "warm, Godly" + Tom Park 1952 -> Sarah 1980, Jin 1983
Al Kim + Betty Lee 1940 -> Carl 1965        # remarriage: same name, same person
Mary + ? -> Ana 1990                        # unknown partner
John -> Leo 1988                            # single parent

focus: Sarah + Dave Ruiz 1979 "loyal, curious"
```

**Person entry grammar.** `Name [years] ["traits"]`, in that order, separated by spaces.

- `Name`: any run of words not containing `+`, `->`, `,`, `"`, or `#`. Unicode allowed. Case-sensitive.
- `years`: `1932-2019` (born–died), `1932` or `1932-` (born, living), `-2019` (died, birth unknown), `c1932` (approximate, rendered as "c. 1932").
- `traits`: a quoted string, split on commas, trimmed, at most 3 items. The parser accepts straight `"` and curly `“ ”` quotes, since chatbots often emit curly quotes.

**Identity and merging.** A person is identified by exact `Name`. If the name matches exactly one existing person, it is the same person; details given later fill in missing fields, and a conflicting field (two different birth years) is a warning, first value wins. If the name matches more than one person, the reference must add a birth year or an `@n` suffix (`John Kim@2`). A name with no match creates a new person. This rule lets the chatbot write details once and refer to people casually afterward.

**Union lines.**

- `A + B -> C, D`: two partners, two children.
- `A + B`: a union with no children (shows the partner on the print).
- `A -> C`: single parent, no partner shown.
- `A + ? -> C`: unknown partner, rendered as an empty or faded slot.
- A person may be a child in at most one union. A second occurrence as a child is an error.

**Directives.** `key: value` lines, anywhere in the file.

- `focus: A` or `focus: A + B` (required; couple mode when two names are given). The two focus people need not be in a union line; the directive implies one.
- `title: ...` (optional).
- Style is **not** in the DSL. Layout, theme, toggles, and page size are URL parameters, so one tree can be shared in many looks.

**Comments and whitespace.** `#` to end of line is a comment. Blank lines are ignored. Leading whitespace is ignored (indentation carries no meaning, so chatbot indentation habits cannot break parsing).

**Errors.** The parser returns the model plus a list of `{line, severity, message}`. Errors (unparseable line, duplicate child, missing focus, focus not found) block rendering and are shown next to the editor. Warnings (conflicting year, more than 3 traits, person never connected to the focus) still render. Unconnected persons are listed as a warning and omitted from the chart.

## Prompt builder (chatbot handoff)

The site never calls a model. It assembles a prompt from the DSL spec, a few examples, strict output rules, and the user's own words, then hands it to the clipboard. The user pastes it into any chatbot and pastes the resulting DSL back.

**Two modes, one template.**

- **Create.** The user types a free-form description ("My grandparents Rose and Al had two kids, Mary and John..."). The prompt = spec + examples + rules + the description.
- **Edit.** The editor already holds DSL. The user types a change ("add Mary's second husband Carl, married 1990, and their daughter Ana"). The prompt = spec + rules + the **current DSL** + the change request. The chatbot returns the full updated DSL, which is simpler and safer than asking for a diff.

**Prompt skeleton.**

```markdown
You convert family descriptions into a small text format. Output ONLY the
format inside one code block. No commentary.

FORMAT RULES
- One line per couple: `Partner A + Partner B -> Child1, Child2`
- Person: `Name [YYYY-YYYY] ["2-3 words"]`  e.g. `Rose Kim 1932-2019 "kind, passionate"`
- Give a person's details once; refer to them by name afterward.
- Unknown partner: `?`. Single parent: `Name -> Child`. Years optional.
- Use straight quotes. Years only, no months. No indentation needed.
- End with `focus: Name` or `focus: Name + Name` for the people the chart centers on.
- If a fact is unknown, omit it. Never invent names, years, or traits.

EXAMPLE
<3-line example>

[CURRENT TREE]            <- edit mode only
<current DSL>

[REQUEST]
<user text>
```

**Rules worth stating explicitly in the prompt**, because each one fixes a failure mode seen with chatbots: output only the code block (stops preambles), straight quotes (parser accepts curly anyway, belt and braces), never invent facts (LLMs pad sparse families), year-only dates, and "ask the user in plain text instead if the description is contradictory" so the user sees the question rather than a silently wrong tree.

**Paste-back path.** A single DSL textarea on the site accepts the chatbot's output. The site strips a surrounding code fence if present, parses, and shows errors inline with line numbers. Parse errors are the only round-trip failure mode, and the fix is usually one character the user can make in place.

**Convenience, optional.** A "Copy prompt" button is the core. Deep links that prefill a chatbot (`https://chatgpt.com/?q=...`, `https://claude.ai/new?q=...`) can save a paste, but they are undocumented behaviors that may change and the prompt may exceed URL limits; treat them as a progressive enhancement behind the copy button, and verify both before relying on them.

**Spec drift.** The prompt text embeds the DSL spec. Generate it from the same constants the parser uses (token names, examples) so the prompt and parser cannot disagree.

## URL codec (stateless state)

All state lives in the URL **fragment**, parsed with `URLSearchParams`:

```
https://familytree.jostache.com/#v=1&d=<payload>&l=fan&t=botanical&dates=1&traits=0&size=18x24
```

| Param | Meaning | Default |
| --- | --- | --- |
| `v` | Codec version | required |
| `d` | `base64url(deflate-raw(utf8(dsl)))` | required |
| `l` | Layout: `ped` (vertical pedigree), `fan`, `desc`, `bowtie`, `butterfly`, `converge` | by focus count |
| `t` | Theme id | first theme |
| `dates` / `traits` | Show years / show trait words (`0` or `1`) | `1` / `0` |
| `size` | Page: `8x10`, `11x14`, `16x20`, `18x24`, `24x36`, `a3`, `a2` | `18x24` |
| `qr` | Print the QR corner (`0` or `1`) | `1` |

**Why the fragment.** It is never sent to the server, so GitHub Pages logs never see family data, and browsers allow far longer fragments than query strings. The style params ride alongside the data, so the same tree can be shared in several looks and a style change never re-encodes `d`.

**Compression.** The native `CompressionStream('deflate-raw')` and `DecompressionStream` APIs, available in all current browsers, remove any dependency. Base64url (RFC 4648 §5, no padding) keeps the payload URL-safe. The DSL compresses the raw text, not a JSON model, because the DSL is already the compact form and round-trips comments and formatting.

**Size budget.** Roughly 20–25 URL characters per person after deflate and base64. A five-generation couple pedigree with half its slots filled (\~30 people) lands near 1 KB; a 100-person descendant chart near 2.5 KB. Browsers handle this with headroom. The binding constraint is the QR code: a version-40 QR holds 2,953 bytes, but a QR that scans reliably from a framed print at 2 cm wide should stay under \~1 KB (version \~20). Over budget, the site prints a "link too long for QR" note and omits the corner.

**Versioning.** `v` is checked before decoding. A codec or DSL grammar change bumps `v` and keeps the old decoder, since framed prints will carry old links for years.

**Lifecycle.** The URL updates on every successful parse and every style change via `history.replaceState`, so the address bar is always a valid share link. The editor is the input; the URL is the output. On load, the site decodes `d` into the editor and renders.

**Privacy note.** The link is the data: anyone holding it has the names and years. A `living` toggle hides birth years of persons with no death year on the print without removing them from the DSL.

## Layout engine

Ancestor charts are binary trees and descendant charts are general trees; the engine is split along that line. Every layout is a pure function `layout(tree, options, metrics) → positioned nodes + edges` in abstract page units, with no knowledge of SVG.

**Inputs.** The parsed tree, the layout id, and `metrics`: the width and height of a person box *given the current toggles*. Showing traits adds a line, showing dates adds a line, so node size (and therefore spacing) depends on style. Layout runs after the theme reports metrics, never before.

**Pedigree family (ancestors of the focus).** Each person has at most one parent union, so generation *g* has 2^g slots and positions are arithmetic. Two renderings of the same slot assignment:

- `ped`: rectilinear, focus at the bottom, generations stacked upward (or left to right). Slot *k* of generation *g* sits at column `k / 2^g` of the page width.
- `fan`: half-circle, focus at the center of the base, each ancestor occupying an arc of 180° / 2^g in ring *g*. Labels follow the arc via `textPath`, flipped on the left half so text never reads upside down.

Empty slots (unknown ancestors) are passed to the renderer as placeholders, which the theme may draw faded, dotted, or not at all.

**Descendant chart (`desc`).** Variable fan-out needs a tidy-tree algorithm. Each union becomes one layout node (rendered as a joined pair of boxes) whose children are the kids; a person with several unions gets one layout node per union, side by side. Reingold–Tilford via `d3-hierarchy`'s `tree()` with a custom `separation` is the fastest path; a hand-rolled version is \~150 lines if the dependency is unwanted.

**Couple layouts (two focus people).** All three ancestor variants reuse the pedigree code twice:

- `bowtie`: couple at center, one ancestry fanning left (rectilinear, horizontal), the other right.
- `butterfly`: two half-fans back to back forming a full circle around the couple.
- `converge`: both ancestries at the top flowing down and merging into the couple at the bottom center; optionally the couple's children below, which makes this the only mixed layout and is a stretch goal.

Couple + descendants is just `desc` with a two-partner root union, so it needs no separate layout.

**Asymmetry.** One side often has 4 known generations and the other 2. Default: lay out both sides to the same depth (the deeper one) and draw the shallower side's missing slots as placeholders, which keeps the composition balanced and visibly invites filling in. Option: trim to each side's own depth and center independently.

**Repeats and non-tree structure.** Cousin marriage or a person appearing in two branches is drawn twice with a small "see also" mark, as printed genealogies do. No DAG layout in v1.

**Text fitting.** Names are measured once with a hidden canvas (`measureText`). Fan slots shrink the font down to a floor (e.g. 70%), then abbreviate given names to initials, then truncate with an ellipsis. Rectilinear boxes wrap to two lines first. Trait words always use a smaller italic size and are the first thing dropped when a slot is too small, with a warning in the UI.

**Determinism.** No randomness in layout. Organic themes that jitter branch curves seed a tiny PRNG from a hash of the DSL text so the same URL always draws the same picture.

**Capacity.** Pedigree layouts are capped at 7 generations (127 slots); beyond that a fan is unreadable at 18×24. Descendant charts are capped by width: when the widest generation exceeds the page, the UI suggests a larger page size or landscape.

## Themes and rendering

The renderer turns positioned nodes and edges into one SVG element sized to the physical page. A theme is data, not code: a JSON object the renderer reads, so adding a theme never touches layout or parsing.

**Theme schema.**

| Field | Options | Notes |
| --- | --- | --- |
| `palette` | background, ink, accent, muted, placeholder | Also a `paper` texture reference, optional |
| `type` | display font, body font, trait font, sizes per generation | Self-hosted woff2 files |
| `node` | `box`, `pill`, `leaf`, `circle`, `text-only` | Shape drawn behind each name |
| `edge` | `orthogonal`, `curve`, `organic`, `radial` | `organic` = tapered Bézier branches |
| `ornaments` | corner flourishes, title cartouche, rule lines, border | Curated inline SVG symbols, none generated |
| `placeholder` | `hidden`, `dotted`, `faded` | How unknown ancestors appear |
| `metrics` | box width/height with and without dates and traits | Returned to the layout engine before layout runs |

**Rendering of toggles.** `dates` adds a line `1932 – 2019` (or `b. 1932`) under the name; `traits` adds an italic line `kind · passionate`. Both are metric changes, so toggling re-runs layout. On a fan chart, traits render on an inner arc under the name when the slot is wide enough and are dropped otherwise.

**Organic edge style.** Links are drawn as cubic Béziers from child to parent union and stroked with a width proportional to `1 + log2(subtree size)`, so branches thicken toward the focus and merge into a trunk. A seeded ±2° jitter on control points gives a hand-drawn feel without changing between renders. This is what makes the output read as a *tree* rather than an org chart, with no template artwork.

**Typography.** Fonts are bundled in the repo and declared with `@font-face`; no Google Fonts CDN, so the page works offline, loads no third-party resource, and renders identically everywhere. Two or three font pairings in v1 (a serif display with a humanist sans, a script display for the couple title, a monoline for a modern theme). Text is measured after `document.fonts.ready`.

**Initial themes (3).** A classic (cream paper, dark serif, orthogonal edges, box nodes); a botanical (organic edges, leaf nodes, muted greens, corner flourishes); a modern (white, geometric sans, thin radial edges, text-only nodes). Each theme defines sensible defaults for every layout, and each layout may override a theme field (e.g. `fan` forces `radial` edges).

**Title block.** Couple mode places `title` (or "The A & B Family" by default) in a cartouche at the center or base. Single root places it at the top. Themes own the cartouche art.

**Accessibility and screen view.** On screen the SVG is shown inside a zoom-and-pan container at fit-to-width. The SVG carries `<title>` and `aria-label`, and person nodes carry `data-id` so a later version can support click-to-focus.

## Print and export

The primary export path is the browser's own print-to-PDF, because it is the only zero-dependency path that embeds fonts correctly. File exports are layered on top.

**Page geometry.** The SVG `viewBox` matches the chosen physical size exactly (e.g. 18×24 in = 1296×1728 pt at 72 pt/in), with a safe margin of 0.75 in for framing mats. A print stylesheet sets `@page { size: 18in 24in; margin: 0 }`, hides the UI, and scales the SVG to the page. The user picks "Save as PDF" in the print dialog and uploads that file to a print shop or home printer.

**PNG export.** Serialize the SVG, draw it to a `<canvas>` at 300 DPI (18×24 in → 5400×7200 px, within browser canvas limits), and download via `canvas.toBlob`. Fonts render correctly because the page has already loaded them. Useful for print shops that want raster and for sharing a preview image.

**SVG export.** Downloads the raw SVG with every `@font-face` inlined as base64 woff2 in a `<style>` block, so it opens correctly in browsers and Inkscape. Caveat worth telling the user in the UI: some PDF tools and older editors ignore embedded fonts; the PNG or print-PDF path is safer for a shop.

**Fonts in the printed output.** Because fonts are bundled and declared locally, the print dialog embeds them in the PDF. If text-as-outlines is ever needed (a print shop that rejects embedded fonts), `opentype.js` can convert text runs to paths at export time; deferred until someone asks.

**QR corner.** A small QR code (default 2 cm at the bottom corner, theme-styled in the ink color) encodes the full URL. The framed print thereby carries its own editable source: scanning it twenty years from now reopens the tree in the editor. The site generates the QR with a tiny dependency-free encoder and omits it with a notice when the URL exceeds the budget from the URL codec section. A `qr=0` param hides it for people who find it unsightly.

**Supported sizes.** 8×10, 11×14, 16×20, 18×24, 24×36 in; A4, A3, A2. Portrait is the default for pedigree and converge, landscape for bowtie, square-ish for butterfly (letterboxed on the chosen page). Changing size re-runs layout, since slot widths change.

**Bleed.** Not handled. Framed prints are matted or trimmed to the sheet; a `bleed` option can come later if people order edge-to-edge prints.

## UI

One page, three panes, no accounts and no onboarding beyond a sample tree that loads when the URL is empty.

**Left pane: DSL editor.** A plain `<textarea>` (or CodeMirror if line gutters and error underlines are wanted) with a live error list beneath it. Parse on a 300 ms debounce. Errors show line number and message; clicking one moves the caret. A "Clear" and a "Load example" button.

**Left pane, upper: prompt builder.** A second textarea for the user's description or change request, and one button: **Copy prompt for your chatbot**. The button label changes to "Copy edit prompt" when the DSL editor is non-empty, which is the only visible difference between create and edit mode. A short hint reads: paste into ChatGPT, Claude, or Gemini; paste the result back into the editor.

**Right pane: preview.** The rendered SVG at fit-to-width with pinch and scroll zoom. The preview is the exact print artboard, including margins and the QR corner, so what the user sees is what they frame.

**Options bar.** Layout, theme, page size, and the toggles `dates`, `traits`, `living`, `qr`. Every control writes to the URL immediately. Layout options are filtered by focus count: single root offers `ped`, `fan`, `desc`; couple offers `bowtie`, `butterfly`, `converge`, `desc`.

**Share and export.** **Copy link** (the current URL), **Print / Save PDF**, **Download PNG**, **Download SVG**. A short note under Copy link states that the link contains the whole tree.

**Mobile.** Panes stack vertically; the editor collapses behind a tab. Most people will do the chatbot step on a phone and the printing on a desktop, so the share link is the bridge between the two and must be one tap to copy.

**Empty and error states.** Empty URL loads the sample couple tree so the first screen is a finished poster, not a blank form. A parse error keeps the last good render on screen, dimmed, with the error list highlighted. A decode failure (corrupt or future-version link) shows the raw DSL if recoverable and a one-line message otherwise.

## Tech stack and module structure

TypeScript, Vite, no UI framework, deployed to GitHub Pages by a GitHub Actions workflow on push to `main`. The build output is one HTML file, one JS bundle, one CSS file, and the font files. Nothing is fetched at runtime. The site is served at familytree.jostache.com: a CNAME file in the build output (kept in Vite's public/ folder so deploys never drop it), a DNS CNAME record from familytree to the GitHub Pages host, Enforce HTTPS on in the repo settings, and Vite base set to / rather than a repo subpath.

**Dependencies.**

| Package | Purpose | Size | Optional? |
| --- | --- | --- | --- |
| `d3-hierarchy` | Reingold–Tilford for `desc` | \~15 KB | Yes, hand-roll instead |
| QR encoder (e.g. `qrcode-generator` or `qr-creator`) | QR corner | \~10 KB | Yes, drop the QR |
| `vitest` | Unit tests | dev only | No |
| CodeMirror 6 | Editor gutters and underlines | \~150 KB | Yes, plain textarea |
| `opentype.js` | Text to outlines on export | \~100 KB | Yes, deferred |

Compression, base64url, SVG construction, and layout are hand-written. Keeping the runtime dependency list this short is what makes the "works forever on Pages" promise credible.

**Source layout.**

```
src/
  model/     types.ts (Person, Union, Tree), index.ts (parentsOf, unionsOf, generation)
  dsl/       tokenize.ts, parse.ts, format.ts (model -> DSL, for normalization), spec.ts (shared constants)
  prompt/    build.ts (create/edit prompt from spec.ts + user text)
  codec/     encode.ts, decode.ts, params.ts (URL fragment <-> {dsl, style})
  layout/    types.ts, pedigree.ts, fan.ts, descendant.ts, couple.ts, fit.ts (text fitting)
  themes/    schema.ts, classic.ts, botanical.ts, modern.ts, fonts/
  render/    svg.ts, edges.ts (orthogonal/curve/organic/radial), nodes.ts, ornaments.ts, qr.ts
  export/    print.css, png.ts, svg.ts
  ui/        app.ts, editor.ts, options.ts, preview.ts
  main.ts
tests/
  dsl/       parse fixtures (.dsl in, .json out), error fixtures
  codec/     round-trip property tests
  layout/    slot assignment, overlap checks
  render/    golden SVG snapshots per (layout × theme)
```

**Module contracts.** Each layer exposes one pure function and depends only on the layer below:

- `parse(dsl: string): { tree: Tree; diagnostics: Diagnostic[] }`
- `buildPrompt(mode, userText, currentDsl?): string`
- `encode(dsl, style): string` / `decode(fragment): { dsl, style }`
- `layout(tree, style.layout, metrics): Layout`
- `render(layout, theme, style): SVGSVGElement`
- `ui` wires them together and owns the URL.

The boundary that matters most is `dsl/spec.ts`: the parser's token definitions and the prompt builder's instructions both import from it, so the prompt can never describe a grammar the parser does not accept.

## Testing and acceptance criteria

The pure-function layering makes almost everything unit-testable without a browser; only export and fit-to-width need a real DOM.

**Parser.** Fixture pairs (`.dsl` → expected model JSON) covering: remarriage, unknown partner, single parent, curly quotes, trailing comments, name collision with `@2`, name collision with birth year, details given on a later mention, a child in two unions (error), missing focus (error), 4 traits (warning). Property test: `parse(format(parse(x)))` equals `parse(x)`.

**Codec.** Property test: `decode(encode(dsl, style))` returns the same `dsl` and `style` for random DSL strings including Unicode names. A frozen fixture of a v1 URL that must keep decoding in every future version.

**Layout.** For pedigree: every slot in generation *g* has a unique index below 2^g and no two boxes overlap at the smallest supported page. For descendant: no overlap, children centered under their union, siblings in DSL order. For couple layouts: the two sides are mirror-symmetric when given identical trees.

**Render.** Golden SVG snapshots for the sample tree in every layout × theme combination, with and without `dates` and `traits`. A snapshot change must be an intentional commit.

**Prompt.** The prompt builder's output is snapshot-tested, and a manual check with two chatbots on three descriptions (simple, remarriage, contradictory) is part of the release checklist.

**Acceptance for v1.**

- [ ] A description of a 3-generation couple family pasted into ChatGPT returns DSL that renders without manual edits.
- [ ] Toggling `dates` and `traits` changes the print and the URL, and reloading the URL restores both.
- [ ] Each of the 3 themes renders each layout at 18×24 with no overlapping text on the sample tree.
- [ ] Print → Save as PDF produces an 18×24 PDF with the correct fonts embedded (checked in a PDF viewer's font list).
- [ ] PNG export at 300 DPI opens at 5400×7200 px.
- [ ] The QR code on the print scans and opens the identical tree.
- [ ] The site loads and renders with the network disabled after the first visit, and makes zero third-party requests.

## Implementation plan

Build bottom-up so each phase ends with something testable, and the first visible poster appears by the end of phase 2.

1. **Model, parser, codec** (Saturday morning). `dsl/spec.ts`, tokenizer, parser with diagnostics, `format()`, URL encode/decode. Fixtures and round-trip tests pass. No UI yet beyond a console demo.
2. **Pedigree and fan, single root** (Saturday afternoon). Slot assignment, rectilinear and fan renderers with one plain theme, text fitting. Minimal page: textarea on the left, SVG on the right, URL updating. First printable poster.
3. **Couple layouts** (Saturday evening). `bowtie`, `butterfly`, `converge` by mirroring the pedigree code. Asymmetry handling with placeholders. Title cartouche.
4. **Themes and toggles** (Sunday morning). Theme schema, three themes, bundled fonts, `dates` / `traits` / `living` toggles feeding metrics into layout, organic edges with seeded jitter.
5. **Print and export** (Sunday midday). Page sizes, print CSS, PNG export, SVG export with inlined fonts, QR corner with size budget.
6. **Prompt builder and polish** (Sunday afternoon). Create and edit prompts, copy button, code-fence stripping, sample tree, empty and error states, mobile stacking. GitHub Actions deploy.
7. **Stretch.** `desc` layout with `d3-hierarchy`; CodeMirror editor; click-to-refocus from the preview; GEDCOM import.

If time runs short, cut from the top of the stretch list and from phase 6's deep links, never from phase 1's tests or phase 5's QR budget check; those protect links that will be printed and framed.

## Non-goals

- No backend, accounts, saved trees, or collaboration. The URL is the only persistence.
- No LLM calls from the site, no API keys, no in-browser models.
- No photos. Images cannot ride in a URL; a later version could reference external image URLs, which breaks the self-contained promise and is out of scope.
- No full genealogical data model: no sources, events, places, or full dates. GEDCOM import (stretch) maps only names, years, and parent–child links.
- No general DAG layout. Cousin marriage and pedigree collapse are drawn as repeats with a mark.
- No analytics, fonts, or scripts from third-party hosts.
- No print fulfillment integration. The user takes the PDF or PNG to a shop of their choice.

## Open decisions

Each row is a choice to make during implementation. The recommendation is a default to overrule, not a requirement; mark the status as you go.

| # | Decision | Options | Recommendation | Status |
| --- | --- | --- | --- | --- |
| 1 | Project name and URL | Working title or a short memorable name; `github.io` path or a custom domain | Decided: familytree.jostache.com on GitHub Pages with a custom domain. Printed QR links now live as long as jostache.com is renewed | Decided |
| 2 | Traits syntax | `"kind, passionate"` quotes; `{kind, passionate}` braces | Quotes, with curly quotes accepted; reads most naturally to people and chatbots | Open |
| 3 | Trait limits | 3 items; character cap; unlimited | 3 items, each ≤ 14 characters so they fit fan slots; warn, never fail | Open |
| 4 | Date granularity | Years only; full ISO dates stored, year rendered | Years in v1; parser tolerates `1932-05-14` by keeping the year, so links stay valid if full dates come later | Open |
| 5 | Marriage year | None; `A + B m.1978 -> ...` | Defer. `A + B 1978` would collide with B's birth year, so any future syntax needs a prefix | Open |
| 6 | Name disambiguation | `@n`; `(2)`; `#n` | `@n`; `#` is reserved for comments | Open |
| 7 | Adoption and step relations | No marker; `~Child` drawn with a dashed link | Defer; add `~` on request | Open |
| 8 | Sex/gender marker | None; optional `(m)` / `(f)` for color or line style | None in v1; themes do not color by gender | Open |
| 9 | Children order | DSL order; sorted by birth year | DSL order; the prompt tells the chatbot to list eldest first | Open |
| 10 | Editor | Plain textarea; CodeMirror 6 | Textarea in v1 with the error list below it | Open |
| 11 | UI framework | Vanilla TS; Preact; Svelte | Vanilla; one form and one preview | Open |
| 12 | Descendant layout | `d3-hierarchy`; hand-rolled Reingold–Tilford | `d3-hierarchy`, 15 KB and well tested | Open |
| 13 | Fan labels | `textPath` along arcs; radial rotated text | Arc text for rings 1–3, radial text for rings 4+ where arcs get short | Open |
| 14 | Asymmetric couple depth | Pad the shallower side with placeholders; trim each side | Pad | Open |
| 15 | Placeholder style | Faded; dotted; hidden | Faded by default, theme may override | Open |
| 16 | Cousin marriage | Duplicate with a mark; error; DAG layout | Duplicate with a mark | Open |
| 17 | Default couple layout | Bowtie; butterfly; converge | Bowtie on landscape pages, converge on portrait | Open |
| 18 | Default page size | 16×20; 18×24; A3 | 18×24 | Open |
| 19 | Generation cap | 5; 6; 7 | 6 for fan, 7 for rectilinear | Open |
| 20 | Export set | Print-to-PDF only; plus PNG; plus SVG; client-side PDF library | Print, PNG, and SVG; no PDF library | Open |
| 21 | Fonts | Self-hosted OFL fonts; Google Fonts CDN | Self-hosted; three pairings, e.g. Cormorant Garamond with Inter, Playfair Display with Source Sans, plus a script for couple titles | Open |
| 22 | QR corner | On by default; off by default; none | On, with `qr=0` to hide | Open |
| 23 | `living` toggle default | Off (show years); on (hide living birth years) | Off; it is a family keepsake and the toggle is one click away | Open |
| 24 | Style params in URL | Individual readable params; one packed `s=` string | Individual params; hand-editable links are a feature | Open |
| 25 | Chatbot deep links | Copy button only; also prefill links | Copy only in v1; verify prefill behavior before adding | Open |
| 26 | DSL normalization | Rewrite to canonical form on paste; keep as typed | Keep as typed; a Tidy button runs `format()` | Open |
| 27 | Default title | "The A & B Family"; "A & B"; none | "A & B" using surnames when present | Open |
| 28 | License | MIT; Apache-2.0 | MIT | Open |
