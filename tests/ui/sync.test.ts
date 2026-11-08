import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecodeResult } from '../../src/codec/types';
import type { Diagnostic, Person, Tree } from '../../src/model/types';
import type { PosterInput, PosterResult } from '../../src/pipeline';
import { DEFAULT_STYLE, resolveStyle, type Style } from '../../src/style';
import { createSync, EDIT_DEBOUNCE_MS, type SyncDeps, type SyncState } from '../../src/ui/sync';

const BASE = 'https://family.jostache.com/';

function tree(focus: string[]): Tree {
  const person = (id: string): Person => ({ id, name: id, birth: null, birthApprox: false, death: null, deathApprox: false, traits: [], sourceLine: 1 });
  return { persons: new Map(focus.map((id) => [id, person(id)])), unions: [], focus, title: null };
}

/** Stands in for renderPoster: text containing ERROR has a parse error on line 2; anything else draws. */
function fakeRender(input: PosterInput): PosterResult {
  if (input.dsl.includes('ERROR')) {
    const diagnostics: Diagnostic[] = [{ line: 2, severity: 'error', message: 'bad line' }];
    return { ok: false, diagnostics, notices: [], tree: tree([]), focusCount: 0, layout: null, orientation: null, page: null, svg: null };
  }
  return { ok: true, diagnostics: [], notices: [], tree: tree(['A']), focusCount: 1, ...resolveStyle(input.style, 1), svg: `<svg>${input.dsl}</svg>` };
}

