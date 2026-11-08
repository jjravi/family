// Shared plumbing for the checks that drive the production build in the installed
// Google Chrome (scripts/e2e.mjs, scripts/acceptance.mjs): build with Vite, serve
// dist/ with `vite preview`, record pass/fail per check, and note requests to other hosts.

import { spawn, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

export const ROOT = resolve(import.meta.dirname, '..');
const VITE = join(ROOT, 'node_modules/vite/bin/vite.js');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** A check runner: `check(name, run)` records and prints the outcome without stopping the run. */
export function createChecks() {
  const results = [];
  async function check(name, run) {
    const started = Date.now();
    try {
      const detail = await run();
      results.push({ name, ok: true, detail });
      console.log(`  ✓ ${name} (${Date.now() - started} ms)`);
    } catch (error) {
      results.push({ name, ok: false, error: String(error?.message ?? error) });
      console.log(`  ✗ ${name}\n      ${String(error?.message ?? error).split('\n').join('\n      ')}`);
    }
  }
  return { results, check };
}

export function build() {
  console.log('Building with vite…');
  const result = spawnSync(process.execPath, [VITE, 'build', '--logLevel', 'warn'], { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('vite build failed');
}

/** `vite preview` of dist/ on `port`, resolved once it answers. */
export async function startServer(port) {
  const origin = `http://localhost:${port}`;
  const server = spawn(process.execPath, [VITE, 'preview', '--port', String(port), '--strictPort'], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', (chunk) => (output += chunk));
  server.stderr.on('data', (chunk) => (output += chunk));
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`vite preview exited:\n${output}`);
    try {
      if ((await fetch(origin)).ok) return server;
    } catch {
      // not listening yet
    }
    await sleep(100);
  }
  stopServer(server);
  throw new Error(`vite preview did not start on ${origin}:\n${output}`);
}

export function stopServer(server) {
  if (!server || server.exitCode !== null) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill('SIGTERM');
  }
}

/** Appends the URL of every http(s)/ws(s) request `context` makes to a host other than this machine. */
export function trackExternalRequests(context, list) {
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (!/^(https?|wss?):$/.test(url.protocol)) return;
    if (!LOCAL_HOSTS.has(url.hostname)) list.push(request.url());
  });
}

/** Stops the server on Ctrl+C or SIGTERM before exiting. */
export function stopOnSignal(server) {
  const stop = () => {
    stopServer(server);
    process.exit(130);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
