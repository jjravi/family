import type { DecodeResult } from '../codec/types';
import type { Diagnostic, Tree } from '../model/types';
import type { PosterInput, PosterResult } from '../pipeline';
import { DEFAULT_STYLE, type LayoutId, type Orientation, type PageGeometry, type Style } from '../style';
import { debounce } from './debounce';
import { errorMessage } from './text';

/** Delay between the last keystroke and the parse (spec "UI"). */
export const EDIT_DEBOUNCE_MS = 300;

/** A successful render: the poster on screen is always the latest one of these. */
export interface Poster {
  /** The DSL and style it was drawn from. */
  dsl: string;
  style: Style;
  svg: string;
  page: PageGeometry;
  layout: LayoutId;
  orientation: Orientation;
  tree: Tree;
  /** Engine notices for this poster, e.g. 'link too long for QR'. */
  notices: string[];
  /** The URL in its QR corner and the address bar; null when encoding failed. */
  shareUrl: string | null;
}

/** What the UI shows after an update. */
export interface SyncState {
  /** The editor text this state describes, and the style it was drawn with. */
  dsl: string;
  style: Style;
  /** Diagnostics for `dsl`, sorted by line. */
  diagnostics: Diagnostic[];
  /** True when `dsl` could not be drawn: `poster`, if any, is the last good one and shows dimmed. */
  stale: boolean;
  poster: Poster | null;
  /** Problems not tied to a line: why `dsl` could not be drawn, or why the link was not updated. */
  notices: string[];
  /** Focus count of `dsl`, or of the poster when `dsl` has no usable focus. */
  focusCount: number;
  /** One-line status from loading the link (decode error or ignored params); cleared by the next user change. */
  message: string | null;
}

export interface SyncDeps {
  decode(fragment: string): Promise<DecodeResult>;
  encode(dsl: string, style: Style): Promise<string>;
  /** renderPoster with the page's text measurer. */
  render(input: PosterInput): PosterResult;
  /** origin + pathname; share URLs are `${shareBase()}#${fragment}`. */
  shareBase(): string;
  /** Points the address bar at `${shareBase()}#${fragment}` without adding a history entry. */
  replaceFragment(fragment: string): void;
  /** Resolves once rendering may start (fonts loaded, measurer ready). */
  ready?: Promise<unknown>;
  /** Loaded when the URL holds no tree. */
  sampleDsl: string;
  debounceMs?: number;
}

export interface SyncEvents {
  /** A link (or the sample) was loaded: show its DSL in the editor and its style in the options bar. */
  loaded(dsl: string, style: Style, message: string | null): void;
  /** A new state is ready to show. */
  updated(state: SyncState): void;
}

/** Owns the editor text, the style, the URL, and the poster on screen. */
export interface Sync {
  /** Decodes a URL fragment (location.hash) into the editor and style, then renders. */
  load(fragment: string): Promise<void>;
  /** The user typed: render after the debounce. */
  edit(dsl: string): void;
  /** A command replaced the text (Clear, Load example, Tidy, fenced paste): render now. */
  replace(dsl: string): Promise<void>;
  /** A style control changed: render and rewrite the URL now. */
  setStyle(style: Style): Promise<void>;
  /** Runs a waiting edit now and resolves when the latest update has settled. */
  flush(): Promise<void>;
  /** True when no edit is waiting and no update is running: the URL and poster match the latest input. */
  readonly idle: boolean;
  readonly dsl: string;
  readonly style: Style;
  /** The last state emitted, or null before the first update. */
  readonly state: SyncState | null;
}

interface Drawn {
  result: PosterResult;
  fragment: string | null;
  shareUrl: string | null;
  /** Why the share link could not be built, if it could not. */
  failure: string | null;
}

const STYLE_KEYS = Object.keys(DEFAULT_STYLE) as (keyof Style)[];

function styleKey(style: Style): string {
  return STYLE_KEYS.map((key) => String(style[key])).join('|');
}

/**
 * The URL lifecycle (spec "URL codec" > Lifecycle). On every update: encode the
 * text and style, render with the share URL in the QR corner, and only when the
 * render succeeds point the address bar at that URL, so it is always a valid
 * share link and failing DSL never reaches it. When the text cannot be drawn,
 * the last good poster stays (marked stale) and is redrawn when the style
 * changes, keeping the URL in step with the options bar. A sequence number
 * discards results overtaken by a newer load or update while encode or decode
 * was pending.
 */