function fragmentFor(dsl: string, style: Style): string {
  return `v=1&dates=${style.dates ? 1 : 0}&d=${dsl}`;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

/** An encode whose results resolve only when the test says so. */
function manualEncode() {
  const waiting = new Map<string, (fragment: string) => void>();
  const encode = vi.fn((dsl: string, style: Style) => {
    const { promise, resolve } = deferred<string>();
    waiting.set(dsl, () => resolve(fragmentFor(dsl, style)));
    return promise;
  });
  const settle = async (dsl: string) => {
    waiting.get(dsl)!('');
    await vi.advanceTimersByTimeAsync(0);
  };
  return { encode, settle };
}

function setup(overrides: Partial<SyncDeps> = {}) {
  const log: string[] = [];
  const states: SyncState[] = [];
  const loads: { dsl: string; style: Style; message: string | null }[] = [];
  const deps: SyncDeps = {
    decode: vi.fn(async (): Promise<DecodeResult> => ({ status: 'empty', style: { ...DEFAULT_STYLE } })),
    encode: async (dsl, style) => fragmentFor(dsl, style),
    shareBase: () => BASE,
    sampleDsl: 'SAMPLE',
    ...overrides,
    render: vi.fn((input: PosterInput) => {
      log.push(`render ${input.dsl} ${input.shareUrl}`);
      return fakeRender(input);
    }),
    replaceFragment: vi.fn((fragment: string) => {
      log.push(`url ${fragment}`);
    }),
  };
  const sync = createSync(deps, {
    loaded: (dsl, style, message) => loads.push({ dsl, style, message }),
    updated: (state) => states.push(state),
  });
  return { sync, deps, log, states, loads, last: () => states.at(-1)! };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createSync: URL lifecycle', () => {
  it('loads the sample for an empty URL, renders with the share URL in the QR, then writes the URL', async () => {
    const { sync, log, loads, last } = setup();
    await sync.load('');
    const fragment = fragmentFor('SAMPLE', DEFAULT_STYLE);
    expect(loads).toEqual([{ dsl: 'SAMPLE', style: DEFAULT_STYLE, message: null }]);
    expect(log).toEqual([`render SAMPLE ${BASE}#${fragment}`, `url ${fragment}`]);
    expect(last()).toMatchObject({ dsl: 'SAMPLE', stale: false, focusCount: 1, notices: [], message: null });
    expect(last().poster).toMatchObject({ dsl: 'SAMPLE', svg: '<svg>SAMPLE</svg>', shareUrl: `${BASE}#${fragment}` });
  });

  it('encodes before rendering, and renders before writing the URL', async () => {
    const order: string[] = [];
    const { sync, deps } = setup({
      encode: async (dsl, style) => {
        order.push('encode');
        return fragmentFor(dsl, style);
      },
    });
    vi.mocked(deps.render).mockImplementation((input) => (order.push('render'), fakeRender(input)));
    vi.mocked(deps.replaceFragment).mockImplementation(() => void order.push('url'));
    await sync.load('');
    expect(order).toEqual(['encode', 'render', 'url']);
  });

  it('debounces typing: one render 300 ms after the last edit, with the latest text', async () => {
    const { sync, log } = setup();
    await sync.load('');
    log.length = 0;
    sync.edit('A');
    await vi.advanceTimersByTimeAsync(100);
    sync.edit('AB');
    await vi.advanceTimersByTimeAsync(EDIT_DEBOUNCE_MS - 1);
    expect(log).toEqual([]);
    expect(sync.idle).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(log).toEqual([`render AB ${BASE}#${fragmentFor('AB', DEFAULT_STYLE)}`, `url ${fragmentFor('AB', DEFAULT_STYLE)}`]);
    expect(sync.idle).toBe(true);
  });

  it('drops an update overtaken while its encode was pending', async () => {
    const { encode, settle } = manualEncode();
    const { sync, deps, last } = setup({ encode });
    const loading = sync.load('');
    await vi.advanceTimersByTimeAsync(0);
    await settle('SAMPLE');
    await loading;

    sync.edit('A');
    await vi.advanceTimersByTimeAsync(EDIT_DEBOUNCE_MS);
    sync.edit('B');
    await vi.advanceTimersByTimeAsync(EDIT_DEBOUNCE_MS);
    await settle('B');
    await settle('A');

    expect(vi.mocked(deps.render).mock.calls.map(([input]) => input.dsl)).toEqual(['SAMPLE', 'B']);
    expect(vi.mocked(deps.replaceFragment).mock.calls.map(([fragment]) => fragment)).toEqual([
      fragmentFor('SAMPLE', DEFAULT_STYLE),
      fragmentFor('B', DEFAULT_STYLE),
    ]);
    expect(last().dsl).toBe('B');
  });

  it('lets a newly loaded link (hashchange) supersede an update in flight', async () => {
    const { encode, settle } = manualEncode();
    const decode = vi.fn(async (fragment: string): Promise<DecodeResult> =>
      fragment === '' ? { status: 'empty', style: { ...DEFAULT_STYLE } } : { status: 'ok', dsl: 'LINKED', style: { ...DEFAULT_STYLE }, warnings: [] },
    );
    const { sync, deps, loads, last } = setup({ encode, decode });
    const first = sync.load('');
    await vi.advanceTimersByTimeAsync(0);
    await settle('SAMPLE');
    await first;

    sync.edit('A');
    await vi.advanceTimersByTimeAsync(EDIT_DEBOUNCE_MS);
    const second = sync.load('#v=1&d=xyz');
    await vi.advanceTimersByTimeAsync(0);
    await settle('A');
    await settle('LINKED');
    await second;

    expect(loads.map((load) => load.dsl)).toEqual(['SAMPLE', 'LINKED']);
    expect(vi.mocked(deps.render).mock.calls.map(([input]) => input.dsl)).toEqual(['SAMPLE', 'LINKED']);
    expect(last().dsl).toBe('LINKED');
  });

  it('renders a style change at once, folding in a waiting edit', async () => {
    const { sync, log } = setup();
    await sync.load('');
    log.length = 0;
    sync.edit('A');
    const style = { ...DEFAULT_STYLE, dates: false };
    await sync.setStyle(style);
    expect(log).toEqual([`render A ${BASE}#${fragmentFor('A', style)}`, `url ${fragmentFor('A', style)}`]);
    await vi.advanceTimersByTimeAsync(EDIT_DEBOUNCE_MS);
    expect(log).toHaveLength(2);
  });

  it('flush() runs a waiting edit at once', async () => {
    const { sync, last } = setup();
    await sync.load('');
    sync.edit('NOW');
    await sync.flush();
    expect(last().dsl).toBe('NOW');
    expect(sync.idle).toBe(true);
  });

  it('skips a request identical to the last one', async () => {
    const { sync, log } = setup();
    await sync.load('');
    log.length = 0;
    await sync.replace('SAMPLE');
    expect(log).toEqual([]);
  });

  it('waits for fonts before the first render', async () => {
    const fonts = deferred<void>();
    const { sync, deps } = setup({ ready: fonts.promise });
    const loading = sync.load('');
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.render).not.toHaveBeenCalled();
    fonts.resolve();
    await loading;
    expect(deps.render).toHaveBeenCalledTimes(1);
  });
});

