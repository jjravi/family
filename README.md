# Family Tree

A static website that turns a short text description of a family into a styled, printable family-tree poster, with the whole tree encoded in the page URL.

Planned home: https://family.jostache.com

## How it works

1. Describe your family in plain words. The site wraps that in a prompt you paste into any chatbot (ChatGPT, Claude, Gemini).
2. The chatbot replies with a small text format: one line per couple and their children.
3. Paste the reply back. The site renders a poster sized for a frame: one person's ancestors or descendants, or a couple's two ancestries in one chart.

There is no backend or account, and the site never calls an LLM. The tree and its style live entirely in the URL fragment, so the link is the saved file. A QR code on the print reopens the tree for editing.

## Status

Design only; no source code yet. The design and build plan are in *Family Tree — Architecture v0.1*.

Planned stack: TypeScript and Vite with no UI framework, built to static files and deployed to GitHub Pages from `main`.