export function createSync(deps: SyncDeps, events: SyncEvents): Sync {
  let dsl = '';
  let style: Style = { ...DEFAULT_STYLE };
  let message: string | null = null;
  let poster: Poster | null = null;
  let state: SyncState | null = null;
  let seq = 0;
  let lastKey: string | null = null;
  let running: Promise<void> = Promise.resolve();
  let active = 0;

  const run = (): Promise<void> => {
    active += 1;
    running = update().finally(() => {
      active -= 1;
    });
    return running;
  };
  const scheduled = debounce(() => void run(), deps.debounceMs ?? EDIT_DEBOUNCE_MS);

  async function draw(text: string, drawStyle: Style, ticket: number): Promise<Drawn | null> {
    let fragment: string | null = null;
    let failure: string | null = null;
    try {
      fragment = await deps.encode(text, drawStyle);
    } catch (error) {
      failure = `Could not update the share link: ${errorMessage(error)}`;
    }
    await deps.ready;
    if (ticket !== seq) return null;
    const shareUrl = fragment === null ? null : `${deps.shareBase()}#${fragment}`;
    return { result: deps.render({ dsl: text, style: drawStyle, shareUrl }), fragment, shareUrl, failure };
  }

  function accept(text: string, drawStyle: Style, drawn: Drawn): Poster | null {
    const { result } = drawn;
    if (!result.ok || result.svg === null || !result.page || !result.layout || !result.orientation || !result.tree) {
      return null;
    }
    if (drawn.fragment !== null) deps.replaceFragment(drawn.fragment);
    return {
      dsl: text,
      style: drawStyle,
      svg: result.svg,
      page: result.page,
      layout: result.layout,
      orientation: result.orientation,
      tree: result.tree,
      notices: result.notices,
      shareUrl: drawn.shareUrl,
    };
  }

  async function update(): Promise<void> {
    const text = dsl;
    const drawStyle = style;
    const key = `${styleKey(drawStyle)}\n${text}`;
    if (key === lastKey) return;
    lastKey = key;
    const ticket = ++seq;

    const drawn = await draw(text, drawStyle, ticket);
    if (!drawn) return;
    const notices = drawn.failure ? [drawn.failure] : [];
    const fresh = accept(text, drawStyle, drawn);
    if (fresh) poster = fresh;
    else {
      notices.push(...drawn.result.notices);
      if (poster && poster.dsl !== text && styleKey(poster.style) !== styleKey(drawStyle)) {
        const restyled = await draw(poster.dsl, drawStyle, ticket);
        if (!restyled) return;
        const again = accept(poster.dsl, drawStyle, restyled);
        if (again) poster = again;
        else notices.push(...restyled.result.notices);
        if (restyled.failure) notices.push(restyled.failure);
      }
    }

    state = {
      dsl: text,
      style: drawStyle,
      diagnostics: drawn.result.diagnostics,
      stale: !fresh,
      poster,
      notices: [...new Set(notices)],
      focusCount: drawn.result.focusCount || (poster?.tree.focus.length ?? 0),
      message,
    };
    events.updated(state);
  }

  async function load(fragment: string): Promise<void> {
    scheduled.cancel();
    const ticket = ++seq;
    lastKey = null;
    let decoded: DecodeResult;
    try {
      decoded = await deps.decode(fragment);
    } catch (error) {
      const unreadable = `This link could not be read: ${errorMessage(error)}`;
      decoded = { status: 'error', reason: 'corrupt', message: unreadable, dsl: null, style: { ...DEFAULT_STYLE } };
    }
    if (ticket !== seq) return;

    style = { ...decoded.style };
    if (decoded.status === 'empty') {
      dsl = deps.sampleDsl;
      message = null;
    } else if (decoded.status === 'ok') {
      dsl = decoded.dsl;
      message = decoded.warnings.length > 0 ? decoded.warnings.join(' ') : null;
    } else {
      dsl = decoded.dsl ?? '';
      message = decoded.message;
    }
    events.loaded(dsl, style, message);
    await run();
  }

  return {
    load,
    edit(text) {
      dsl = text;
      message = null;
      scheduled();
    },
    replace(text) {
      dsl = text;
      message = null;
      scheduled.cancel();
      return run();
    },
    setStyle(next) {
      style = { ...next };
      message = null;
      scheduled.cancel();
      return run();
    },
    flush() {
      scheduled.flush();
      return running;
    },
    get idle() {
      return active === 0 && !scheduled.pending;
    },
    get dsl() {
      return dsl;
    },
    get style() {
      return style;
    },
    get state() {
      return state;
    },
  };
}