describe('createSync: text that cannot be drawn', () => {
  it('keeps the last good poster, marks it stale, and leaves the URL alone', async () => {
    const { sync, deps, last } = setup();
    await sync.load('');
    vi.mocked(deps.replaceFragment).mockClear();
    await sync.replace('ERROR');
    expect(deps.replaceFragment).not.toHaveBeenCalled();
    expect(last()).toMatchObject({ dsl: 'ERROR', stale: true, focusCount: 1, diagnostics: [{ line: 2, severity: 'error', message: 'bad line' }] });
    expect(last().poster?.dsl).toBe('SAMPLE');
  });

  it('redraws the last good poster in a new style and writes its URL', async () => {
    const { sync, log, last } = setup();
    await sync.load('');
    await sync.replace('ERROR');
    log.length = 0;
    const style = { ...DEFAULT_STYLE, dates: false };
    await sync.setStyle(style);
    const fragment = fragmentFor('SAMPLE', style);
    expect(log).toEqual([`render ERROR ${BASE}#${fragmentFor('ERROR', style)}`, `render SAMPLE ${BASE}#${fragment}`, `url ${fragment}`]);
    expect(last()).toMatchObject({ dsl: 'ERROR', stale: true });
    expect(last().poster).toMatchObject({ dsl: 'SAMPLE', style });
  });

  it('still renders when encoding fails, without a QR URL, and keeps the address bar', async () => {
    const { sync, deps, last } = setup({
      encode: async () => {
        throw new Error('no CompressionStream');
      },
    });
    await sync.load('');
    expect(vi.mocked(deps.render).mock.calls[0]![0].shareUrl).toBeNull();
    expect(deps.replaceFragment).not.toHaveBeenCalled();
    expect(last()).toMatchObject({ stale: false, notices: ['Could not update the share link: no CompressionStream'] });
  });
});

describe('createSync: loading links', () => {
  const modern: Style = { ...DEFAULT_STYLE, theme: 'modern' };

  it('applies the decoded tree and style, and shows ignored params as the message', async () => {
    const decode = async (): Promise<DecodeResult> => ({ status: 'ok', dsl: 'MINE', style: modern, warnings: ['Ignored "x".'] });
    const { sync, loads, last } = setup({ decode });
    await sync.load('#v=1&t=modern&x=1&d=abc');
    expect(loads).toEqual([{ dsl: 'MINE', style: modern, message: 'Ignored "x".' }]);
    expect(last()).toMatchObject({ dsl: 'MINE', style: modern, message: 'Ignored "x".', stale: false });
  });

  it('keeps the load message until the user changes something', async () => {
    const decode = async (): Promise<DecodeResult> => ({ status: 'ok', dsl: 'MINE', style: modern, warnings: ['Ignored "x".'] });
    const { sync, last } = setup({ decode });
    await sync.load('#x');
    await sync.setStyle({ ...modern, traits: true });
    expect(last().message).toBeNull();
  });

  it('puts recoverable text from a broken link in the editor and never writes it when it fails', async () => {
    const decode = async (): Promise<DecodeResult> => ({ status: 'error', reason: 'unsupported-version', message: 'Newer link.', dsl: 'ERROR', style: modern });
    const { sync, deps, loads, last } = setup({ decode });
    await sync.load('#v=9&d=abc');
    expect(loads).toEqual([{ dsl: 'ERROR', style: modern, message: 'Newer link.' }]);
    expect(deps.replaceFragment).not.toHaveBeenCalled();
    expect(last()).toMatchObject({ stale: true, poster: null, message: 'Newer link.' });
  });

  it('rewrites a broken link whose recovered text draws', async () => {
    const decode = async (): Promise<DecodeResult> => ({ status: 'error', reason: 'corrupt', message: 'Damaged.', dsl: 'PARTIAL', style: modern });
    const { sync, deps, last } = setup({ decode });
    await sync.load('#v=1&d=ab!');
    expect(deps.replaceFragment).toHaveBeenCalledWith(fragmentFor('PARTIAL', modern));
    expect(last()).toMatchObject({ stale: false, message: 'Damaged.' });
  });

  it('leaves the editor empty when nothing is recoverable', async () => {
    const decode = async (): Promise<DecodeResult> => ({ status: 'error', reason: 'corrupt', message: 'Damaged.', dsl: null, style: modern });
    const { sync, loads } = setup({ decode });
    await sync.load('#v=1&d=!!');
    expect(loads).toEqual([{ dsl: '', style: modern, message: 'Damaged.' }]);
  });

  it('treats a rejected decode as an unreadable link with default style', async () => {
    const { sync, loads } = setup({
      decode: async () => {
        throw new Error('boom');
      },
    });
    await sync.load('#v=1&d=x');
    expect(loads).toEqual([{ dsl: '', style: DEFAULT_STYLE, message: 'This link could not be read: boom' }]);
  });
});
