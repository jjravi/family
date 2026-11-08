import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { defineConfig } from 'vitest/config';

const SERVICE_WORKER = 'sw.js';
const CACHE_PREFIX = 'family-tree-';
/** Deployment files the app never requests; GitHub Pages need not serve them, and one 404 would fail the whole precache. */
const NOT_PRECACHED = new Set(['CNAME']);

/**
 * Production CSP: the page loads nothing from other origins. Inline styles are
 * needed for the injected @font-face and print rules and the poster's own
 * attributes; data: and blob: URLs serve the PNG export and embedded fonts.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "worker-src 'self'",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** Every file under `dir` as a '/'-separated relative path, dotfiles skipped. */
function listFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return [];
    const path = `${prefix}${entry.name}`;
    return entry.isDirectory() ? listFiles(join(dir, entry.name), `${path}/`) : [path];
  });
}

function serviceWorkerSource(cacheName: string, urls: readonly string[], indexUrl: string): string {
  return `// Generated at build time by vite.config.ts.
const CACHE = ${JSON.stringify(cacheName)};
const PREFIX = ${JSON.stringify(CACHE_PREFIX)};
const PRECACHE = ${JSON.stringify(urls)};
const INDEX = ${JSON.stringify(indexUrl)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Precached files are exact URLs: match on the URL alone, since a host's Vary
// (e.g. Origin, sent on crossorigin script and font requests) would otherwise miss.
async function respond(request) {
  const cache = await caches.open(CACHE);
  const navigation = request.mode === 'navigate';
  const cached = await cache.match(request, { ignoreSearch: navigation, ignoreVary: true });
  if (cached) return cached;
  try {
    return await fetch(request);
  } catch (error) {
    const index = navigation ? await cache.match(INDEX, { ignoreVary: true }) : undefined;
    if (index) return index;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(respond(request));
});
`;
}

/**
 * Emits /sw.js: precaches every emitted file (bundle and public/) plus the
 * site root, in a cache named by a hash of the file list and contents; serves
 * same-origin GETs cache-first; navigations fall back to the cached
 * index.html offline; activation deletes older caches. src/ui/offline.ts
 * registers it in production only.
 */
function serviceWorker(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'family-tree:service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(resolved) {
      config = resolved;
    },
    generateBundle(_options, bundle) {
      const files = new Map<string, string | Uint8Array>();
      const { publicDir } = config;
      if (config.build.copyPublicDir && publicDir && existsSync(publicDir)) {
        for (const file of listFiles(publicDir)) files.set(file, readFileSync(join(publicDir, file)));
      }
      for (const output of Object.values(bundle)) {
        files.set(output.fileName, output.type === 'chunk' ? output.code : output.source);
      }
      files.delete(SERVICE_WORKER);
      for (const name of NOT_PRECACHED) files.delete(name);

      const names = [...files.keys()].sort();
      const hash = createHash('sha256');
      for (const name of names) hash.update(name).update('\0').update(files.get(name)!).update('\0');
      const cacheName = `${CACHE_PREFIX}${hash.digest('hex').slice(0, 16)}`;
      const urls = [config.base, ...names.map((name) => `${config.base}${name}`)];
      this.emitFile({
        type: 'asset',
        fileName: SERVICE_WORKER,
        source: serviceWorkerSource(cacheName, urls, `${config.base}index.html`),
      });
    },
  };
}

/** Adds the CSP meta tag to built pages (the dev server needs inline scripts and websockets). */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'family-tree:csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig({
  base: '/',
  plugins: [serviceWorker(), contentSecurityPolicy()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
